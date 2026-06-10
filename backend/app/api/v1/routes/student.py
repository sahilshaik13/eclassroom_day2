"""
Student routes — all require role=student JWT.
"""
import asyncio
import logging
import uuid
from datetime import date, timedelta, datetime, timezone
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, List, Literal
from app.schemas import study_plan as sp
from app.services.study_plan_pdf_import_service import build_import_payload
from app.services.study_plan_cache_service import (
    get_cached_student_study_plan,
    get_cached_study_plan_source,
    invalidate_student_progress_report_caches,
    invalidate_student_study_plan_cache,
    resolve_class_id_from_task,
)
from app.services.study_plan_kpi_service import (
    filter_submittable_tasks,
    is_day_topic_task,
    is_student_day_released,
    is_tracker_task,
    kpi_bucket_for_task,
    summarize_bucket_progress,
)
from app.services.realtime_events import (
    broadcast_new_submission,
    broadcast_doubt_created,
    broadcast_doubt_chat_message,
)

from app.core import cache_keys, cache_ttl
from app.core.cache_service import (
    get_or_set_cache,
    coalesced_get_or_set,
    invalidate_caches_for_student_activity,
)
from app.core.db_async import gather_sync, run_sync
from app.core.deps import require_student, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client
from app.services.student_attendance_service import (
    record_portal_access_attendance,
    record_portal_exit_attendance,
)

_logger = logging.getLogger(__name__)


async def _invalidate_portal_caches_background(tenant_id: str, student_id: str) -> None:
    try:
        await invalidate_caches_for_student_activity(tenant_id, student_id)
    except Exception:
        _logger.exception(
            "Background cache invalidation failed student=%s tenant=%s",
            student_id,
            tenant_id,
        )

router = APIRouter(prefix="/student", tags=["student"])

_AUDIO_REQUIRED_LABELS = ("المقرر الجديد", "المراجعة الكبرى")


def _task_day_context(task: dict) -> tuple[Optional[int], Optional[str]]:
    period = task.get("study_plan_periods") or {}
    if isinstance(period, list):
        period = period[0] if period else {}
    day = period.get("study_plan_days") or {}
    if isinstance(day, list):
        day = day[0] if day else {}
    day_number = day.get("day_number")
    scheduled_date = day.get("scheduled_date")
    day_number_int: Optional[int] = None
    if day_number is not None:
        try:
            day_number_int = int(day_number)
        except Exception:
            day_number_int = None
    return day_number_int, str(scheduled_date)[:10] if scheduled_date else None


def _task_requires_audio(task: dict) -> bool:
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    values = [
        str(task.get("title") or ""),
        str(config.get("source_column") or ""),
        str(config.get("source_value") or ""),
    ]
    combined = " ".join(values).lower()
    return any(label.lower() in combined for label in _AUDIO_REQUIRED_LABELS)


def _submission_metadata(task: dict, student_id: str, mode: str) -> dict:
    day_number, scheduled_date = _task_day_context(task)
    return {
        "student_id": str(student_id),
        "task_id": str(task.get("id") or ""),
        "task_title": str(task.get("title") or ""),
        "task_type": str(task.get("task_type") or ""),
        "kpi_bucket": kpi_bucket_for_task(task),
        "day_number": day_number,
        "scheduled_date": scheduled_date,
        "mode": mode,
        "requires_audio": _task_requires_audio(task),
        "submitted_on": date.today().isoformat(),
    }


class PortalAccessBody(BaseModel):
    event: Literal["in", "out"] = "in"


@router.post("/portal-access")
async def record_student_portal_access(
    body: PortalAccessBody,
    token: TokenData = Depends(require_student),
):
    """
    Record portal IN (open/new window) or OUT (window/tab closed).
    Returns immediately; persistence runs in the background so the portal never waits.
    """
    today = date.today().isoformat()
    event = body.event
    user_id = str(token.user_id)
    token_tenant_id = str(token.tenant_id or "").strip()

    async def _persist() -> None:
        try:
            admin = get_admin_client()
            student_res = await run_sync(
                lambda: admin.table("students")
                .select("id, tenant_id")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            student_row = (student_res.data or [None])[0] if student_res else None
            if not student_row:
                _logger.warning("[attendance] portal %s skipped — no student for user %s", event, user_id)
                return

            student_id = str(student_row["id"])
            tenant_id = str(student_row.get("tenant_id") or token_tenant_id or "").strip()
            if not tenant_id:
                _logger.warning("[attendance] portal %s skipped — no tenant for student %s", event, student_id)
                return

            if event == "in":
                ok = await run_sync(
                    lambda: record_portal_access_attendance(
                        student_id=student_id,
                        user_id=user_id,
                        tenant_id=tenant_id,
                    )
                )
            else:
                ok = await run_sync(
                    lambda: record_portal_exit_attendance(
                        student_id=student_id,
                        user_id=user_id,
                        tenant_id=tenant_id,
                    )
                )

            if ok and event == "in":
                await _invalidate_portal_caches_background(tenant_id, student_id)
        except Exception:
            _logger.exception("[attendance] portal %s background persist failed user=%s", event, user_id)

    asyncio.create_task(_persist())
    return success({"recorded": True, "date": today, "event": event, "queued": True})

# ── Pydantic Models ───────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: str

class ProfileComplete(BaseModel):
    first_name: str
    last_name: str
    islamic_name: Optional[str] = None
    gender: str
    dob: str
    nationality: str
    emirates_id: Optional[str] = None
    whatsapp_number: str
    city: str
    needs_transport: bool = False
    address: Optional[str] = None

class DoubtCreate(BaseModel):
    body: Optional[str] = None
    class_id: str
    task_id: Optional[str] = None
    client_message_id: Optional[str] = None
    title: Optional[str] = None  # ignored; stored server-side for legacy schema only
    reply_type: Optional[str] = "text"
    audio_url: Optional[str] = None
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    client_sent_at: Optional[str] = None


def _infer_student_doubt_type(body: DoubtCreate) -> str:
    explicit = (body.reply_type or "").strip().lower()
    if explicit in ("text", "audio", "file"):
        return explicit
    if body.file_url:
        return "file"
    if body.audio_url:
        return "audio"
    return "text"


def _doubt_preview_text(body: DoubtCreate, reply_type: str) -> str:
    text = (body.body or "").strip()
    if text:
        return text
    if reply_type == "audio":
        return "Voice message"
    if reply_type == "file":
        return body.file_name or "File attachment"
    return ""

# ── Today's tasks ─────────────────────────────────────────────

@router.get("/tasks/today")
async def get_today_tasks(request: Request, token: TokenData = Depends(require_student)):
    try:
        admin = get_admin_client()
        today = date.today().isoformat()

        student_res = await run_sync(
            lambda: admin.table("students")
            .select("id")
            .eq("user_id", token.user_id)
            .limit(1)
            .execute()
        )
        if not student_res.data:
            return success([])

        student_id = student_res.data[0]["id"]
        tid = str(token.tenant_id)
        cache_key = cache_keys.student_tasks_today(tid, student_id, today)

        async def _load_tasks() -> list:
            return await _fetch_today_tasks(admin, student_id, today)

        tasks, hit = await coalesced_get_or_set(cache_key, cache_ttl.STUDENT_TASKS_TODAY, _load_tasks)
        response = success(tasks)
        response.headers["X-Cache"] = "HIT" if hit else "MISS"
        return response
    except Exception as exc:
        _logger.exception("get_today_tasks failed user_id=%s: %s", token.user_id, exc)
        return success([])


async def _fetch_today_tasks(admin, student_id: str, today: str) -> list:
    try:
        enrolled_res = await run_sync(
            lambda: admin.table("class_enrollments")
            .select("class_id")
            .eq("student_id", student_id)
            .execute()
        )
        class_ids = [r["class_id"] for r in (enrolled_res.data or [])]

        if not class_ids:
            return []

        plans_res = await run_sync(
            lambda: admin.table("study_plans")
            .select("id")
            .in_("class_id", class_ids)
            .eq("status", "active")
            .execute()
        )
        plan_ids = [r["id"] for r in (plans_res.data or [])]

        if not plan_ids:
            return []

        days_res = await run_sync(
            lambda: admin.table("study_plan_days")
            .select(
                "id, day_number, scheduled_date, is_accessible, study_plans(name), "
                "study_plan_periods(id, title, study_plan_tasks(*, study_plan_submissions(*)))"
            )
            .in_("plan_id", plan_ids)
            .eq("scheduled_date", today)
            .execute()
        )
    except Exception as exc:
        _logger.warning("_fetch_today_tasks query failed student_id=%s: %s", student_id, exc)
        return []

    tasks = []
    for day in (days_res.data or []):
        plan_meta = day.get("study_plans") or {}
        plan_name = plan_meta.get("name", "Study Plan") if isinstance(plan_meta, dict) else "Study Plan"
        day_number = day.get("day_number")
        for period in (day.get("study_plan_periods") or []):
            for t in (period.get("study_plan_tasks") or []):
                if is_tracker_task(t) or is_day_topic_task(t):
                    continue
                submissions = t.pop("study_plan_submissions", []) or []
                my_sub = next((s for s in submissions if s["student_id"] == student_id), None)

                tasks.append({
                    **t,
                    "kpi_bucket": kpi_bucket_for_task(t),
                    "plan_name": plan_name,
                    "period_title": period["title"],
                    "day_number": day_number,
                    "scheduled_date": day.get("scheduled_date"),
                    "status": my_sub["status"] if my_sub else "pending",
                    "completed": my_sub is not None,
                    "submission": my_sub
                })

    return tasks

@router.post("/tasks/{task_id}/submit")
async def submit_task(
    task_id: str,
    body: sp.SubmissionCreate,
    token: TokenData = Depends(require_student)
):
    admin = get_admin_client()

    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    task_res = admin.table("study_plan_tasks").select("*, study_plan_periods(study_plan_days(*))").eq("id", task_id).maybe_single().execute()
    if not task_res.data: return error("NOT_FOUND", "Task not found", 404)
    task = task_res.data
    if is_tracker_task(task):
        return error("BAD_REQUEST", "This item is a progress tracker, not a submittable task", 400)
    if is_day_topic_task(task):
        return error("BAD_REQUEST", "This item is the day topic, not a submittable task", 400)
    _day_number, scheduled_date = _task_day_context(task)
    if not is_student_day_released(scheduled_date):
        return error("FORBIDDEN", "This day's tasks are not available yet", 403)

    content = dict(body.content or {})
    content_meta = _submission_metadata(task, str(student_id), "submit")
    content.setdefault("toggled", True)
    content["submission_meta"] = content_meta

    sub_data = {
        "tenant_id": token.tenant_id,
        "student_id": student_id,
        "task_id": task_id,
        "status": "submitted",
        "content": content,
        "audio_url": body.audio_url,
        "updated_at": datetime.utcnow().isoformat()
    }

    if task["task_type"] == "mcq" and "responses" in body.content:
        correct_count = 0
        questions = task.get("config", {}).get("questions", [])
        student_responses = body.content["responses"]
        for q_idx, q_meta in enumerate(questions):
            ans = next((r["answer"] for r in student_responses if r.get("index") == q_idx), None)
            if ans is not None and ans == q_meta.get("correct_option"):
                correct_count += 1
        total = len(questions)
        score = int((correct_count / total) * 100) if total > 0 else 0
        sub_data["score"] = score
        sub_data["feedback"] = f"Automated Score: {correct_count}/{total}"

    res = admin.table("study_plan_submissions").upsert(sub_data, on_conflict="student_id,task_id").execute()
    response_data = res.data[0] if res.data else {}
    if task["task_type"] == "mcq":
        response_data["total_questions"] = len(task.get("config", {}).get("questions", []))

    class_id = resolve_class_id_from_task(admin, task)
    if class_id and token.tenant_id:
        # Broadcast real-time event to teacher portal
        if response_data.get("id"):
            await broadcast_new_submission(
                tenant_id=str(token.tenant_id),
                class_id=class_id,
                student_id=str(student_id),
                submission_id=response_data["id"],
                task_id=task_id,
            )
        await invalidate_student_study_plan_cache(str(token.tenant_id), class_id, str(student_id))
    if token.tenant_id:
        await invalidate_student_progress_report_caches(str(token.tenant_id), str(student_id))

    return success(response_data)

# ── Week progress ─────────────────────────────────────────────

@router.get("/tasks/week")
async def get_week_progress(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("id").eq("user_id", token.user_id).single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    student_id = student_res.data["id"]
    today = date.today()
    week_start = today - timedelta(days=6)

    res = (
        client.table("task_completions")
        .select("assigned_date, completed_at")
        .eq("student_id", student_id)
        .gte("assigned_date", week_start.isoformat())
        .lte("assigned_date", today.isoformat())
        .execute()
    )

    by_date = {}
    for i in range(7):
        d = (today - timedelta(days=6 - i)).isoformat()
        by_date[d] = {"date": d, "completed_count": 0, "total_count": 0}

    for row in (res.data or []):
        d = row["assigned_date"]
        if d in by_date:
            by_date[d]["total_count"] += 1
            if row["completed_at"]:
                by_date[d]["completed_count"] += 1

    return success(list(by_date.values()))

@router.post("/tasks/{completion_id}/complete")
async def complete_task(completion_id: str, request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    res = client.table("task_completions").update({"completed_at": datetime.now(timezone.utc).isoformat()}).eq("id", completion_id).execute()
    if not res.data:
        return error("NOT_FOUND", "Task not found", 404)
    sid = res.data[0].get("student_id")
    if sid and token.tenant_id:
        await invalidate_caches_for_student_activity(str(token.tenant_id), str(sid))
    return success(res.data[0])

@router.delete("/tasks/{completion_id}/complete")
async def uncomplete_task(completion_id: str, request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    res = client.table("task_completions").update({"completed_at": None, "notes": None}).eq("id", completion_id).execute()
    if not res.data:
        return error("NOT_FOUND", "Task not found", 404)
    sid = res.data[0].get("student_id")
    if sid and token.tenant_id:
        await invalidate_caches_for_student_activity(str(token.tenant_id), str(sid))
    return success(res.data[0])

@router.patch("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    student_res = (
        admin.table("students")
        .select("id")
        .eq("user_id", token.user_id)
        .limit(1)
        .execute()
    )
    student_row = (student_res.data or [None])[0] if student_res else None
    if not student_row:
        return error("NOT_FOUND", "Student not found", 404)
    student_id = student_row["id"]

    task_res = (
        admin.table("study_plan_tasks")
        .select("*, study_plan_periods(study_plan_days(*))")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    task = (task_res.data or [None])[0] if task_res else None
    if not task:
        return error("NOT_FOUND", "Task not found", 404)
    if is_tracker_task(task) or is_day_topic_task(task):
        return error("BAD_REQUEST", "This item is not a submittable task", 400)
    _day_number, scheduled_date = _task_day_context(task)
    if not is_student_day_released(scheduled_date):
        return error("FORBIDDEN", "This day's tasks are not available yet", 403)
    class_id = resolve_class_id_from_task(admin, task)

    existing_res = (
        admin.table("study_plan_submissions")
        .select("id, status")
        .eq("student_id", student_id)
        .eq("task_id", task_id)
        .limit(1)
        .execute()
    )
    existing = (existing_res.data or [None])[0] if existing_res else None
    if existing:
        admin.table("study_plan_submissions").delete().eq("id", existing["id"]).execute()
        if class_id and token.tenant_id:
            await invalidate_student_study_plan_cache(str(token.tenant_id), class_id, str(student_id))
        if token.tenant_id:
            await invalidate_student_progress_report_caches(str(token.tenant_id), str(student_id))
        return success({"completed": False})
    else:
        content = {
            "toggled": True,
            "submission_meta": _submission_metadata(task, str(student_id), "toggle"),
        }
        new_sub = {
            "tenant_id": token.tenant_id,
            "student_id": student_id,
            "task_id": task_id,
            "status": "submitted",
            "content": content,
            "created_at": datetime.utcnow().isoformat()
        }
        admin.table("study_plan_submissions").insert(new_sub).execute()
        if class_id and token.tenant_id:
            await invalidate_student_study_plan_cache(str(token.tenant_id), class_id, str(student_id))
        if token.tenant_id:
            await invalidate_student_progress_report_caches(str(token.tenant_id), str(student_id))
        return success({"completed": True})

# ── My classes ────────────────────────────────────────────────

@router.get("/classes/my")
async def get_my_classes(token: TokenData = Depends(require_student)):
    """Enrolled classes for the student portal (admin client — avoids slow user-JWT round trips)."""
    admin = get_admin_client()
    student_res = (
        admin.table("students")
        .select("id")
        .eq("user_id", token.user_id)
        .eq("tenant_id", token.tenant_id)
        .maybe_single()
        .execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)
    student_id = student_res.data["id"]

    res = (
        admin.table("class_enrollments")
        .select("classes(id, name, zoom_link, schedule_json, users!classes_teacher_id_fkey(name))")
        .eq("student_id", student_id)
        .execute()
    )

    classes = []
    for row in (res.data or []):
        c = row.get("classes") or {}
        if isinstance(c, list):
            c = c[0] if c else {}
        teacher_row = c.pop("users", None) if isinstance(c, dict) else None
        if isinstance(teacher_row, list):
            teacher_row = teacher_row[0] if teacher_row else {}
        teacher = teacher_row if isinstance(teacher_row, dict) else {}
        classes.append({**c, "teacher": {"name": teacher.get("name", "")}})
    return success(classes)


def _student_class_study_plan_bundle(admin, student_id: str, tenant_id: str, class_id: str) -> Optional[dict]:
    """Shared loader for an active classroom study plan plus student-scoped submissions."""
    def _safe_data(result):
        if result is None:
            return None
        return getattr(result, "data", None)

    plan_res = (
        admin.table("study_plans")
        .select("*")
        .eq("class_id", class_id)
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    plan_data = _safe_data(plan_res)
    if not plan_data:
        return None

    plan = plan_data
    plan_id = plan["id"]
    template_id = plan.get("template_id")

    q = admin.table("study_plan_days").select(
        "*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))"
    )
    filter_clause = f"plan_id.eq.{plan_id}"
    if template_id:
        filter_clause += f",template_id.eq.{template_id}"

    days_res = q.or_(filter_clause).order("day_number").execute()
    days = _safe_data(days_res) or []

    task_ids: list[str] = []
    for day in days:
        for period in day.get("periods") or []:
            for task in period.get("tasks") or []:
                if task.get("id"):
                    task_ids.append(str(task["id"]))

    submissions_by_task: dict[str, list] = {}
    if task_ids:
        from app.db.batch_in import chunked_in_fetch

        sub_rows = chunked_in_fetch(
            admin,
            "study_plan_submissions",
            "*",
            "task_id",
            task_ids,
            extra_eq=lambda q: q.eq("student_id", student_id),
            chunk_size=100,
            label="student_study_plan/submissions",
        )
        for sub in sub_rows:
            tid = str(sub.get("task_id") or "")
            if tid:
                submissions_by_task.setdefault(tid, []).append(sub)

    plan_bucket_records = []

    # Student portal: all days and tasks visible (no date/teacher locks).
    for day in days:
        day["is_locked"] = False
        for period in (day.get("periods") or []):
            for task in (period.get("tasks") or []):
                tid = str(task.get("id") or "")
                task["study_plan_submissions"] = submissions_by_task.get(tid, [])
                task["kpi_bucket"] = kpi_bucket_for_task(task)
        filter_submittable_tasks(day)
        day_bucket_records = []
        for period in (day.get("periods") or []):
            period_bucket_records = []
            for task in (period.get("tasks") or []):
                submission = task["study_plan_submissions"][0] if task["study_plan_submissions"] else None
                record = {"task": task, "submission": submission}
                period_bucket_records.append(record)
                day_bucket_records.append(record)
                plan_bucket_records.append(record)
            period["bucket_progress"] = summarize_bucket_progress(period_bucket_records)
        day["bucket_progress"] = summarize_bucket_progress(day_bucket_records)

    plan["days"] = days
    plan["bucket_progress"] = summarize_bucket_progress(plan_bucket_records)

    return plan


@router.get("/classes/{class_id}/study-plan")
async def get_student_classroom_study_plan(class_id: str, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    try:
        student_res = (
            admin.table("students")
            .select("id")
            .eq("user_id", token.user_id)
            .limit(1)
            .execute()
        )
        if not student_res.data:
            return error("NOT_FOUND", "Student not found", 404)
        student_id = student_res.data[0]["id"]

        enr_check = (
            admin.table("class_enrollments")
            .select("id")
            .eq("class_id", class_id)
            .eq("student_id", student_id)
            .limit(1)
            .execute()
        )
        if not enr_check.data:
            return error("FORBIDDEN", "Not enrolled in this classroom", 403)

        bundle, cache_hit = await get_cached_student_study_plan(
            token.tenant_id, class_id, student_id
        )
        if bundle is None:
            return success(None)
        response = success(bundle)
        response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
        return response
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception("student study-plan load failed class_id=%s", class_id)
        return success(None)


@router.get("/classes/{class_id}/study-plan-source")
async def get_student_classroom_study_plan_source(class_id: str, token: TokenData = Depends(require_student)):
    """PDF source for enrolled class. Null data when no import exists (not an error)."""
    try:
        admin = get_admin_client()
        student_res = (
            admin.table("students")
            .select("id")
            .eq("user_id", token.user_id)
            .limit(1)
            .execute()
        )
        if not student_res.data:
            return error("NOT_FOUND", "Student not found", 404)
        student_id = student_res.data[0]["id"]

        enr_check = (
            admin.table("class_enrollments")
            .select("id")
            .eq("class_id", class_id)
            .eq("student_id", student_id)
            .limit(1)
            .execute()
        )
        if not enr_check.data:
            return error("FORBIDDEN", "Not enrolled in this classroom", 403)

        payload, cache_hit = await get_cached_study_plan_source(str(token.tenant_id), class_id)
        response = success(payload)
        response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
        return response
    except Exception as exc:
        logging.getLogger(__name__).exception(
            "student study-plan-source failed class_id=%s: %s", class_id, exc
        )
        return success(None)

# ── Accountability partner ────────────────────────────────────

@router.get("/partner")
async def get_partner(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("accountability_partner_id").eq("user_id", token.user_id).single().execute()
    if not student_res.data or not student_res.data.get("accountability_partner_id"): return success(None)

    partner_id = student_res.data["accountability_partner_id"]
    partner_res = client.table("students").select("id, name, phone").eq("id", partner_id).single().execute()
    return success(partner_res.data)

# ── Doubts ────────────────────────────────────────────────────

@router.get("/doubts")
async def get_my_doubts(request: Request, status: Optional[str] = None, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("id").eq("user_id", token.user_id).single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student record not found", 404)

    from app.services.doubts_query import fetch_student_doubts

    try:
        rows = fetch_student_doubts(client, str(student_res.data["id"]), status)
        return success(rows)
    except Exception as exc:
        return error("QUERY_ERROR", f"Failed to load doubts: {exc}", 500)

async def _persist_student_doubt_background(
    jwt_token: str,
    new_doubt: dict,
    tenant_id: str,
    student_id: str,
    class_id: str,
    preview_text: str,
    client_message_id: str,
    chat_payload: dict,
) -> None:
    """Insert doubt in background after client already received the broadcast."""
    try:
        from app.services.doubts_query import insert_student_doubt

        client = get_user_client(jwt_token)
        created = insert_student_doubt(client, new_doubt)
        await invalidate_caches_for_student_activity(tenant_id, student_id)
        if created.get("id"):
            await broadcast_doubt_created(
                tenant_id,
                class_id,
                student_id,
                str(created["id"]),
                preview_text or None,
            )
            chat_payload = {
                **chat_payload,
                "doubtId": str(created["id"]),
                "persisted": True,
            }
            await broadcast_doubt_chat_message(tenant_id, class_id, chat_payload)
    except Exception:
        logging.getLogger(__name__).exception("Background persist student doubt failed")


@router.delete("/classes/{class_id}/doubts/chat")
async def clear_class_doubts_chat(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_student),
):
    """Archive all doubt messages for this student in one class (hidden from chat, kept in DB)."""
    client = get_user_client(request.state.jwt_token)
    student_res = (
        client.table("students")
        .select("id")
        .eq("user_id", token.user_id)
        .maybe_single()
        .execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)
    student_id = str(student_res.data["id"])

    enr = (
        client.table("class_enrollments")
        .select("id")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    if not enr.data:
        return error("FORBIDDEN", "Not enrolled in this classroom", 403)

    from app.services.doubts_query import archive_student_class_doubts

    try:
        archived = archive_student_class_doubts(
            client, student_id, class_id, archived_by=str(token.user_id)
        )
        await invalidate_caches_for_student_activity(str(token.tenant_id), student_id)
        return success({"archived": archived, "class_id": class_id})
    except Exception as exc:
        logging.getLogger(__name__).exception("clear_class_doubts_chat failed: %s", exc)
        return error("QUERY_ERROR", f"Failed to clear chat: {exc}", 500)


@router.post("/doubts")
async def create_doubt(
    body: DoubtCreate,
    request: Request,
    token: TokenData = Depends(require_student),
):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("id, tenant_id").eq("user_id", token.user_id).single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    client_message_id = (body.client_message_id or "").strip() or str(uuid.uuid4())
    tenant_id = str(student_res.data["tenant_id"])
    student_id = str(student_res.data["id"])

    from app.services.doubts_query import doubt_title_for_db

    reply_type = _infer_student_doubt_type(body)
    body_text = (body.body or "").strip()
    audio_url = (body.audio_url or "").strip() or None
    file_url = (body.file_url or "").strip() or None
    file_name = (body.file_name or "").strip() or None

    if not body_text and not audio_url and not file_url:
        return error("BAD_REQUEST", "Message must include text, audio, or a file", 400)
    if reply_type == "file" and not file_url:
        return error("BAD_REQUEST", "File message requires file_url", 400)
    if reply_type == "audio" and not audio_url:
        return error("BAD_REQUEST", "Audio message requires audio_url", 400)

    preview_text = _doubt_preview_text(body, reply_type)
    title_source = body_text or preview_text

    client_sent_at = (body.client_sent_at or "").strip() or datetime.now(timezone.utc).isoformat()

    new_doubt = {
        "student_id": student_res.data["id"],
        "tenant_id": student_res.data["tenant_id"],
        "class_id": body.class_id,
        "task_id": body.task_id,
        "title": doubt_title_for_db(title_source),
        "body": body_text or None,
        "status": "pending",
        "reply_type": reply_type,
        "audio_url": audio_url,
        "file_url": file_url,
        "file_name": file_name,
        "client_sent_at": client_sent_at,
    }

    chat_payload = {
        "clientId": client_message_id,
        "kind": "student_doubt",
        "classId": str(body.class_id),
        "studentId": student_id,
        "text": preview_text,
        "replyType": reply_type,
        "createdAt": client_sent_at,
        "senderUserId": str(token.user_id),
    }
    if audio_url:
        chat_payload["audioUrl"] = audio_url
    if file_url:
        chat_payload["fileUrl"] = file_url
        chat_payload["fileName"] = file_name

    await broadcast_doubt_chat_message(tenant_id, str(body.class_id), chat_payload)
    asyncio.create_task(
        _persist_student_doubt_background(
            request.state.jwt_token,
            new_doubt,
            tenant_id,
            student_id,
            body.class_id,
            preview_text,
            client_message_id,
            chat_payload,
        ),
    )

    return success(
        {
            "accepted": True,
            "client_message_id": client_message_id,
            "class_id": body.class_id,
            "student_id": student_id,
        },
        status_code=202,
    )


# Progress report logic moved to progress_report.py

# ── Profile Management ────────────────────────────────────────

@router.patch("/profile")
async def update_profile(body: ProfileUpdate, request: Request, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    admin.table("users").update({"name": body.name}).eq("id", token.user_id).execute()
    admin.table("students").update({"name": body.name}).eq("user_id", token.user_id).execute()
    return success({"name": body.name})

@router.post("/complete-profile")
async def complete_student_profile(body: ProfileComplete, request: Request, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    update_data = body.dict()
    update_data["is_registered"] = True
    full_name = f"{body.first_name} {body.last_name}".strip()
    update_data["name"] = full_name
    admin.table("users").update(update_data).eq("id", token.user_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("students").update({"name": full_name}).eq("user_id", token.user_id).eq("tenant_id", token.tenant_id).execute()
    return success({"message": "Profile completed successfully"})

@router.get("/announcements/latest")
async def get_latest_announcement(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    res = client.table("announcements").select("body").eq("is_active", True).order("created_at", desc=True).limit(1).execute()
    body_text = res.data[0]["body"] if res.data else None
    return success({"body": body_text})
