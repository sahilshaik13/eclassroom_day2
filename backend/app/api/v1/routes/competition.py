from uuid import UUID
from datetime import date, datetime
from types import SimpleNamespace
from typing import List, Optional, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from app.core.deps import get_current_user, TokenData, RequireRole, RequireActiveTenant
from app.core.response import success, error
from app.core import cache_keys, cache_ttl
from app.core.cache_service import get_or_set_cache, cache_delete
from app.core.db_async import run_sync
from app.db.supabase import get_user_client
from app.db.supabase_execute import execute_with_retry, first_row_from_response
from app.services.realtime_events import (
    broadcast_competition_created,
    broadcast_competition_exam_active_changed,
    broadcast_competition_registration,
    broadcast_competition_score_entered,
    broadcast_competition_submitted,
)

router = APIRouter(prefix="", tags=["competitions"])


def _strip_null_fields(data: dict) -> dict:
    """Omit None so optional columns (e.g. end_date) are not sent as null on create."""
    return {k: v for k, v in data.items() if v is not None}


def _is_postgrest_unknown_table_error(exc: BaseException) -> bool:
    """True when PostgREST schema cache has no such table (migration not applied yet)."""
    if getattr(exc, "code", None) == "PGRST205":
        return True
    t = str(exc).lower()
    return "pgrst205" in t or ("could not find the table" in t and "schema cache" in t)


def _refresh_competition_lead_teacher(admin: Any, competition_id: str) -> None:
    """assigned_teacher_id = first setup teacher, else first grader, else null."""
    su_row = None
    try:
        su_res = execute_with_retry(
            admin.table("competition_setup_teachers")
            .select("teacher_id")
            .eq("competition_id", competition_id)
            .order("created_at", desc=False)
            .limit(1),
            label=f"competition_setup_teachers lead competition_id={competition_id}",
        )
        su_row = first_row_from_response(su_res)
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    if su_row and su_row.get("teacher_id"):
        execute_with_retry(
            admin.table("competitions")
            .update({"assigned_teacher_id": su_row["teacher_id"]})
            .eq("id", competition_id),
            label=f"competitions assigned_teacher_id competition_id={competition_id}",
        )
        return
    gu_res = execute_with_retry(
        admin.table("competition_graders")
        .select("teacher_id")
        .eq("competition_id", competition_id)
        .order("created_at", desc=False)
        .limit(1),
        label=f"competition_graders lead competition_id={competition_id}",
    )
    gu_row = first_row_from_response(gu_res)
    lead = gu_row.get("teacher_id") if gu_row else None
    execute_with_retry(
        admin.table("competitions")
        .update({"assigned_teacher_id": lead})
        .eq("id", competition_id),
        label=f"competitions clear assigned_teacher_id competition_id={competition_id}",
    )


def _sync_competition_graders(admin: Any, competition_id: str, tenant_id: str, teacher_ids: List[str]) -> None:
    execute_with_retry(
        admin.table("competition_graders").delete().eq("competition_id", competition_id),
        label=f"competition_graders delete competition_id={competition_id}",
    )
    rows = [
        {"competition_id": competition_id, "tenant_id": tenant_id, "teacher_id": tid}
        for tid in teacher_ids
        if tid
    ]
    if rows:
        execute_with_retry(
            admin.table("competition_graders").insert(rows),
            label=f"competition_graders insert competition_id={competition_id}",
        )
    _refresh_competition_lead_teacher(admin, competition_id)


def _sync_competition_setup_teachers(admin: Any, competition_id: str, tenant_id: str, teacher_ids: List[str]) -> None:
    try:
        execute_with_retry(
            admin.table("competition_setup_teachers").delete().eq("competition_id", competition_id),
            label=f"competition_setup_teachers delete competition_id={competition_id}",
        )
        rows = [
            {"competition_id": competition_id, "tenant_id": tenant_id, "teacher_id": tid}
            for tid in teacher_ids
            if tid
        ]
        if rows:
            execute_with_retry(
                admin.table("competition_setup_teachers").insert(rows),
                label=f"competition_setup_teachers insert competition_id={competition_id}",
            )
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    _refresh_competition_lead_teacher(admin, competition_id)


def _batch_expected_grader_user_ids(admin: Any, competition_ids: List[str]) -> dict[str, List[str]]:
    """One round-trip for graders + fallback assigned_teacher_id per competition."""
    if not competition_ids:
        return {}
    cids = list(dict.fromkeys(str(x) for x in competition_ids))
    out: dict[str, List[str]] = {cid: [] for cid in cids}
    gr = execute_with_retry(
        admin.table("competition_graders")
        .select("competition_id, teacher_id")
        .in_("competition_id", cids),
        label="batch_expected_graders",
    )
    by_comp: dict[str, List[str]] = {}
    for row in gr.data or []:
        cid = str(row["competition_id"])
        by_comp.setdefault(cid, []).append(str(row["teacher_id"]))
    need_fallback = [cid for cid in cids if not by_comp.get(cid)]
    assigned: dict[str, str] = {}
    if need_fallback:
        cr = execute_with_retry(
            admin.table("competitions")
            .select("id, assigned_teacher_id")
            .in_("id", need_fallback),
            label="batch_comp_assigned_teacher",
        )
        for row in cr.data or []:
            aid = row.get("assigned_teacher_id")
            if aid:
                assigned[str(row["id"])] = str(aid)
    for cid in cids:
        if by_comp.get(cid):
            out[cid] = by_comp[cid]
        elif assigned.get(cid):
            out[cid] = [assigned[cid]]
    return out


def _expected_grader_user_ids(admin: Any, competition_id: str) -> List[str]:
    return _batch_expected_grader_user_ids(admin, [competition_id]).get(str(competition_id), [])


def _all_expected_graders_scored(
    admin: Any, competition_id: str, registration_id: str, expected: List[str]
) -> bool:
    if len(expected) < 2:
        return False
    scores = (
        admin.table("competition_grader_scores")
        .select("grader_user_id")
        .eq("competition_id", competition_id)
        .eq("registration_id", registration_id)
        .execute()
    )
    have = {str(s["grader_user_id"]) for s in (scores.data or [])}
    return all(e in have for e in expected)


def _resolve_registration_release_flag(
    admin: Any, competition_id: str, registration_id: str, body_release_results: bool
) -> bool:
    expected = _expected_grader_user_ids(admin, competition_id)
    if len(expected) >= 2:
        return False
    if len(expected) == 1:
        return bool(body_release_results)
    return bool(body_release_results)


def _registration_publish_ready(
    admin: Any, competition_id: str, registration_id: str, expected: Optional[List[str]] = None
) -> bool:
    expected = expected if expected is not None else _expected_grader_user_ids(admin, competition_id)
    if len(expected) >= 2:
        return _all_expected_graders_scored(admin, competition_id, registration_id, expected)
    res = (
        admin.table("competition_results")
        .select("id")
        .eq("competition_id", competition_id)
        .eq("registration_id", registration_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def _publish_summary_from_data(
    expected: List[str],
    regs: List[dict],
    score_rows: List[dict],
    result_reg_ids: set[str],
) -> dict:
    expected_set = set(expected)
    submitted = [r for r in regs if r.get("is_submitted")]
    by_grader: dict[str, set[str]] = {gid: set() for gid in expected}
    for row in score_rows:
        grader_id = str(row.get("grader_user_id"))
        if grader_id in expected_set:
            by_grader.setdefault(grader_id, set()).add(str(row["registration_id"]))
    ready = 0
    unpublished_ready = 0
    pending = 0
    unpublished_ready_ids: List[str] = []
    submitted_ids = {str(reg["id"]) for reg in submitted}
    corrected_graders = [
        grader_id
        for grader_id in expected
        if submitted_ids and submitted_ids.issubset(by_grader.get(grader_id, set()))
    ]
    pending_graders = [grader_id for grader_id in expected if grader_id not in corrected_graders]
    for reg in submitted:
        reg_id = str(reg["id"])
        if len(expected) >= 2:
            is_ready = all(reg_id in by_grader.get(gid, set()) for gid in expected)
        else:
            is_ready = reg_id in result_reg_ids
        if is_ready:
            ready += 1
            if not reg.get("results_released"):
                unpublished_ready += 1
                unpublished_ready_ids.append(reg_id)
        else:
            pending += 1
    return {
        "submitted_registrations_count": len(submitted),
        "publish_ready_count": ready,
        "unpublished_ready_count": unpublished_ready,
        "pending_publish_count": pending,
        "corrected_grader_ids": corrected_graders,
        "pending_grader_ids": pending_graders,
        "can_publish_results": len(submitted) > 0 and pending == 0 and unpublished_ready > 0,
        "unpublished_ready_registration_ids": unpublished_ready_ids,
    }


def _batch_publish_summaries(admin: Any, competition_ids: List[str]) -> dict[str, dict]:
    if not competition_ids:
        return {}
    cids = list(dict.fromkeys(str(x) for x in competition_ids))
    expected_map = _batch_expected_grader_user_ids(admin, cids)
    regs_res = execute_with_retry(
        admin.table("competition_registrations")
        .select("id, competition_id, is_submitted, results_released")
        .in_("competition_id", cids),
        label="batch_competition_regs_summary",
    )
    scores_res = execute_with_retry(
        admin.table("competition_grader_scores")
        .select("competition_id, registration_id, grader_user_id")
        .in_("competition_id", cids),
        label="batch_competition_grader_scores_summary",
    )
    results_res = execute_with_retry(
        admin.table("competition_results")
        .select("competition_id, registration_id")
        .in_("competition_id", cids),
        label="batch_competition_results_summary",
    )
    regs_by: dict[str, List[dict]] = {cid: [] for cid in cids}
    for row in regs_res.data or []:
        regs_by.setdefault(str(row["competition_id"]), []).append(row)
    scores_by: dict[str, List[dict]] = {cid: [] for cid in cids}
    for row in scores_res.data or []:
        scores_by.setdefault(str(row["competition_id"]), []).append(row)
    results_by: dict[str, set[str]] = {cid: set() for cid in cids}
    for row in results_res.data or []:
        results_by.setdefault(str(row["competition_id"]), set()).add(str(row["registration_id"]))
    summaries: dict[str, dict] = {}
    for cid in cids:
        expected = expected_map.get(cid, [])
        result_ids = results_by.get(cid, set()) if len(expected) < 2 else set()
        summaries[cid] = _publish_summary_from_data(
            expected,
            regs_by.get(cid, []),
            scores_by.get(cid, []),
            result_ids,
        )
    return summaries


def _public_publish_summary(summary: dict) -> dict:
    out = dict(summary)
    out.pop("unpublished_ready_registration_ids", None)
    return out


def _competition_publish_summary(admin: Any, competition_id: str) -> dict:
    cid = str(competition_id)
    batch = _batch_publish_summaries(admin, [cid])
    return _public_publish_summary(batch.get(cid, {}))


def _repair_stale_collaborative_release_for_registration(
    admin: Any, competition_id: str, registration_id: str, row: dict
) -> None:
    """Clear premature Publish: multi-grader + results_released but not all graders scored yet."""
    _batch_repair_stale_collaborative_releases(admin, [row])


def _batch_repair_stale_collaborative_releases(admin: Any, regs: List[dict]) -> None:
    if not regs:
        return
    cids = list({str(r["competition_id"]) for r in regs if r.get("competition_id")})
    expected_map = _batch_expected_grader_user_ids(admin, cids)
    candidates: List[tuple[str, str, List[str]]] = []
    for r in regs:
        cid = str(r.get("competition_id") or "")
        if not cid:
            continue
        expected = expected_map.get(cid, [])
        if len(expected) < 2 or not r.get("results_released"):
            continue
        candidates.append((cid, str(r["id"]), expected))
    if not candidates:
        return
    repair_cids = list({c for c, _, _ in candidates})
    scores_res = execute_with_retry(
        admin.table("competition_grader_scores")
        .select("competition_id, registration_id, grader_user_id")
        .in_("competition_id", repair_cids),
        label="batch_repair_grader_scores",
    )
    scored: dict[tuple[str, str], set[str]] = {}
    for row in scores_res.data or []:
        key = (str(row["competition_id"]), str(row["registration_id"]))
        scored.setdefault(key, set()).add(str(row["grader_user_id"]))
    stale_ids: List[str] = []
    for cid, reg_id, expected in candidates:
        have = scored.get((cid, reg_id), set())
        if all(e in have for e in expected):
            continue
        stale_ids.append(reg_id)
    if not stale_ids:
        return
    execute_with_retry(
        admin.table("competition_registrations")
        .update({"results_released": False})
        .in_("id", stale_ids),
        label="batch_repair_results_released",
    )
    stale_set = set(stale_ids)
    for r in regs:
        if str(r.get("id")) in stale_set:
            r["results_released"] = False


def _batch_teacher_competition_permissions(
    admin: Any, competition_ids: List[str], teacher_user_id: str
) -> dict[str, tuple[bool, bool]]:
    """Batch my_can_grade / my_can_setup for teacher competition list."""
    if not competition_ids:
        return {}
    uid = str(teacher_user_id)
    cids = list(dict.fromkeys(str(x) for x in competition_ids))
    grade_mine: set[str] = set()
    grade_any: set[str] = set()
    gr = execute_with_retry(
        admin.table("competition_graders")
        .select("competition_id, teacher_id")
        .in_("competition_id", cids),
        label="batch_teacher_graders",
    )
    for row in gr.data or []:
        cid = str(row["competition_id"])
        grade_any.add(cid)
        if str(row["teacher_id"]) == uid:
            grade_mine.add(cid)
    setup_mine: set[str] = set()
    setup_any: set[str] = set()
    try:
        su = execute_with_retry(
            admin.table("competition_setup_teachers")
            .select("competition_id, teacher_id")
            .in_("competition_id", cids),
            label="batch_teacher_setup",
        )
        for row in su.data or []:
            cid = str(row["competition_id"])
            setup_any.add(cid)
            if str(row["teacher_id"]) == uid:
                setup_mine.add(cid)
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    assigned: dict[str, str] = {}
    cr = execute_with_retry(
        admin.table("competitions").select("id, assigned_teacher_id").in_("id", cids),
        label="batch_teacher_comp_assigned",
    )
    for row in cr.data or []:
        aid = row.get("assigned_teacher_id")
        if aid:
            assigned[str(row["id"])] = str(aid)
    out: dict[str, tuple[bool, bool]] = {}
    for cid in cids:
        can_grade = cid in grade_mine or (cid not in grade_any and assigned.get(cid) == uid)
        if cid in setup_mine:
            can_setup = True
        elif cid in setup_any:
            can_setup = False
        else:
            can_setup = can_grade
        out[cid] = (can_grade, can_setup)
    return out


def _teacher_can_setup_competition(admin: Any, competition_id: str, teacher_user_id: str) -> bool:
    try:
        g = (
            admin.table("competition_setup_teachers")
            .select("id")
            .eq("competition_id", competition_id)
            .eq("teacher_id", teacher_user_id)
            .limit(1)
            .execute()
        )
        if g.data:
            return True
        has_any = (
            admin.table("competition_setup_teachers")
            .select("id")
            .eq("competition_id", competition_id)
            .limit(1)
            .execute()
        )
        if has_any.data:
            return False
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    return _teacher_can_grade_competition(admin, competition_id, teacher_user_id)


def _teacher_can_grade_competition(admin: Any, competition_id: str, teacher_user_id: str) -> bool:
    g = (
        admin.table("competition_graders")
        .select("id")
        .eq("competition_id", competition_id)
        .eq("teacher_id", teacher_user_id)
        .limit(1)
        .execute()
    )
    if g.data:
        return True
    has_any = (
        admin.table("competition_graders")
        .select("id")
        .eq("competition_id", competition_id)
        .limit(1)
        .execute()
    )
    if has_any.data:
        return False
    comp = (
        admin.table("competitions")
        .select("assigned_teacher_id")
        .eq("id", competition_id)
        .maybe_single()
        .execute()
    )
    return bool(comp.data and comp.data.get("assigned_teacher_id") == teacher_user_id)


def _recompute_official_competition_result(
    admin: Any, competition_id: str, registration_id: str, tenant_id: str
) -> None:
    scores_res = (
        admin.table("competition_grader_scores")
        .select("*")
        .eq("competition_id", competition_id)
        .eq("registration_id", registration_id)
        .execute()
    )
    rows = scores_res.data or []
    expected_ids = set(_expected_grader_user_ids(admin, competition_id))
    if expected_ids:
        rows = [r for r in rows if str(r.get("grader_user_id")) in expected_ids]
    if not rows:
        return
    avg = round(sum(int(s["score"]) for s in rows) / len(rows))
    uids = list({str(s["grader_user_id"]) for s in rows if s.get("grader_user_id")})
    names_map: dict[str, str] = {}
    if uids:
        ures = admin.table("users").select("id, name").in_("id", uids).execute()
        for u in ures.data or []:
            names_map[str(u["id"])] = (u.get("name") or "").strip() or "Evaluator"
    lines: List[str] = []
    for s in sorted(rows, key=lambda x: names_map.get(str(x.get("grader_user_id")), "")):
        nm = names_map.get(str(s.get("grader_user_id")), "Evaluator")
        rm = (s.get("remarks") or "").strip()
        lines.append(f"{nm}: {s['score']}/100" + (f" — {rm}" if rm else ""))
    remarks = f"Average of {len(rows)} evaluator(s): {avg}/100.\n" + "\n".join(lines)
    remarks = remarks[:8000]
    admin.table("competition_results").upsert(
        {
            "competition_id": competition_id,
            "tenant_id": tenant_id,
            "registration_id": registration_id,
            "score": avg,
            "remarks": remarks,
            "recorded_by": None,
        },
        on_conflict="competition_id, registration_id",
    ).execute()


def _enrich_competitions_with_graders(admin: Any, competitions: List[dict]) -> None:
    if not competitions:
        return
    ids = [c["id"] for c in competitions]
    gr = execute_with_retry(
        admin.table("competition_graders")
        .select("competition_id, teacher_id")
        .in_("competition_id", ids),
        label="competition_graders_batch",
    )
    user_ids = list({str(g["teacher_id"]) for g in (gr.data or [])})
    names: dict[str, str] = {}
    if user_ids:
        ur = execute_with_retry(
            admin.table("users").select("id, name").in_("id", user_ids),
            label="competition_grader_users",
        )
        for u in ur.data or []:
            names[str(u["id"])] = (u.get("name") or "").strip() or "Teacher"
    by_comp: dict[str, List[dict]] = {}
    for row in gr.data or []:
        cid = str(row["competition_id"])
        tid = str(row["teacher_id"])
        by_comp.setdefault(cid, []).append({"teacher_id": tid, "name": names.get(tid, "Teacher")})
    for c in competitions:
        c["graders"] = by_comp.get(str(c["id"]), [])


def _enrich_competitions_with_setup_teachers(admin: Any, competitions: List[dict]) -> None:
    if not competitions:
        return
    ids = [c["id"] for c in competitions]
    try:
        gr = execute_with_retry(
            admin.table("competition_setup_teachers")
            .select("competition_id, teacher_id")
            .in_("competition_id", ids),
            label="competition_setup_teachers_batch",
        )
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
        for c in competitions:
            c["setup_teachers"] = []
        return
    user_ids = list({str(g["teacher_id"]) for g in (gr.data or [])})
    names: dict[str, str] = {}
    if user_ids:
        ur = execute_with_retry(
            admin.table("users").select("id, name").in_("id", user_ids),
            label="competition_setup_users",
        )
        for u in ur.data or []:
            names[str(u["id"])] = (u.get("name") or "").strip() or "Teacher"
    by_comp: dict[str, List[dict]] = {}
    for row in gr.data or []:
        cid = str(row["competition_id"])
        tid = str(row["teacher_id"])
        by_comp.setdefault(cid, []).append({"teacher_id": tid, "name": names.get(tid, "Teacher")})
    for c in competitions:
        c["setup_teachers"] = by_comp.get(str(c["id"]), [])


def _enrich_competitions_with_publish_state(admin: Any, competitions: List[dict]) -> None:
    if not competitions:
        return
    summaries = _batch_publish_summaries(admin, [str(c["id"]) for c in competitions])
    for c in competitions:
        c.update(_public_publish_summary(summaries.get(str(c["id"]), {})))


# ── Schemas ────────────────────────────────────────────────────────

def _coerce_optional_date(v: Any) -> Optional[date]:
    if v is None or v == "":
        return None
    return v


def _require_start_date(v: Any) -> date:
    parsed = _coerce_optional_date(v)
    if parsed is None:
        raise ValueError("start_date is required")
    return parsed


class CompetitionCreate(BaseModel):
    title: str
    category: str = "mixed"  # legacy: mcq | hifz | khirat; new exams use per-question types in content
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    assigned_teacher_id: Optional[UUID] = None
    grader_teacher_ids: Optional[List[UUID]] = None
    setup_teacher_ids: Optional[List[UUID]] = None
    status: str = "draft"
    content: Optional[List] = None
    settings: Optional[dict] = None

    @field_validator("start_date", mode="before")
    @classmethod
    def require_start_date(cls, v: Any) -> date:
        return _require_start_date(v)

    @field_validator("end_date", mode="before")
    @classmethod
    def empty_end_date_to_none(cls, v: Any) -> Any:
        return _coerce_optional_date(v)


class CompetitionUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assigned_teacher_id: Optional[UUID] = None
    grader_teacher_ids: Optional[List[UUID]] = None
    setup_teacher_ids: Optional[List[UUID]] = None
    status: Optional[str] = None
    content: Optional[List] = None
    settings: Optional[dict] = None
    is_exam_active: Optional[bool] = None

    @field_validator("start_date", mode="before")
    @classmethod
    def require_start_date_on_update(cls, v: Any) -> Any:
        if v is None:
            return None
        return _require_start_date(v)

    @field_validator("end_date", mode="before")
    @classmethod
    def empty_end_date_to_none(cls, v: Any) -> Any:
        return _coerce_optional_date(v)


class CompetitionRegister(BaseModel):
    phone: str
    name: str
    tenant_id: UUID


class ResultSubmit(BaseModel):
    registration_id: UUID
    score: int
    remarks: Optional[str] = None


class ResultUpdate(BaseModel):
    score: Optional[int] = None
    remarks: Optional[str] = None


class ExamSubmission(BaseModel):
    responses: List[dict] # [{index: 0, answer: 1}, {index: 1, audio_url: '...'}]
    metadata: Optional[dict] = None


class ExamDraftSave(BaseModel):
    """In-progress exam answers (stored on registration until final submit)."""
    responses: List[dict] = []
    phase: Optional[str] = None


def _registration_select_with_embeds(include_grader_scores: bool = True) -> str:
    base = "*, competitions(*), competition_results(*)"
    if include_grader_scores:
        return f"{base}, competition_grader_scores(*)"
    return base


def _competition_cache_keys_for_exam_change(
    admin: Any, competition_id: str, tenant_id: str
) -> List[str]:
    """Admin list, public info, and each registered student's competition cache."""
    keys = [
        cache_keys.competitions_list(tenant_id),
        cache_keys.competition_info(competition_id),
    ]
    try:
        regs = (
            admin.table("competition_registrations")
            .select("students(user_id)")
            .eq("competition_id", competition_id)
            .execute()
        )
        for row in regs.data or []:
            students = row.get("students") or {}
            uid = students.get("user_id")
            if uid:
                keys.append(cache_keys.student_competitions(str(uid)))
    except Exception:
        pass
    return keys


def _query_registrations_embedded(admin: Any, column: str, value: str) -> List[dict]:
    try:
        res = (
            admin.table("competition_registrations")
            .select(_registration_select_with_embeds(True))
            .eq(column, value)
            .execute()
        )
        return list(res.data or [])
    except Exception as exc:
        if not (
            _is_postgrest_unknown_table_error(exc)
            or "competition_grader_scores" in str(exc).lower()
        ):
            raise
        res = (
            admin.table("competition_registrations")
            .select(_registration_select_with_embeds(False))
            .eq(column, value)
            .execute()
        )
        rows = list(res.data or [])
        for r in rows:
            r.setdefault("competition_grader_scores", [])
        return rows


def _student_identity(admin: Any, user_id: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Return (user_phone, student_id, student_phone)."""
    user_phone: Optional[str] = None
    student_id: Optional[str] = None
    student_phone: Optional[str] = None
    try:
        ur = admin.table("users").select("phone").eq("id", user_id).limit(1).execute()
        if ur.data:
            user_phone = ur.data[0].get("phone")
    except Exception:
        pass
    try:
        sr = admin.table("students").select("id, phone").eq("user_id", user_id).limit(1).execute()
        if sr.data:
            student_id = str(sr.data[0]["id"])
            student_phone = sr.data[0].get("phone")
    except Exception:
        pass
    return user_phone, student_id, student_phone


def _find_student_registration(
    admin: Any, competition_id: str, user_id: str
) -> Optional[dict]:
    user_phone, student_id, student_phone = _student_identity(admin, user_id)
    if student_id:
        r = (
            admin.table("competition_registrations")
            .select("id, competition_id, is_submitted, responses")
            .eq("competition_id", competition_id)
            .eq("student_id", student_id)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    for phone in (user_phone, student_phone):
        if not phone:
            continue
        r = (
            admin.table("competition_registrations")
            .select("id, competition_id, is_submitted, responses")
            .eq("competition_id", competition_id)
            .eq("phone", phone)
            .limit(1)
            .execute()
        )
        if r.data:
            return r.data[0]
    return None


def _parse_exam_draft_payload(stored: Any) -> Optional[dict]:
    if not stored:
        return None
    if isinstance(stored, dict) and stored.get("_exam_draft"):
        return stored
    return None


def _load_student_competitions_list(admin: Any, user_id: str) -> List[dict]:
    user_phone, student_id, student_phone = _student_identity(admin, user_id)
    all_regs: List[dict] = []
    seen_ids: set[str] = set()

    def _merge(rows: List[dict]) -> None:
        for r in rows:
            rid = str(r.get("id"))
            if rid and rid not in seen_ids:
                seen_ids.add(rid)
                all_regs.append(r)

    if student_id:
        _merge(_query_registrations_embedded(admin, "student_id", student_id))
    if user_phone:
        _merge(_query_registrations_embedded(admin, "phone", user_phone))
    if student_phone and student_phone != user_phone:
        _merge(_query_registrations_embedded(admin, "phone", student_phone))

    try:
        _batch_repair_stale_collaborative_releases(admin, all_regs)
    except Exception:
        pass
    return all_regs

class TeacherEvaluationSubmit(BaseModel):
    score: int
    remarks: Optional[str] = None
    responses_override: Optional[List[dict]] = None
    release_results: bool = False


# ── Public Endpoints ───────────────────────────────────────────────

@router.get("/competitions/{competition_id}/info")
async def get_competition_info(competition_id: UUID):
    from app.db.supabase import get_admin_client
    cid = str(competition_id)
    cache_key = cache_keys.competition_info(cid)

    def _load():
        admin = get_admin_client()
        res = (
            admin.table("competitions")
            .select(
                "id, title, description, start_date, end_date, status, tenant_id, category, content, settings, is_exam_active"
            )
            .eq("id", cid)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        return res.data[0]

    payload, _hit = await get_or_set_cache(cache_key, cache_ttl.COMPETITION_INFO, lambda: run_sync(_load))
    if payload is None:
        return error("NOT_FOUND", "Competition not found", 404)
    return success(payload)


# ── Post-OTP Registrant Endpoint ───────────────────────────────────

@router.post("/competitions/{competition_id}/register")
async def register_competition(
    competition_id: UUID,
    body: CompetitionRegister,
    token: TokenData = Depends(get_current_user)
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    tenant_id_str = str(body.tenant_id)
    comp_id_str = str(competition_id)
    
    # If phone is missing from body (e.g. authed user didn't have it in client state), fetch it
    real_phone = body.phone
    if not real_phone:
        user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
        if user_res and user_res.data:
            real_phone = user_res.data.get("phone", "")
            
    # Check if student exists — try by phone first, then by user_id from JWT
    student_id = None
    stu_res = (
        admin.table("students")
        .select("id")
        .eq("phone", real_phone)
        .eq("tenant_id", tenant_id_str)
        .maybe_single()
        .execute()
    )
    if stu_res and stu_res.data:
        student_id = stu_res.data["id"]
    
    # Fallback: check by user_id from the JWT token
    if not student_id:
        stu_res2 = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
        if stu_res2 and stu_res2.data:
            student_id = stu_res2.data["id"]

    try:
        res = admin.table("competition_registrations").upsert({
            "competition_id": comp_id_str,
            "tenant_id": tenant_id_str,
            "phone": real_phone,
            "name": body.name,
            "student_id": student_id,
            "status": "registered"
        }, on_conflict="competition_id, phone").execute()

        # Broadcast real-time event for new registration
        if res.data and len(res.data) > 0:
            reg = res.data[0]
            await broadcast_competition_registration(
                tenant_id=tenant_id_str,
                competition_id=comp_id_str,
                student_id=student_id or str(token.user_id),
                registration_id=reg["id"],
                student_name=body.name,
            )

        return success(res.data[0] if res.data else {"message": "Registered"})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


# ── Teacher + Admin Endpoints ──────────────────────────────────────

@router.get("/competitions/{competition_id}/registrations")
async def get_competition_registrations(
    competition_id: UUID, 
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Only admins or teachers can view registrations", 403)
        
    # Using service role pattern for competitions so we query via admin client 
    # but ensure it's limited to the tenant.
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    # Verify ownership or assignment
    comp_res = admin.table("competitions").select("tenant_id, assigned_teacher_id").eq("id", str(competition_id)).maybe_single().execute()
    if not comp_res.data or comp_res.data["tenant_id"] != str(token.tenant_id):
        return error("NOT_FOUND", "Competition not found or access denied", 404)
        
    uid = str(token.user_id)
    can_grade = _teacher_can_grade_competition(admin, str(competition_id), uid)
    can_setup = _teacher_can_setup_competition(admin, str(competition_id), uid)
    if token.role == "teacher" and not can_grade and not can_setup:
        return error("FORBIDDEN", "Not assigned to this competition", 403)

    regs = (
        admin.table("competition_registrations")
        .select("*, competition_results(*), competition_grader_scores(*)")
        .eq("competition_id", str(competition_id))
        .execute()
    )
    rows = regs.data or []
    g_uids = list(
        {
            str(s["grader_user_id"])
            for r in rows
            for s in (r.get("competition_grader_scores") or [])
            if s.get("grader_user_id")
        }
    )
    gnames: dict[str, str] = {}
    if g_uids:
        ur = admin.table("users").select("id, name").in_("id", g_uids).execute()
        for u in ur.data or []:
            gnames[str(u["id"])] = (u.get("name") or "").strip() or "Evaluator"
    for r in rows:
        for s in r.get("competition_grader_scores") or []:
            s["grader_name"] = gnames.get(str(s.get("grader_user_id")), "Evaluator")
    cid = str(competition_id)
    _batch_repair_stale_collaborative_releases(admin, rows)
    exp = _expected_grader_user_ids(admin, cid)
    meta = {
        "expected_grader_count": len(exp),
        "collaborative_grading": len(exp) >= 2,
        "my_can_grade": can_grade if token.role == "teacher" else True,
        "my_can_setup": can_setup if token.role == "teacher" else True,
    }
    return success({"registrations": rows, "meta": meta})


@router.patch("/competitions/{competition_id}/registrations/{registration_id}/evaluate")
async def evaluate_participant(
    competition_id: UUID,
    registration_id: UUID,
    body: TeacherEvaluationSubmit,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    tenant_id_str = str(token.tenant_id)
    cid = str(competition_id)
    rid = str(registration_id)

    comp_chk = admin.table("competitions").select("tenant_id").eq("id", cid).maybe_single().execute()
    if not comp_chk.data or comp_chk.data["tenant_id"] != tenant_id_str:
        return error("NOT_FOUND", "Competition not found", 404)

    if token.role == "teacher" and not _teacher_can_grade_competition(admin, cid, str(token.user_id)):
        return error("FORBIDDEN", "Not assigned to grade this competition", 403)

    update_reg: dict[str, Any] = {}
    if body.responses_override is not None:
        update_reg["responses"] = body.responses_override

    admin.table("competition_grader_scores").upsert(
        {
            "competition_id": cid,
            "tenant_id": tenant_id_str,
            "registration_id": rid,
            "grader_user_id": str(token.user_id),
            "score": body.score,
            "remarks": body.remarks,
        },
        on_conflict="competition_id, registration_id, grader_user_id",
    ).execute()
    _recompute_official_competition_result(admin, cid, rid, tenant_id_str)

    update_reg["results_released"] = _resolve_registration_release_flag(
        admin, cid, rid, body.release_results
    )
    admin.table("competition_registrations").update(update_reg).eq("id", rid).eq("competition_id", cid).execute()

    res = (
        admin.table("competition_results")
        .select("*")
        .eq("competition_id", cid)
        .eq("registration_id", rid)
        .maybe_single()
        .execute()
    )
    return success(res.data if res.data else {"message": "Evaluation saved"})

@router.post("/competitions/{competition_id}/results")
async def submit_result(
    competition_id: UUID,
    body: ResultSubmit,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    cid = str(competition_id)
    tenant_id_str = str(token.tenant_id)

    comp_chk = admin.table("competitions").select("tenant_id").eq("id", cid).maybe_single().execute()
    if not comp_chk.data or comp_chk.data["tenant_id"] != tenant_id_str:
        return error("NOT_FOUND", "Competition not found", 404)
    if token.role == "teacher" and not _teacher_can_grade_competition(admin, cid, str(token.user_id)):
        return error("FORBIDDEN", "Not assigned to grade this competition", 403)

    rid = str(body.registration_id)
    admin.table("competition_grader_scores").upsert(
        {
            "competition_id": cid,
            "tenant_id": tenant_id_str,
            "registration_id": rid,
            "grader_user_id": str(token.user_id),
            "score": body.score,
            "remarks": body.remarks,
        },
        on_conflict="competition_id, registration_id, grader_user_id",
    ).execute()
    _recompute_official_competition_result(admin, cid, rid, tenant_id_str)
    released = _resolve_registration_release_flag(admin, cid, rid, False)
    admin.table("competition_registrations").update({"results_released": released}).eq("id", rid).eq("competition_id", cid).execute()

    # Get the result for broadcasting
    res = (
        admin.table("competition_results")
        .select("*, competition_registrations(student_id, student:students(id, name))")
        .eq("competition_id", cid)
        .eq("registration_id", rid)
        .maybe_single()
        .execute()
    )

    # Broadcast real-time score update
    if res.data:
        result = res.data
        reg = result.get("competition_registrations", {}) or {}
        student_id = reg.get("student_id") if isinstance(reg, dict) else None

        if student_id:
            await broadcast_competition_score_entered(
                tenant_id=tenant_id_str,
                competition_id=cid,
                student_id=student_id,
                registration_id=rid,
                score=result.get("score", 0),
                total=result.get("total", 100),
                graded_by=str(token.user_id),
            )

    return success(res.data if res.data else {"message": "Result recorded"})


@router.patch("/competitions/{competition_id}/results/{result_id}")
async def update_result(
    competition_id: UUID,
    result_id: UUID,
    body: ResultUpdate,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    update_data = {}
    if body.score is not None: update_data["score"] = body.score
    if body.remarks is not None: update_data["remarks"] = body.remarks
    
    if not update_data:
        return error("BAD_REQUEST", "Nothing to update", 400)
        
    res = admin.table("competition_results").update(update_data).eq("id", str(result_id)).eq("competition_id", str(competition_id)).execute()
    return success(res.data[0] if res.data else {"message": "Updated"})


# ── Admin-Only Endpoints ───────────────────────────────────────────

@router.post("/admin/competitions", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def create_competition(body: CompetitionCreate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    provided = body.model_dump(exclude_unset=True)
    has_explicit_graders = "grader_teacher_ids" in provided
    has_explicit_setup = "setup_teacher_ids" in provided
    data = {k: v for k, v in provided.items() if k not in ("grader_teacher_ids", "setup_teacher_ids")}
    data = _strip_null_fields(data)
    if "start_date" in data and isinstance(data["start_date"], date): data["start_date"] = data["start_date"].isoformat()
    if "end_date" in data and isinstance(data["end_date"], date): data["end_date"] = data["end_date"].isoformat()
    if "assigned_teacher_id" in data and data["assigned_teacher_id"]:
        data["assigned_teacher_id"] = str(data["assigned_teacher_id"])
    if has_explicit_graders and body.grader_teacher_ids:
        data["assigned_teacher_id"] = str(body.grader_teacher_ids[0])
    elif has_explicit_graders and not body.grader_teacher_ids:
        data["assigned_teacher_id"] = None
    if (has_explicit_graders and body.grader_teacher_ids) or data.get("assigned_teacher_id"):
        if data.get("status") == "draft":
            data["status"] = "active"
    
    data["tenant_id"] = str(token.tenant_id)
    data["created_by"] = str(token.user_id)

    try:
        res = execute_with_retry(
            admin.table("competitions").insert(data).select("*"),
            label="competitions insert",
        )
    except Exception as exc:
        err = str(exc)
        if data.get("category") == "mixed" and "category" in err.lower():
            data["category"] = "mcq"
            settings = dict(data.get("settings") or {})
            settings["exam_format"] = "form_builder"
            data["settings"] = settings
            try:
                res = execute_with_retry(
                    admin.table("competitions").insert(data).select("*"),
                    label="competitions insert mixed fallback",
                )
            except Exception as retry_exc:
                return error("INTERNAL", str(retry_exc), 500)
        else:
            return error("INTERNAL", err, 500)

    row = first_row_from_response(res)
    if not row:
        return success({"message": "Created"})
    cid = str(row["id"])
    tid = str(token.tenant_id)
    if has_explicit_graders:
        _sync_competition_graders(admin, cid, tid, [str(u) for u in (body.grader_teacher_ids or [])])
    elif body.assigned_teacher_id:
        _sync_competition_graders(admin, cid, tid, [str(body.assigned_teacher_id)])
    if has_explicit_setup:
        _sync_competition_setup_teachers(admin, cid, tid, [str(u) for u in (body.setup_teacher_ids or [])])
    elif has_explicit_graders and body.grader_teacher_ids:
        _sync_competition_setup_teachers(admin, cid, tid, [str(u) for u in body.grader_teacher_ids])
    elif body.assigned_teacher_id and not has_explicit_graders:
        _sync_competition_setup_teachers(admin, cid, tid, [str(body.assigned_teacher_id)])
    await cache_delete(cache_keys.competitions_list(str(token.tenant_id)))

    # Broadcast real-time event for new competition
    if row:
        await broadcast_competition_created(
            tenant_id=tid,
            competition_id=cid,
            competition_name=row.get("name", "New Competition"),
            created_by=str(token.user_id),
        )

    return success(row)


@router.get("/admin/competitions", dependencies=[Depends(RequireRole(["admin"]))])
async def list_admin_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    tid = str(token.tenant_id)
    cache_key = cache_keys.competitions_list(tid)

    def _load():
        admin = get_admin_client()
        res = (
            admin.table("competitions")
            .select("*, assigned_teacher:users!assigned_teacher_id(name)")
            .eq("tenant_id", tid)
            .order("created_at", desc=True)
            .execute()
        )
        rows = res.data or []
        _enrich_competitions_with_graders(admin, rows)
        _enrich_competitions_with_setup_teachers(admin, rows)
        _enrich_competitions_with_publish_state(admin, rows)
        return rows

    rows, _hit = await get_or_set_cache(cache_key, cache_ttl.ADMIN_COMPETITIONS, lambda: run_sync(_load))
    return success(rows or [])


@router.patch("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def modify_competition(competition_id: UUID, body: CompetitionUpdate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    provided = body.model_dump(exclude_unset=True)
    has_explicit_graders = "grader_teacher_ids" in provided
    has_explicit_setup = "setup_teacher_ids" in provided
    update_data = {k: v for k, v in provided.items() if k not in ("grader_teacher_ids", "setup_teacher_ids")}
    if "start_date" in update_data and isinstance(update_data["start_date"], date):
        update_data["start_date"] = update_data["start_date"].isoformat()
    if "end_date" in update_data and isinstance(update_data["end_date"], date):
        update_data["end_date"] = update_data["end_date"].isoformat()
    # Opening the exam window mirrors legacy teacher toggle: keep competition active.
    if update_data.get("is_exam_active") is True:
        update_data["status"] = "active"
    if "assigned_teacher_id" in update_data and update_data["assigned_teacher_id"]:
        update_data["assigned_teacher_id"] = str(update_data["assigned_teacher_id"])
    if has_explicit_graders and body.grader_teacher_ids:
        update_data["assigned_teacher_id"] = str(body.grader_teacher_ids[0])
    elif has_explicit_graders and not body.grader_teacher_ids:
        update_data["assigned_teacher_id"] = None
    
    # Auto-status logic
    if "assigned_teacher_id" in update_data and update_data["assigned_teacher_id"] and update_data.get("status") == "draft":
        update_data["status"] = "active"
    if has_explicit_graders and body.grader_teacher_ids and update_data.get("status") == "draft":
        update_data["status"] = "active"

    if not update_data and not has_explicit_graders and not has_explicit_setup:
        return error("BAD_REQUEST", "Nothing to update", 400)
    
    cid = str(competition_id)
    tenant_id_str = str(token.tenant_id)
    exam_toggle = "is_exam_active" in provided
    prev_row: Optional[dict] = None
    if exam_toggle:
        prev_res = execute_with_retry(
            admin.table("competitions")
            .select("is_exam_active, title, name")
            .eq("id", cid)
            .eq("tenant_id", tenant_id_str)
            .maybe_single(),
            label=f"competitions prev exam toggle id={cid}",
        )
        prev_row = first_row_from_response(prev_res)

    if update_data:
        res = execute_with_retry(
            admin.table("competitions")
            .update(update_data)
            .eq("id", cid)
            .eq("tenant_id", tenant_id_str)
            .select("*"),
            label=f"competitions update id={cid}",
        )
        out = first_row_from_response(res) or {"message": "Updated"}
    else:
        cur = execute_with_retry(
            admin.table("competitions")
            .select("*")
            .eq("id", cid)
            .eq("tenant_id", tenant_id_str)
            .maybe_single(),
            label=f"competitions fetch id={cid}",
        )
        out = first_row_from_response(cur) or {"message": "Updated"}

    if has_explicit_graders:
        _sync_competition_graders(admin, cid, tenant_id_str, [str(u) for u in (body.grader_teacher_ids or [])])
    elif "assigned_teacher_id" in provided and body.assigned_teacher_id is not None:
        aid = str(body.assigned_teacher_id) if body.assigned_teacher_id else ""
        if aid:
            _sync_competition_graders(admin, cid, tenant_id_str, [aid])

    if has_explicit_setup:
        _sync_competition_setup_teachers(admin, cid, tenant_id_str, [str(u) for u in (body.setup_teacher_ids or [])])

    if exam_toggle:
        await cache_delete(*_competition_cache_keys_for_exam_change(admin, cid, tenant_id_str))
        next_active = bool(
            update_data.get("is_exam_active")
            if "is_exam_active" in update_data
            else (out.get("is_exam_active") if isinstance(out, dict) else False)
        )
        comp_name = (
            (out.get("title") or out.get("name") if isinstance(out, dict) else None)
            or (prev_row or {}).get("title")
            or (prev_row or {}).get("name")
            or "Competition"
        )
        if prev_row is None or bool(prev_row.get("is_exam_active")) != next_active:
            await broadcast_competition_exam_active_changed(
                tenant_id_str, cid, str(comp_name), next_active
            )
    else:
        await cache_delete(
            cache_keys.competitions_list(tenant_id_str),
            cache_keys.competition_info(cid),
        )
    return success(out)


@router.post("/admin/competitions/{competition_id}/publish-results", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def publish_competition_results(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    cid = str(competition_id)
    tenant_id_str = str(token.tenant_id)
    comp = (
        admin.table("competitions")
        .select("id")
        .eq("id", cid)
        .eq("tenant_id", tenant_id_str)
        .maybe_single()
        .execute()
    )
    if not comp.data:
        return error("NOT_FOUND", "Competition not found", 404)

    detail = _batch_publish_summaries(admin, [cid]).get(cid, {})
    summary = _public_publish_summary(detail)
    if not summary.get("can_publish_results"):
        return error("BAD_REQUEST", "Competition results are not ready to publish", 400)

    ready_ids = list(detail.get("unpublished_ready_registration_ids") or [])
    published = 0
    if ready_ids:
        execute_with_retry(
            admin.table("competition_registrations")
            .update({"results_released": True})
            .in_("id", ready_ids)
            .eq("competition_id", cid),
            label="publish_competition_results_batch",
        )
        published = len(ready_ids)

    return success({
        "published": published,
        **(_competition_publish_summary(admin, cid)),
    })


@router.get("/competitions/{competition_id}/content")
async def get_competition_content(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    # Look up phone/student_id for this user
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    
    # Find registration by student_id or phone
    reg = None
    if student_id:
        reg = admin.table("competition_registrations").select("id").eq("competition_id", str(competition_id)).eq("student_id", student_id).maybe_single().execute()
    if (not reg or not reg.data) and phone:
        reg = admin.table("competition_registrations").select("id").eq("competition_id", str(competition_id)).eq("phone", phone).maybe_single().execute()
    
    if not reg or not reg.data:
        return error("FORBIDDEN", "You are not registered for this competition", 403)
        
    res = admin.table("competitions").select("category, content, settings, is_exam_active").eq("id", str(competition_id)).maybe_single().execute()
    if res.data and not res.data.get("is_exam_active"):
        return error("FORBIDDEN", "The exam has not started yet. Please wait for the teacher.", 403)
        
    return success(res.data)


@router.post("/competitions/{competition_id}/submit")
async def submit_competition_exam(
    competition_id: UUID, 
    body: ExamSubmission, 
    token: TokenData = Depends(get_current_user)
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    from datetime import datetime
    
    # Look up phone/student_id for this user
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    
    # Find registration by student_id or phone
    reg = None
    if student_id:
        reg = admin.table("competition_registrations").select("id, is_submitted").eq("competition_id", str(competition_id)).eq("student_id", student_id).maybe_single().execute()
    if (not reg or not reg.data) and phone:
        reg = admin.table("competition_registrations").select("id, is_submitted").eq("competition_id", str(competition_id)).eq("phone", phone).maybe_single().execute()
    
    if not reg or not reg.data:
        return error("NOT_FOUND", "Registration not found", 404)
    if reg.data["is_submitted"]:
        return error("BAD_REQUEST", "Already submitted", 400)
        
    # Standard update
    update_data = {
        "responses": body.responses,
        "submitted_at": datetime.utcnow().isoformat(),
        "is_submitted": True,
        "status": "participated"
    }
    
    res = admin.table("competition_registrations").update(update_data).eq("id", reg.data["id"]).execute()

    uid = str(token.user_id)
    cid = str(competition_id)
    await cache_delete(
        cache_keys.student_exam_draft(uid, cid),
        cache_keys.student_competitions(uid),
    )
    
    # MCQ AUTO GRADING (per-question type in content, or legacy all-mcq competitions)
    comp = admin.table("competitions").select("category, content").eq("id", str(competition_id)).maybe_single().execute()
    if comp.data:
        questions = comp.data.get("content") or []
        mcq_items: list[tuple[int, dict]] = []
        for q_idx, question in enumerate(questions):
            if not isinstance(question, dict):
                continue
            qtype = question.get("type")
            if qtype == "description":
                continue
            if qtype == "mcq" or (qtype is None and "options" in question):
                mcq_items.append((q_idx, question))

        if mcq_items:
            correct_answers = 0
            for q_idx, question in mcq_items:
                qid = question.get("id")
                student_ans = None
                for r in body.responses:
                    if qid and r.get("question_id") == qid:
                        student_ans = r.get("answer")
                        break
                    if r.get("index") == q_idx:
                        student_ans = r.get("answer")
                        break
                if student_ans is None:
                    continue
                if question.get("allow_multiple"):
                    expected = sorted(question.get("correct_options") or [])
                    got = sorted(student_ans) if isinstance(student_ans, list) else []
                    if expected == got:
                        correct_answers += 1
                elif student_ans == question.get("correct_option"):
                    correct_answers += 1

            total_questions = len(mcq_items)
            score = int((correct_answers / total_questions) * 100) if total_questions > 0 else 0
            admin.table("competition_results").upsert({
                "competition_id": str(competition_id),
                "tenant_id": str(token.tenant_id),
                "registration_id": reg.data["id"],
                "score": score,
                "remarks": f"Automated MCQ: {correct_answers}/{total_questions}",
                "recorded_by": str(token.user_id),
            }, on_conflict="competition_id, registration_id").execute()

    # Broadcast real-time event for exam submission
    await broadcast_competition_submitted(
        tenant_id=str(token.tenant_id),
        competition_id=str(competition_id),
        student_id=student_id or str(token.user_id),
        registration_id=reg.data["id"],
    )

    return success({"message": "Successfully submitted"})


@router.delete("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def delete_competition(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    from app.services.data_archive_service import DataArchiveService

    admin = get_admin_client()
    cid = str(competition_id)
    tid = str(token.tenant_id)

    comp_res = (
        admin.table("competitions")
        .select("*")
        .eq("id", cid)
        .eq("tenant_id", tid)
        .maybe_single()
        .execute()
    )
    if not comp_res.data:
        return error("NOT_FOUND", "Competition not found", 404)

    regs_res = (
        admin.table("competition_registrations")
        .select("*")
        .eq("competition_id", cid)
        .execute()
    )
    graders_res = (
        admin.table("competition_graders")
        .select("*")
        .eq("competition_id", cid)
        .execute()
    )
    setup_teachers: list = []
    try:
        setup_res = (
            admin.table("competition_setup_teachers")
            .select("*")
            .eq("competition_id", cid)
            .execute()
        )
        setup_teachers = setup_res.data or []
    except Exception:
        pass

    DataArchiveService.archive_competition(
        tenant_id=tid,
        competition=comp_res.data,
        registrations=regs_res.data or [],
        graders=graders_res.data or [],
        setup_teachers=setup_teachers,
        archived_by=str(token.user_id),
    )

    admin.table("competitions").delete().eq("id", cid).eq("tenant_id", tid).execute()
    return success({"message": "Competition deleted permanently"})


@router.delete("/admin/competitions/{competition_id}/registrations/{registration_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def delete_registration(competition_id: UUID, registration_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    # Verify competition belongs to tenant
    comp = admin.table("competitions").select("id").eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).maybe_single().execute()
    if not comp.data:
        return error("NOT_FOUND", "Competition not found", 404)
        
    # Delete registration
    res = admin.table("competition_registrations").delete().eq("id", str(registration_id)).eq("competition_id", str(competition_id)).execute()
    return success({"message": "Registration removed"})


# ── Teacher-Only Endpoints ─────────────────────────────────────────

@router.get("/teacher/competitions", dependencies=[Depends(RequireRole(["teacher"]))])
async def list_teacher_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    uid = str(token.user_id)
    tid = str(token.tenant_id)
    g = admin.table("competition_graders").select("competition_id").eq("teacher_id", uid).execute()
    cids = list({str(r["competition_id"]) for r in (g.data or [])})
    try:
        su = admin.table("competition_setup_teachers").select("competition_id").eq("teacher_id", uid).execute()
        for r in su.data or []:
            cids.append(str(r["competition_id"]))
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    legacy = (
        admin.table("competitions")
        .select("id")
        .eq("tenant_id", tid)
        .eq("assigned_teacher_id", uid)
        .execute()
    )
    for row in legacy.data or []:
        cids.append(str(row["id"]))
    cids = list(dict.fromkeys(cids))
    if not cids:
        return success([])
    res = admin.table("competitions").select("*").in_("id", cids).eq("tenant_id", tid).execute()
    rows = res.data or []
    perms = _batch_teacher_competition_permissions(admin, [str(c["id"]) for c in rows], uid)
    for c in rows:
        can_grade, can_setup = perms.get(str(c["id"]), (False, False))
        c["my_can_grade"] = can_grade
        c["my_can_setup"] = can_setup
    return success(rows)


@router.patch("/teacher/competitions/{competition_id}/content", dependencies=[Depends(RequireRole(["teacher"]))])
async def save_teacher_exam_content(competition_id: UUID, body: CompetitionUpdate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    if not _teacher_can_setup_competition(admin, str(competition_id), str(token.user_id)):
        return error("FORBIDDEN", "Not allowed to configure this competition exam", 403)

    update_data = body.model_dump(exclude_unset=True)
    # Only allow content and settings updates from teacher
    allowed = {}
    if "content" in update_data:
        allowed["content"] = update_data["content"]
        allowed["category"] = "mixed"
        settings = dict(allowed.get("settings") or update_data.get("settings") or {})
        settings.setdefault("exam_format", "form_builder")
        allowed["settings"] = settings
    if "settings" in update_data:
        allowed["settings"] = update_data["settings"]

    if not allowed:
        return error("BAD_REQUEST", "Nothing to update", 400)

    try:
        res = admin.table("competitions").update(allowed).eq("id", str(competition_id)).execute()
    except Exception as exc:
        err = str(exc)
        if allowed.get("category") == "mixed" and "category" in err.lower():
            allowed["category"] = "mcq"
            settings = dict(allowed.get("settings") or {})
            settings["exam_format"] = "form_builder"
            allowed["settings"] = settings
            res = admin.table("competitions").update(allowed).eq("id", str(competition_id)).execute()
        else:
            return error("INTERNAL", err, 500)

    return success(res.data[0] if res.data else {"message": "Content saved"})


@router.patch("/teacher/competitions/{competition_id}/toggle-exam", dependencies=[Depends(RequireRole(["teacher"]))])
async def toggle_competition_exam_disabled_for_teachers(competition_id: UUID, body: dict, token: TokenData = Depends(get_current_user)):
    """Exam start/stop is admin-only; teachers retain setup/content access elsewhere."""
    _ = competition_id, body, token
    return error(
        "FORBIDDEN",
        "Exam start and stop are controlled by your institution admin.",
        403,
    )


# ── Student Endpoint ───────────────────────────────────────────────

@router.get("/student/competitions", dependencies=[Depends(RequireRole(["student"]))])
async def list_student_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client

    uid = str(token.user_id)
    cache_key = cache_keys.student_competitions(uid)

    try:
        rows, _hit = await get_or_set_cache(
            cache_key,
            cache_ttl.STUDENT_COMPETITIONS,
            lambda: run_sync(lambda: _load_student_competitions_list(get_admin_client(), uid)),
        )
        return success(rows or [])
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("list_student_competitions failed user_id=%s", uid)
        return success([])


@router.get(
    "/student/competitions/{competition_id}/exam-draft",
    dependencies=[Depends(RequireRole(["student"]))],
)
async def get_student_exam_draft(
    competition_id: UUID, token: TokenData = Depends(get_current_user)
):
    from app.db.supabase import get_admin_client

    uid = str(token.user_id)
    cid = str(competition_id)
    cache_key = cache_keys.student_exam_draft(uid, cid)

    def _load():
        admin = get_admin_client()
        reg = _find_student_registration(admin, cid, uid)
        if not reg or reg.get("is_submitted"):
            return {"responses": [], "phase": None, "saved_at": None}
        draft = _parse_exam_draft_payload(reg.get("responses"))
        if not draft:
            return {"responses": [], "phase": None, "saved_at": None}
        return {
            "responses": draft.get("responses") or [],
            "phase": draft.get("phase"),
            "saved_at": draft.get("updated_at"),
        }

    payload, _hit = await get_or_set_cache(cache_key, cache_ttl.STUDENT_COMPETITIONS, lambda: run_sync(_load))
    return success(payload)


@router.put(
    "/student/competitions/{competition_id}/exam-draft",
    dependencies=[Depends(RequireRole(["student"]))],
)
async def save_student_exam_draft(
    competition_id: UUID,
    body: ExamDraftSave,
    token: TokenData = Depends(get_current_user),
):
    from app.db.supabase import get_admin_client

    admin = get_admin_client()
    uid = str(token.user_id)
    cid = str(competition_id)
    reg = _find_student_registration(admin, cid, uid)
    if not reg:
        return error("NOT_FOUND", "Registration not found", 404)
    if reg.get("is_submitted"):
        return error("BAD_REQUEST", "Exam already submitted", 400)

    stored = {
        "_exam_draft": True,
        "updated_at": datetime.utcnow().isoformat(),
        "phase": body.phase,
        "responses": body.responses,
    }
    admin.table("competition_registrations").update({"responses": stored}).eq("id", reg["id"]).execute()
    await cache_delete(cache_keys.student_exam_draft(uid, cid))
    return success({"message": "Draft saved", "saved_at": stored["updated_at"]})
