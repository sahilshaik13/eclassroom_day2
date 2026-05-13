from uuid import UUID
from datetime import date
from types import SimpleNamespace
from typing import List, Optional, Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.deps import get_current_user, TokenData, RequireRole, RequireActiveTenant
from app.core.response import success, error
from app.db.supabase import get_user_client

router = APIRouter(prefix="", tags=["competitions"])


def _is_postgrest_unknown_table_error(exc: BaseException) -> bool:
    """True when PostgREST schema cache has no such table (migration not applied yet)."""
    if getattr(exc, "code", None) == "PGRST205":
        return True
    t = str(exc).lower()
    return "pgrst205" in t or ("could not find the table" in t and "schema cache" in t)


def _refresh_competition_lead_teacher(admin: Any, competition_id: str) -> None:
    """assigned_teacher_id = first setup teacher, else first grader, else null."""
    try:
        su = (
            admin.table("competition_setup_teachers")
            .select("teacher_id")
            .eq("competition_id", competition_id)
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
        su = SimpleNamespace(data=None)
    if su.data:
        admin.table("competitions").update({"assigned_teacher_id": su.data[0]["teacher_id"]}).eq("id", competition_id).execute()
        return
    gu = (
        admin.table("competition_graders")
        .select("teacher_id")
        .eq("competition_id", competition_id)
        .order("created_at", desc=False)
        .limit(1)
        .execute()
    )
    lead = gu.data[0]["teacher_id"] if gu.data else None
    admin.table("competitions").update({"assigned_teacher_id": lead}).eq("id", competition_id).execute()


def _sync_competition_graders(admin: Any, competition_id: str, tenant_id: str, teacher_ids: List[str]) -> None:
    admin.table("competition_graders").delete().eq("competition_id", competition_id).execute()
    for tid in teacher_ids:
        if not tid:
            continue
        admin.table("competition_graders").insert(
            {"competition_id": competition_id, "tenant_id": tenant_id, "teacher_id": tid}
        ).execute()
    _refresh_competition_lead_teacher(admin, competition_id)


def _sync_competition_setup_teachers(admin: Any, competition_id: str, tenant_id: str, teacher_ids: List[str]) -> None:
    try:
        admin.table("competition_setup_teachers").delete().eq("competition_id", competition_id).execute()
        for tid in teacher_ids:
            if not tid:
                continue
            admin.table("competition_setup_teachers").insert(
                {"competition_id": competition_id, "tenant_id": tenant_id, "teacher_id": tid}
            ).execute()
    except Exception as exc:
        if not _is_postgrest_unknown_table_error(exc):
            raise
    _refresh_competition_lead_teacher(admin, competition_id)


def _expected_grader_user_ids(admin: Any, competition_id: str) -> List[str]:
    grs = admin.table("competition_graders").select("teacher_id").eq("competition_id", competition_id).execute()
    ids = [str(g["teacher_id"]) for g in (grs.data or [])]
    if ids:
        return ids
    comp = (
        admin.table("competitions")
        .select("assigned_teacher_id")
        .eq("id", competition_id)
        .maybe_single()
        .execute()
    )
    if comp.data and comp.data.get("assigned_teacher_id"):
        return [str(comp.data["assigned_teacher_id"])]
    return []


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


def _competition_publish_summary(admin: Any, competition_id: str) -> dict:
    expected = _expected_grader_user_ids(admin, competition_id)
    expected_set = set(expected)
    regs = (
        admin.table("competition_registrations")
        .select("id, is_submitted, results_released")
        .eq("competition_id", competition_id)
        .execute()
    )
    submitted = [r for r in (regs.data or []) if r.get("is_submitted")]
    scores = (
        admin.table("competition_grader_scores")
        .select("registration_id, grader_user_id")
        .eq("competition_id", competition_id)
        .execute()
    )
    by_grader: dict[str, set[str]] = {gid: set() for gid in expected}
    for row in scores.data or []:
        grader_id = str(row.get("grader_user_id"))
        if grader_id in expected_set:
            by_grader.setdefault(grader_id, set()).add(str(row["registration_id"]))
    ready = 0
    unpublished_ready = 0
    pending = 0
    submitted_ids = {str(reg["id"]) for reg in submitted}
    corrected_graders = [
        grader_id
        for grader_id in expected
        if submitted_ids and submitted_ids.issubset(by_grader.get(grader_id, set()))
    ]
    pending_graders = [grader_id for grader_id in expected if grader_id not in corrected_graders]
    for reg in submitted:
        reg_id = str(reg["id"])
        is_ready = _registration_publish_ready(admin, competition_id, reg_id, expected)
        if is_ready:
            ready += 1
            if not reg.get("results_released"):
                unpublished_ready += 1
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
    }


def _repair_stale_collaborative_release_for_registration(
    admin: Any, competition_id: str, registration_id: str, row: dict
) -> None:
    """Clear premature Publish: multi-grader + results_released but not all graders scored yet."""
    expected = _expected_grader_user_ids(admin, competition_id)
    if len(expected) < 2:
        return
    if not row.get("results_released"):
        return
    if _all_expected_graders_scored(admin, competition_id, registration_id, expected):
        return
    admin.table("competition_registrations").update({"results_released": False}).eq("id", registration_id).eq(
        "competition_id", competition_id
    ).execute()
    row["results_released"] = False


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
    gr = (
        admin.table("competition_graders")
        .select("competition_id, teacher_id")
        .in_("competition_id", ids)
        .execute()
    )
    user_ids = list({str(g["teacher_id"]) for g in (gr.data or [])})
    names: dict[str, str] = {}
    if user_ids:
        ur = admin.table("users").select("id, name").in_("id", user_ids).execute()
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
        gr = (
            admin.table("competition_setup_teachers")
            .select("competition_id, teacher_id")
            .in_("competition_id", ids)
            .execute()
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
        ur = admin.table("users").select("id, name").in_("id", user_ids).execute()
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
    for c in competitions:
        c.update(_competition_publish_summary(admin, str(c["id"])))


# ── Schemas ────────────────────────────────────────────────────────

class CompetitionCreate(BaseModel):
    title: str
    category: str = "mcq" # mcq, hifz, khirat
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assigned_teacher_id: Optional[UUID] = None
    grader_teacher_ids: Optional[List[UUID]] = None
    setup_teacher_ids: Optional[List[UUID]] = None
    status: str = "draft"
    content: Optional[List] = None
    settings: Optional[dict] = None


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

class TeacherEvaluationSubmit(BaseModel):
    score: int
    remarks: Optional[str] = None
    responses_override: Optional[List[dict]] = None
    release_results: bool = False


# ── Public Endpoints ───────────────────────────────────────────────

@router.get("/competitions/{competition_id}/info")
async def get_competition_info(competition_id: UUID):
    # Public endpoint, no auth required, so we use admin client but strictly limit fields
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    res = (
        admin.table("competitions")
        .select("id, title, description, start_date, end_date, status, tenant_id, category, content, settings, is_exam_active")
        .eq("id", str(competition_id))
        .maybe_single()
        .execute()
    )
    if not res.data:
        return error("NOT_FOUND", "Competition not found", 404)
        
    return success(res.data)


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
    for r in rows:
        _repair_stale_collaborative_release_for_registration(admin, cid, str(r["id"]), r)
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
    res = (
        admin.table("competition_results")
        .select("*")
        .eq("competition_id", cid)
        .eq("registration_id", rid)
        .maybe_single()
        .execute()
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
    
    res = admin.table("competitions").insert(data).execute()
    row = res.data[0] if res.data else None
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
    return success(row)


@router.get("/admin/competitions", dependencies=[Depends(RequireRole(["admin"]))])
async def list_admin_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    res = admin.table("competitions").select("*, assigned_teacher:users!assigned_teacher_id(name)").eq("tenant_id", str(token.tenant_id)).order("created_at", desc=True).execute()
    rows = res.data or []
    _enrich_competitions_with_graders(admin, rows)
    _enrich_competitions_with_setup_teachers(admin, rows)
    _enrich_competitions_with_publish_state(admin, rows)
    return success(rows)


@router.patch("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def modify_competition(competition_id: UUID, body: CompetitionUpdate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    provided = body.model_dump(exclude_unset=True)
    has_explicit_graders = "grader_teacher_ids" in provided
    has_explicit_setup = "setup_teacher_ids" in provided
    update_data = {k: v for k, v in provided.items() if k not in ("grader_teacher_ids", "setup_teacher_ids")}
    if "start_date" in update_data and isinstance(update_data["start_date"], date): update_data["start_date"] = update_data["start_date"].isoformat()
    if "end_date" in update_data and isinstance(update_data["end_date"], date): update_data["end_date"] = update_data["end_date"].isoformat()
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
    if update_data:
        res = admin.table("competitions").update(update_data).eq("id", cid).eq("tenant_id", tenant_id_str).execute()
        out = res.data[0] if res.data else {"message": "Updated"}
    else:
        cur = (
            admin.table("competitions")
            .select("*")
            .eq("id", cid)
            .eq("tenant_id", tenant_id_str)
            .maybe_single()
            .execute()
        )
        out = cur.data or {"message": "Updated"}

    if has_explicit_graders:
        _sync_competition_graders(admin, cid, tenant_id_str, [str(u) for u in (body.grader_teacher_ids or [])])
    elif "assigned_teacher_id" in provided and body.assigned_teacher_id is not None:
        aid = str(body.assigned_teacher_id) if body.assigned_teacher_id else ""
        if aid:
            _sync_competition_graders(admin, cid, tenant_id_str, [aid])

    if has_explicit_setup:
        _sync_competition_setup_teachers(admin, cid, tenant_id_str, [str(u) for u in (body.setup_teacher_ids or [])])

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

    summary = _competition_publish_summary(admin, cid)
    if not summary["can_publish_results"]:
        return error("BAD_REQUEST", "Competition results are not ready to publish", 400)

    expected = _expected_grader_user_ids(admin, cid)
    regs = (
        admin.table("competition_registrations")
        .select("id, is_submitted, results_released")
        .eq("competition_id", cid)
        .execute()
    )
    published = 0
    for reg in regs.data or []:
        reg_id = str(reg["id"])
        if not reg.get("is_submitted") or reg.get("results_released"):
            continue
        if _registration_publish_ready(admin, cid, reg_id, expected):
            admin.table("competition_registrations").update({"results_released": True}).eq("id", reg_id).eq(
                "competition_id", cid
            ).execute()
            published += 1

    return success({
        "published": published,
        **_competition_publish_summary(admin, cid),
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
    
    # MCQ AUTO GRADING
    comp = admin.table("competitions").select("category, content").eq("id", str(competition_id)).maybe_single().execute()
    if comp.data and comp.data["category"] == "mcq":
        correct_answers = 0
        questions = comp.data["content"] or []
        for q_idx, question in enumerate(questions):
            student_ans = next((r["answer"] for r in body.responses if r.get("index") == q_idx), None)
            if student_ans is not None and student_ans == question.get("correct_option"):
                correct_answers += 1
        
        # Calculate percentage
        total_questions = len(questions)
        score = int((correct_answers / total_questions) * 100) if total_questions > 0 else 0
        
        # Record automated result
        admin.table("competition_results").upsert({
            "competition_id": str(competition_id),
            "tenant_id": str(token.tenant_id),
            "registration_id": reg.data["id"],
            "score": score,
            "remarks": f"Automated Score: {correct_answers}/{total_questions}",
            "recorded_by": str(token.user_id) # recorded by the system action
        }, on_conflict="competition_id, registration_id").execute()

    return success({"message": "Successfully submitted"})


@router.delete("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def delete_competition(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    # HARD DELETE
    res = admin.table("competitions").delete().eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).execute()
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
    for c in rows:
        cid = str(c["id"])
        c["my_can_grade"] = _teacher_can_grade_competition(admin, cid, uid)
        c["my_can_setup"] = _teacher_can_setup_competition(admin, cid, uid)
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
    if "content" in update_data: allowed["content"] = update_data["content"]
    if "settings" in update_data: allowed["settings"] = update_data["settings"]

    if not allowed:
        return error("BAD_REQUEST", "Nothing to update", 400)

    res = admin.table("competitions").update(allowed).eq("id", str(competition_id)).execute()
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
    admin = get_admin_client()
    
    # Look up both identifiers
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id, phone").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    student_phone = stu_res.data["phone"] if stu_res and stu_res.data else None
    
    all_regs = []
    seen_ids = set()
    
    # Search by student_id
    if student_id:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*), competition_grader_scores(*)").eq("student_id", student_id).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)
    
    # Also search by phone (catches registrations where student_id wasn't linked)
    if phone:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*), competition_grader_scores(*)").eq("phone", phone).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)
    
    # Also search by student phone if different from user phone
    if student_phone and student_phone != phone:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*), competition_grader_scores(*)").eq("phone", student_phone).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)

    for r in all_regs:
        _repair_stale_collaborative_release_for_registration(
            admin, str(r["competition_id"]), str(r["id"]), r
        )

    return success(all_regs)
