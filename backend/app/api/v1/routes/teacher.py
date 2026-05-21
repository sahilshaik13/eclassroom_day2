"""
Teacher routes — all require role=teacher (or admin) JWT.

GET  /api/v1/teacher/pulse/today
GET  /api/v1/teacher/classes
GET  /api/v1/teacher/students
POST /api/v1/teacher/students/search      ← NEW: search students by name/phone
POST /api/v1/teacher/students/enroll      ← NEW: enroll a student into teacher's class
GET  /api/v1/teacher/applicants           ← NEW: pending teacher applicants (from users table)
POST /api/v1/teacher/attendance
GET  /api/v1/teacher/attendance/{class_id}
GET  /api/v1/teacher/doubts
POST /api/v1/teacher/doubts/{doubt_id}/reply
POST /api/v1/teacher/grades
GET  /api/v1/teacher/reports/{student_id}
GET  /api/v1/teacher/submissions/pending    ← NEW: get all submitted tasks needing review
"""
import asyncio
import json
import logging
from datetime import date, timedelta, datetime
from typing import Optional, Any
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from app.schemas import study_plan as sp

_logger = logging.getLogger(__name__)
from app.services.study_plan_pdf_import_service import build_import_payload
from app.services.study_plan_kpi_service import (
    filter_submittable_tasks,
    is_day_topic_task,
    is_tracker_task,
    kpi_bucket_for_task,
    normalize_kpi_bucket,
    summarize_bucket_progress,
)
from app.services.study_plan_change_service import (
    record_teacher_study_plan_change,
    snapshot_for_entity,
)
from app.services.realtime_events import broadcast_submission_reviewed

from app.core import cache_keys, cache_ttl
from app.core.cache_service import get_or_set_cache, invalidate_teacher_caches
from app.services.study_plan_cache_service import (
    get_cached_study_plan_source,
    get_cached_teacher_study_plan,
    invalidate_student_progress_report_caches,
    invalidate_student_study_plan_cache,
    invalidate_study_plan_by_plan_id,
    invalidate_study_plan_for_template,
    invalidate_study_plan_caches,
    resolve_class_id_from_period_id,
    resolve_class_id_from_task,
)
from app.core.db_async import gather_sync, run_sync
from app.core.deps import require_teacher, TokenData
from app.core.response import success, error, paginated
from app.db.supabase import get_user_client, get_admin_client
from app.db.supabase_execute import first_row_from_response


router = APIRouter(prefix="/teacher", tags=["teacher"])


def _merge_task_config(config: Optional[dict], kpi_bucket: Optional[Any]) -> dict:
    next_config = dict(config or {})
    normalized_bucket = normalize_kpi_bucket(kpi_bucket)
    if normalized_bucket:
        next_config["kpi_bucket"] = normalized_bucket
    elif "kpi_bucket" in next_config and not normalize_kpi_bucket(next_config.get("kpi_bucket")):
        next_config.pop("kpi_bucket", None)
    return next_config

def _fetch_submissions_for_student_tasks(admin: Any, student_id: str, task_ids: list[str]) -> list[dict]:
    """One query by student_id; filter to plan tasks in Python."""
    if not task_ids:
        return []
    allowed = set(task_ids)
    res = (
        admin.table("study_plan_submissions")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return [r for r in (res.data or []) if r.get("task_id") in allowed]


# ── BFF dashboard (stats + pulse + classes in one round trip) ─

@router.get("/dashboard")
async def teacher_dashboard(request: Request, token: TokenData = Depends(require_teacher)):
    tid = str(token.tenant_id)
    uid = str(token.user_id)
    cache_key = cache_keys.teacher_dashboard(tid, uid)

    async def _build() -> dict:
        stats_res, pulse_res, classes_res = await asyncio.gather(
            teacher_stats(request, token),
            daily_pulse(request, token),
            get_my_classes(request, token),
        )
        return {
            "stats": json.loads(stats_res.body.decode()).get("data"),
            "pulse": json.loads(pulse_res.body.decode()).get("data"),
            "classes": json.loads(classes_res.body.decode()).get("data"),
        }

    payload, hit = await get_or_set_cache(cache_key, cache_ttl.DASHBOARD, _build)
    response = success(payload)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return response


# ── Daily Pulse ───────────────────────────────────────────────

@router.get("/pulse/today")
async def daily_pulse(request: Request, token: TokenData = Depends(require_teacher)):
    """
    Returns today's student completion pulse for the teacher.
    Cached since today's curriculum is the same for the entire day.
    """
    tid = str(token.tenant_id)
    uid = str(token.user_id)
    today = date.today().isoformat()
    cache_key = cache_keys.teacher_pulse(tid, uid)

    async def _build_pulse() -> list:
        client = get_user_client(request.state.jwt_token)

        classes_res = (
            client.table("classes").select("id")
            .eq("teacher_id", token.user_id).execute()
        )
        class_ids = [c["id"] for c in (classes_res.data or [])]
        if not class_ids:
            return []

        enrollments_res = (
            client.table("class_enrollments")
            .select("student_id, students(id, name, user_id)")
            .in_("class_id", class_ids)
            .execute()
        )

        student_ids = list({r["student_id"] for r in (enrollments_res.data or [])})
        if not student_ids:
            return []

        def _completions():
            return (
                client.table("task_completions")
                .select("student_id, completed_at")
                .in_("student_id", student_ids)
                .eq("assigned_date", today)
                .execute()
            )

        def _doubts():
            return (
                client.table("doubts")
                .select("student_id")
                .in_("class_id", class_ids)
                .eq("status", "pending")
                .execute()
            )

        completions_res, doubts_res = await gather_sync(_completions, _doubts)

        completion_by_student: dict[str, dict] = {}
        for row in (completions_res.data or []):
            sid = row["student_id"]
            if sid not in completion_by_student:
                completion_by_student[sid] = {"total": 0, "done": 0}
            completion_by_student[sid]["total"] += 1
            if row["completed_at"]:
                completion_by_student[sid]["done"] += 1

        doubts_by_student: dict[str, int] = {}
        for row in (doubts_res.data or []):
            sid = row["student_id"]
            doubts_by_student[sid] = doubts_by_student.get(sid, 0) + 1

        seen: set = set()
        pulse = []
        for row in (enrollments_res.data or []):
            sid = row["student_id"]
            if sid in seen:
                continue
            seen.add(sid)
            student = row.get("students") or {}
            comp = completion_by_student.get(sid, {"total": 0, "done": 0})
            pct = round((comp["done"] / comp["total"]) * 100) if comp["total"] else 0
            pulse.append({
                "student_id": sid,
                "name": student.get("name", ""),
                "completion_pct": pct,
                "pending_doubts": doubts_by_student.get(sid, 0),
            })

        return sorted(pulse, key=lambda x: x["completion_pct"])

    payload, hit = await get_or_set_cache(cache_key, cache_ttl.TEACHER_PULSE, _build_pulse)
    response = success(payload)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return response


# ── Stats summary for teacher dashboard ──────────────────────

@router.get("/stats")
async def teacher_stats(request: Request, token: TokenData = Depends(require_teacher)):
    """Returns real counts for teacher dashboard cards."""
    client = get_user_client(request.state.jwt_token)

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]

    total_classes = len(class_ids)
    total_students = 0
    pending_doubts = 0
    avg_attendance = 0

    if class_ids:
        since = (date.today() - timedelta(days=30)).isoformat()

        def _enrollments():
            return (
                client.table("class_enrollments")
                .select("student_id")
                .in_("class_id", class_ids)
                .execute()
            )

        def _doubts_count():
            return (
                client.table("doubts")
                .select("id", count="exact")
                .in_("class_id", class_ids)
                .eq("status", "pending")
                .execute()
            )

        def _attendance():
            return (
                client.table("attendance")
                .select("status")
                .in_("class_id", class_ids)
                .gte("session_date", since)
                .execute()
            )

        enr_res, d_res, att_res = await gather_sync(_enrollments, _doubts_count, _attendance)
        total_students = len({r["student_id"] for r in (enr_res.data or [])})
        pending_doubts = d_res.count or 0
        att_rows = att_res.data or []
        avg_attendance = (
            round(len([r for r in att_rows if r["status"] == "present"]) / len(att_rows) * 100)
            if att_rows
            else 0
        )

    return success({
        "total_students": total_students,
        "total_classes": total_classes,
        "pending_doubts": pending_doubts,
        "avg_attendance": avg_attendance,
    })


# ── Classes ───────────────────────────────────────────────────

@router.get("/classes")
async def get_my_classes(request: Request, token: TokenData = Depends(require_teacher)):
    client = get_user_client(request.state.jwt_token)

    def _query():
        if token.role in ("admin", "platform_admin"):
            return (
                client.table("classes")
                .select("*, class_enrollments(count)")
                .eq("tenant_id", token.tenant_id)
                .order("name")
                .execute()
            )
        return (
            client.table("classes")
            .select("*, class_enrollments(count)")
            .eq("teacher_id", token.user_id)
            .order("name")
            .execute()
        )

    res = await run_sync(_query)
    return success(res.data or [])


# ── Students ──────────────────────────────────────────────────

# ── Student search (all tenant students, not just enrolled) ──
# Add this route to teacher.py BEFORE the existing /students route

class SearchQuery(BaseModel):
    query: str


@router.post("/students/search")
async def search_all_students(
    body: SearchQuery,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Search ALL students in the teacher's tenant (not just enrolled).
    Used by the 'Add Student to Class' dialog.
    Returns name, phone, id, and list of enrolled classes.
    """
    q = body.query
    if not q or len(q.strip()) < 2:
        return success([])

    # Use admin client to search across all tenant students
    admin = get_admin_client()
    search_term = q.strip()

    # Search by name OR phone (ilike for case-insensitive)
    # We join with classes via class_enrollments
    res = (
        admin.table("students")
        .select("id, name, phone, deactivated_at, class_enrollments(classes(id, name))")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .or_(f"name.ilike.%{search_term}%,phone.ilike.%{search_term}%")
        .limit(20)
        .execute()
    )

    results = []
    for row in (res.data or []):
        enrolled = []
        for enr in (row.get("class_enrollments") or []):
            cls = enr.get("classes")
            if cls:
                enrolled.append({
                    "class_id": cls["id"],
                    "class_name": cls["name"]
                })

        results.append({
            "id": row["id"],
            "name": row["name"],
            "phone": row.get("phone", ""),
            "enrolled_classes": enrolled,
        })

    return success(results)


@router.get("/students")
async def get_students(
    request: Request,
    search: Optional[str] = None,
    class_id: Optional[str] = None,
    page: int = 1,
    limit: int = 25,
    token: TokenData = Depends(require_teacher),
):
    if not class_id:
        return error("BAD_REQUEST", "class_id is required", 400)

    page = max(1, page)
    limit = max(1, min(100, limit))

    client = get_user_client(request.state.jwt_token)

    def _verify_class():
        q = client.table("classes").select("id").eq("id", class_id)
        if token.role not in ("admin", "platform_admin"):
            q = q.eq("teacher_id", token.user_id)
        else:
            q = q.eq("tenant_id", token.tenant_id)
        return q.maybe_single().execute()

    def _enrollments():
        return (
            client.table("class_enrollments")
            .select("students(id, name, phone, deactivated_at, user_id), class_id, classes(name)")
            .eq("class_id", class_id)
            .execute()
        )

    class_res, enr_res = await gather_sync(_verify_class, _enrollments)
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # Group by student to support multiple classes
    students_map: dict[str, dict] = {}
    for row in (enr_res.data or []):
        s = row.get("students") or {}
        if not s:
            continue
        
        sid = s["id"]
        if search and search.lower() not in s.get("name", "").lower():
            continue
            
        cls = row.get("classes") or {}
        if sid not in students_map:
            students_map[sid] = {
                **s,
                "last_login_at": None,
                "classes": [],
                "progress": {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
            }
        
        students_map[sid]["classes"].append({
            "id": row["class_id"],
            "name": cls.get("name", "")
        })
        # Keep legacy fields for compatibility
        if "class_id" not in students_map[sid]:
            students_map[sid]["class_id"] = row["class_id"]
            students_map[sid]["class_name"] = cls.get("name", "")

    if students_map:
        admin = get_admin_client()
        student_ids = list(students_map.keys())
        user_ids = list({str(v["user_id"]) for v in students_map.values() if v.get("user_id")})

        def _fetch_logins():
            if not user_ids:
                return {}
            lu_res = (
                admin.table("users")
                .select("id, last_login_at")
                .in_("id", user_ids)
                .execute()
            )
            return {str(r["id"]): r.get("last_login_at") for r in (lu_res.data or [])}

        def _fetch_class_progress():
            plan_res = (
                admin.table("study_plans")
                .select("id")
                .eq("class_id", class_id)
                .maybe_single()
                .execute()
            )
            if not plan_res or not plan_res.data:
                return None
            plan_id = plan_res.data["id"]
            tasks_res = (
                admin.table("study_plan_tasks")
                .select("id, study_plan_periods!inner(study_plan_days!inner(plan_id))")
                .eq("study_plan_periods.study_plan_days.plan_id", plan_id)
                .execute()
            )
            plan_task_ids = [t["id"] for t in (tasks_res.data or [])]
            if not plan_task_ids:
                return (0, {sid: [] for sid in student_ids})
            plan_task_id_set = set(plan_task_ids)
            subs_res = (
                admin.table("study_plan_submissions")
                .select("student_id, task_id, status, score")
                .in_("student_id", student_ids)
                .execute()
            )
            subs_by_student: dict[str, list[dict]] = {sid: [] for sid in student_ids}
            for sub in subs_res.data or []:
                if sub.get("task_id") not in plan_task_id_set:
                    continue
                sid = str(sub.get("student_id"))
                if sid in subs_by_student:
                    subs_by_student[sid].append(sub)
            return (len(plan_task_ids), subs_by_student)

        try:
            by_uid, progress_data = await gather_sync(_fetch_logins, _fetch_class_progress)
            for sid, row in students_map.items():
                uid = row.get("user_id")
                if uid and str(uid) in by_uid:
                    row["last_login_at"] = by_uid[str(uid)]
            if progress_data:
                total_tasks_in_plan, subs_by_student = progress_data
                for sid in students_map:
                    s_subs = subs_by_student.get(sid, [])
                    completed = len([s for s in s_subs if s["status"] in ("submitted", "reviewed")])
                    reviewed_subs = [s for s in s_subs if s["status"] == "reviewed"]
                    reviewed_count = len(reviewed_subs)
                    scores = [s["score"] for s in reviewed_subs if s.get("score") is not None]
                    avg_score = round(sum(scores) / len(scores)) if scores else 0
                    students_map[sid]["progress"] = {
                        "total": total_tasks_in_plan,
                        "completed": completed,
                        "reviewed": reviewed_count,
                        "pct": round((completed / total_tasks_in_plan) * 100)
                        if total_tasks_in_plan > 0
                        else 0,
                        "average_score": avg_score,
                    }
        except Exception:
            pass

    out = []
    for v in students_map.values():
        row = dict(v)
        row.pop("user_id", None)
        out.append(row)

    total = len(out)
    start = (page - 1) * limit
    page_rows = out[start : start + limit]
    return paginated(page_rows, page=page, limit=limit, total=total)


def _teacher_tenant_id(admin: Any, token: TokenData) -> Optional[str]:
    """JWT app_metadata.tenant_id, else users.tenant_id for the logged-in user."""
    if token.tenant_id:
        return str(token.tenant_id)
    ur = admin.table("users").select("tenant_id").eq("id", token.user_id).maybe_single().execute()
    if ur and ur.data and ur.data.get("tenant_id"):
        return str(ur.data["tenant_id"])
    return None


def _compute_presence_streak(attendance_rows: list) -> int:
    """Consecutive calendar days with at least one present, counting back from the most recent."""
    from datetime import date as date_cls

    dates: list = []
    for r in attendance_rows or []:
        if r.get("status") != "present":
            continue
        d = r.get("session_date")
        if not d:
            continue
        if isinstance(d, str):
            d = date_cls.fromisoformat(d[:10])
        dates.append(d)
    dates = sorted(set(dates), reverse=True)
    if not dates:
        return 0
    streak = 1
    for i in range(1, len(dates)):
        if (dates[i - 1] - dates[i]).days == 1:
            streak += 1
        else:
            break
    return streak


@router.get("/students/{student_id}/overview")
async def get_student_overview_for_teacher(
    student_id: str,
    token: TokenData = Depends(require_teacher),
):
    """
    Last login, recent attendance (teacher classes), doubts-as-notes, attendance streak.
    """
    admin = get_admin_client()
    teacher_tid = _teacher_tenant_id(admin, token)

    stu_res = (
        admin.table("students")
        .select("id, name, phone, user_id, tenant_id")
        .eq("id", student_id)
        .maybe_single()
        .execute()
    )
    if not stu_res or not stu_res.data:
        return error("NOT_FOUND", "Student not found", 404)

    if teacher_tid and str(stu_res.data.get("tenant_id")) != str(teacher_tid):
        return error("FORBIDDEN", "Student not in your organization", 403)

    cq = admin.table("classes").select("id")
    tid_filter = teacher_tid or (
        str(stu_res.data["tenant_id"]) if stu_res.data.get("tenant_id") else None
    )
    if tid_filter:
        cq = cq.eq("tenant_id", tid_filter)
    if token.role not in ("admin", "platform_admin"):
        cq = cq.eq("teacher_id", token.user_id)
    classes_res = cq.execute()
    teacher_class_ids = [c["id"] for c in (classes_res.data or [])]
    if not teacher_class_ids:
        return success(
            {
                "student_id": student_id,
                "last_login_at": None,
                "attendance_streak": 0,
                "attendance_history": [],
                "notes": [],
            }
        )

    enr_check = (
        admin.table("class_enrollments")
        .select("id")
        .eq("student_id", student_id)
        .in_("class_id", teacher_class_ids)
        .limit(1)
        .execute()
    )
    if token.role not in ("admin", "platform_admin") and not (enr_check.data or []):
        return error("FORBIDDEN", "Student is not in any of your classes", 403)

    user_res = (
        admin.table("users")
        .select("last_login_at")
        .eq("id", stu_res.data["user_id"])
        .maybe_single()
        .execute()
    )
    last_login = (user_res.data or {}).get("last_login_at")

    from app.services.student_attendance_service import (
        apply_last_login_fallback,
        fetch_teacher_attendance_view,
    )

    attendance = apply_last_login_fallback(
        fetch_teacher_attendance_view(student_id),
        last_login,
    )
    history = attendance.get("attendance_history") or []
    streak = attendance.get("attendance_streak") or 0

    tid_for_cache = tid_filter or str(stu_res.data.get("tenant_id") or "")
    cache_key = cache_keys.teacher_student_overview(
        tid_for_cache, str(token.user_id), student_id
    )

    async def _build_overview() -> dict:
        doubts_res = (
            admin.table("doubts")
            .select("id, title, body, created_at, status")
            .eq("student_id", student_id)
            .in_("class_id", teacher_class_ids)
            .order("created_at", desc=True)
            .limit(12)
            .execute()
        )
        notes = []
        for d in doubts_res.data or []:
            notes.append(
                {
                    "type": "Doubt",
                    "time": d.get("created_at"),
                    "content": d.get("body") or d.get("title") or "",
                    "variant": "amber",
                }
            )

        task_status_by_date: dict[str, dict] = {}
        try:
            plans_res = (
                admin.table("study_plans")
                .select("id, template_id, class_id")
                .in_("class_id", teacher_class_ids)
                .eq("status", "active")
                .execute()
            )
            plan_rows = plans_res.data or []
            if plan_rows:
                or_parts = [f"plan_id.eq.{p['id']}" for p in plan_rows if p.get("id")]
                for p in plan_rows:
                    if p.get("template_id"):
                        or_parts.append(f"template_id.eq.{p['template_id']}")
                or_parts = list(dict.fromkeys(or_parts))
                if or_parts:
                    days_res = (
                        admin.table("study_plan_days")
                        .select("id, day_number, scheduled_date, plan_id, template_id, periods:study_plan_periods(id, tasks:study_plan_tasks(id, title))")
                        .or_(",".join(or_parts))
                        .execute()
                    )
                    day_rows = days_res.data or []

                    task_ids: list[str] = []
                    for day in day_rows:
                        for period in day.get("periods") or []:
                            for task in period.get("tasks") or []:
                                if task.get("id"):
                                    task_ids.append(str(task["id"]))

                    submitted_task_ids: set[str] = set()
                    if task_ids:
                        subs_res = (
                            admin.table("study_plan_submissions")
                            .select("task_id")
                            .eq("student_id", student_id)
                            .in_("task_id", list(set(task_ids)))
                            .execute()
                        )
                        submitted_task_ids = {
                            str(row.get("task_id"))
                            for row in (subs_res.data or [])
                            if row.get("task_id")
                        }

                    for day in day_rows:
                        scheduled = str(day.get("scheduled_date") or "")[:10]
                        if not scheduled:
                            continue
                        existing = task_status_by_date.get(scheduled) or {
                            "day_number": day.get("day_number"),
                            "tasks": [],
                        }
                        seen = {
                            str(task.get("task_id"))
                            for task in existing["tasks"]
                            if task.get("task_id")
                        }
                        for period in day.get("periods") or []:
                            for task in period.get("tasks") or []:
                                task_id = str(task.get("id") or "")
                                if not task_id or task_id in seen:
                                    continue
                                seen.add(task_id)
                                existing["tasks"].append(
                                    {
                                        "task_id": task_id,
                                        "title": str(task.get("title") or "Task"),
                                        "submitted": task_id in submitted_task_ids,
                                    }
                                )
                        total = len(existing["tasks"])
                        submitted = len([t for t in existing["tasks"] if t.get("submitted")])
                        existing["total_count"] = total
                        existing["submitted_count"] = submitted
                        task_status_by_date[scheduled] = existing
        except Exception:
            task_status_by_date = {}

        return {
            "student_id": student_id,
            "last_login_at": last_login,
            "attendance_streak": streak,
            "attendance_history": history,
            "task_status_by_date": task_status_by_date,
            "notes": notes,
        }

    payload, hit = await get_or_set_cache(cache_key, cache_ttl.TEACHER_STUDENT_OVERVIEW, _build_overview)
    response = success(payload)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return response


@router.get("/study-plan")
async def get_study_plan(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Returns the study plan (sequence of tasks) for a specific class.
    Since tasks are applied to students in 'task_completions', we find
    the set of unique tasks assigned to this class.
    """
    client = get_user_client(request.state.jwt_token)

    # 1. Verify access (Teacher must own the class or be admin)
    q = client.table("classes").select("id, name, tenant_id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()

    if not class_res.data:
        return error("UNAUTHORIZED", "Class not found or access denied", 403)

    # 2. Get students in this class
    enr_res = (
        client.table("class_enrollments")
        .select("student_id")
        .eq("class_id", class_id)
        .execute()
    )
    student_ids = [r["student_id"] for r in (enr_res.data or [])]
    if not student_ids:
        return success([]) # No students yet, so no tasks assigned via 'apply'

    # 3. Get unique tasks from task_completions for these students
    # We join with study_plan_tasks to get the details
    res = (
        client.table("task_completions")
        .select("study_plan_tasks(id, title, description, task_type, day_number, order_index)")
        .in_("student_id", student_ids)
        .execute()
    )

    # De-duplicate tasks (since multiple students have the same tasks)
    tasks_map = {}
    for row in (res.data or []):
        t = row.get("study_plan_tasks")
        if t and t["id"] not in tasks_map:
            tasks_map[t["id"]] = t

    # Sort by day and order
    sorted_tasks = sorted(
        tasks_map.values(),
        key=lambda x: (x.get("day_number", 0), x.get("order_index", 0))
    )

    return success(sorted_tasks)


# ── Student Search (across tenant — for adding to class) ──────

class EnrollStudentPayload(BaseModel):
    student_id: str
    class_id: str


@router.post("/students/enroll")
async def enroll_student_into_class(
    body: EnrollStudentPayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Enroll a student into one of the teacher's classes.
    Teacher can only enroll into their own classes (RLS enforced).
    Once enrolled, the student appears in admin dashboard counts.
    """
    admin = get_admin_client()

    # 1. Verify the class exists in the tenant
    q = admin.table("classes").select("id, name, tenant_id, teacher_id").eq("id", body.class_id)
    if token.role != "admin":
        q = q.eq("teacher_id", token.user_id)
    
    class_check = q.maybe_single().execute()
    
    if not class_check.data:
        return error("NOT_FOUND", "Class not found or you are not authorized to manage it", 403)

    class_data = class_check.data

    # 2. Verify student belongs to the same tenant
    student_check = (
        admin.table("students").select("id, name, tenant_id")
        .eq("id", body.student_id)
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .maybe_single()
        .execute()
    )
    if not student_check.data:
        return error("NOT_FOUND", "Student not found in your organization", 404)

    # 3. Enroll (upsert — safe to call if already enrolled)
    enroll_res = (
        admin.table("class_enrollments")
        .upsert(
            {
                "student_id": body.student_id,
                "class_id": body.class_id,
                "tenant_id": token.tenant_id,
            },
            on_conflict="student_id,class_id",
        )
        .execute()
    )

    return success({
        "enrolled": True,
        "student_name": student_check.data["name"],
        "class_name": class_data["name"],
    })




# ── Remove Student from Teacher's Class ──────────────────────

@router.delete("/students/{student_id}/enroll/{class_id}")
async def remove_student_from_class(
    student_id: str,
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """Remove a student from the teacher's class."""
    admin = get_admin_client()

    # Verify class belongs to teacher
    class_check = (
        admin.table("classes").select("id")
        .eq("id", class_id)
        .eq("teacher_id", token.user_id)
        .maybe_single()
        .execute()
    )
    if not class_check.data:
        return error("UNAUTHORIZED", "Class not found or does not belong to you", 403)

    admin.table("class_enrollments").delete().eq("student_id", student_id).eq("class_id", class_id).execute()
    return success({"removed": True})


# ── Applicants (pending teacher registrations) ────────────────

@router.get("/applicants")
async def get_applicants(
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Returns students who registered but are not yet enrolled in any class
    within this teacher's tenant. These are 'new applicants' waiting to be placed.
    """
    admin = get_admin_client()

    # Students in this tenant with no class enrollment
    all_students_res = (
        admin.table("students")
        .select("id, name, phone, created_at")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .order("created_at", desc=True)
        .execute()
    )

    all_student_ids = [s["id"] for s in (all_students_res.data or [])]
    if not all_student_ids:
        return success([])

    # Get all enrolled student IDs
    enrolled_res = (
        admin.table("class_enrollments")
        .select("student_id")
        .in_("student_id", all_student_ids)
        .execute()
    )
    enrolled_ids = {r["student_id"] for r in (enrolled_res.data or [])}

    # Filter to unenrolled students
    unenrolled = [
        s for s in (all_students_res.data or [])
        if s["id"] not in enrolled_ids
    ]

    return success(unenrolled)


# ── Attendance ────────────────────────────────────────────────

class AttendanceRecord(BaseModel):
    student_id: str
    status: str  # present | absent | late


class AttendancePayload(BaseModel):
    class_id: str
    session_date: str   # YYYY-MM-DD
    records: list[AttendanceRecord]


@router.post("/attendance")
async def mark_attendance(
    body: AttendancePayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    rows = [
        {
            "class_id": body.class_id,
            "student_id": r.student_id,
            "tenant_id": token.tenant_id,
            "session_date": body.session_date,
            "status": r.status,
            "marked_by": token.user_id,
        }
        for r in body.records
    ]

    res = (
        client.table("attendance")
        .upsert(rows, on_conflict="student_id,class_id,session_date")
        .execute()
    )

    return success({"saved": len(res.data or [])})


@router.get("/attendance/{class_id}")
async def get_attendance_calendar(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)
    since = (date.today() - timedelta(days=30)).isoformat()

    res = (
        client.table("attendance")
        .select("student_id, session_date, status, students(name)")
        .eq("class_id", class_id)
        .gte("session_date", since)
        .order("session_date", desc=True)
        .execute()
    )

    return success(res.data or [])


# ── Doubts ────────────────────────────────────────────────────

@router.get("/doubts")
async def get_class_doubts(
    request: Request,
    status: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]
    if not class_ids:
        return success([])

    q = (
        client.table("doubts")
        .select("*, students(name), doubt_responses(id, body, created_at)")
        .in_("class_id", class_ids)
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)

    res = q.execute()
    return success(res.data or [])


class ReplyBody(BaseModel):
    body: str


@router.post("/doubts/{doubt_id}/reply")
async def reply_to_doubt(
    doubt_id: str,
    body: ReplyBody,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    resp_res = (
        client.table("doubt_responses")
        .insert({
            "doubt_id": doubt_id,
            "teacher_id": token.user_id,
            "tenant_id": token.tenant_id,
            "body": body.body,
        })
        .execute()
    )

    client.table("doubts").update({"status": "resolved"}).eq("id", doubt_id).execute()

    if token.tenant_id:
        await invalidate_teacher_caches(str(token.tenant_id), str(token.user_id))

    return success(resp_res.data[0] if resp_res.data else {}, status_code=201)


# ── Grades ────────────────────────────────────────────────────

class GradeEntry(BaseModel):
    student_id: str
    score: int
    remarks: Optional[str] = None


class GradesPayload(BaseModel):
    class_id: str
    month: str
    grades: list[GradeEntry]


@router.post("/grades")
async def save_grades(
    body: GradesPayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    rows = [
        {
            "student_id": g.student_id,
            "class_id": body.class_id,
            "teacher_id": token.user_id,
            "tenant_id": token.tenant_id,
            "month": body.month,
            "score": g.score,
            "remarks": g.remarks,
        }
        for g in body.grades
    ]

    res = (
        client.table("grades")
        .upsert(rows, on_conflict="student_id,class_id,month")
        .execute()
    )

    return success({"saved": len(res.data or [])})


# ── Report card data ──────────────────────────────────────────

@router.get("/reports/{student_id}")
async def get_report_data(
    student_id: str,
    request: Request,
    month: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)
    if not month:
        month = date.today().strftime("%Y-%m")

    student_res = (
        client.table("students").select("id, name")
        .eq("id", student_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)

    enr_res = (
        client.table("class_enrollments")
        .select("classes(id, name)")
        .eq("student_id", student_id)
        .limit(1).execute()
    )
    class_info = {}
    if enr_res.data:
        class_info = enr_res.data[0].get("classes") or {}

    att_res = (
        client.table("attendance")
        .select("status")
        .eq("student_id", student_id)
        .gte("session_date", f"{month}-01")
        .lte("session_date", f"{month}-31")
        .execute()
    )
    att_rows = att_res.data or []
    att_pct = (
        round(len([r for r in att_rows if r["status"] == "present"]) / len(att_rows) * 100)
        if att_rows else 0
    )

    comp_res = (
        client.table("task_completions")
        .select("completed_at")
        .eq("student_id", student_id)
        .gte("assigned_date", f"{month}-01")
        .lte("assigned_date", f"{month}-31")
        .execute()
    )
    comp_rows = comp_res.data or []
    comp_pct = (
        round(len([r for r in comp_rows if r["completed_at"]]) / len(comp_rows) * 100)
        if comp_rows else 0
    )

    grade_res = (
        client.table("grades")
        .select("score, remarks")
        .eq("student_id", student_id)
        .eq("month", month)
        .maybe_single()
        .execute()
    )

    teacher_res = (
        client.table("users").select("name")
        .eq("id", token.user_id).single().execute()
    )

    return success({
        "student": student_res.data,
        "class": class_info,
        "month": month,
        "attendance_pct": att_pct,
        "task_completion_pct": comp_pct,
        "grade": grade_res.data,
        "teacher": teacher_res.data or {},
    })


# ── Study Plan Management ─────────────────────────────────────

@router.get("/classrooms/{class_id}/study-plan")
async def get_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()

    def _safe_data(result):
        if result is None:
            return None
        return getattr(result, "data", None)
    
    # Verify class belongs to teacher (or admin)
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()
    class_data = _safe_data(class_res)
    if not class_data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    try:
        plan, cache_hit = await get_cached_teacher_study_plan(token.tenant_id, class_id)
        if not plan:
            return error("NOT_FOUND", "No study plan assigned to this classroom", 404)
        response = success(plan)
        response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
        return response
    except Exception as e:
        return error("QUERY_ERROR", str(e), 500)


@router.get("/classrooms/{class_id}/study-plan-source")
async def get_classroom_study_plan_source(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()

    try:
        q = admin.table("classes").select("id")
        if token.role not in ("admin", "platform_admin"):
            q = q.eq("teacher_id", token.user_id)
        else:
            q = q.eq("tenant_id", token.tenant_id)

        class_res = q.eq("id", class_id).limit(1).execute()
        class_row = (class_res.data or [None])[0] if class_res else None
        if not class_row:
            return error("FORBIDDEN", "Class not found or access denied", 403)

        payload, cache_hit = await get_cached_study_plan_source(token.tenant_id, class_id)
        response = success(payload)
        response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
        return response
    except Exception as exc:
        return error("QUERY_ERROR", f"Failed to load classroom source: {exc}", 500)


def _is_present_uuid(val) -> bool:
    """PostgREST may receive Python None as the literal 'None' for uuid filters — avoid that."""
    if val is None:
        return False
    s = str(val).strip()
    if not s or s.lower() in ("none", "null"):
        return False
    return True


async def touch_plan(plan_id: Optional[str]):
    """Sets updated_at = now() for a study plan to mark it as dirty."""
    if not _is_present_uuid(plan_id):
        return
    admin = get_admin_client()
    now = datetime.utcnow().isoformat()
    admin.table("study_plans").update({"updated_at": now}).eq("id", str(plan_id)).execute()
    await invalidate_study_plan_by_plan_id(str(plan_id))
    try:
        plan_row = (
            admin.table("study_plans")
            .select("class_id, tenant_id")
            .eq("id", str(plan_id))
            .limit(1)
            .execute()
        )
        if plan_row.data:
            row = plan_row.data[0]
            class_id = row.get("class_id")
            tenant_id = row.get("tenant_id")
            if class_id and tenant_id:
                from app.services.realtime_events import broadcast_study_plan_changed

                await broadcast_study_plan_changed(
                    str(tenant_id),
                    str(class_id),
                    changed_by="",
                    change_type="updated",
                )
    except Exception:
        _logger.debug("study_plan realtime broadcast skipped for plan %s", plan_id)


async def touch_plans_for_template(template_id: Optional[str]):
    """Days keyed by template_id are shared; bump all classroom plans using that template."""
    if not _is_present_uuid(template_id):
        return
    admin = get_admin_client()
    now = datetime.utcnow().isoformat()
    admin.table("study_plans").update({"updated_at": now}).eq("template_id", str(template_id)).execute()
    row = (
        admin.table("study_plans")
        .select("tenant_id")
        .eq("template_id", str(template_id))
        .limit(1)
        .execute()
    )
    if row.data:
        await invalidate_study_plan_for_template(str(row.data[0]["tenant_id"]), str(template_id))


async def touch_plan_by_day(day_id: str):
    admin = get_admin_client()
    res = (
        admin.table("study_plan_days")
        .select("plan_id, template_id")
        .eq("id", day_id)
        .limit(1)
        .execute()
    )
    row = first_row_from_response(res)
    if not row:
        return
    pid, tid = row.get("plan_id"), row.get("template_id")
    if _is_present_uuid(pid):
        await touch_plan(pid)
    elif _is_present_uuid(tid):
        await touch_plans_for_template(tid)

async def touch_plan_by_period(period_id: str):
    admin = get_admin_client()
    res = (
        admin.table("study_plan_periods")
        .select("day_id")
        .eq("id", period_id)
        .limit(1)
        .execute()
    )
    row = first_row_from_response(res)
    if row and row.get("day_id"):
        await touch_plan_by_day(str(row["day_id"]))

async def touch_plan_by_task(task_id: str):
    admin = get_admin_client()
    res = (
        admin.table("study_plan_tasks")
        .select("period_id")
        .eq("id", task_id)
        .limit(1)
        .execute()
    )
    row = first_row_from_response(res)
    if row and row.get("period_id"):
        await touch_plan_by_period(str(row["period_id"]))


@router.post("/classrooms/{class_id}/publish")
async def publish_study_plan(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Sets the classroom study plan to 'active' status, 
    making it visible to students.
    """
    admin = get_admin_client()
    
    # Verify ownership/assignment (or admin)
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # Update status AND record publication time
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    
    res = admin.table("study_plans").update({
        "status": "active",
        "published_at": now,
        "updated_at": now # Reset updated_at to match published_at on success
    }).eq("class_id", class_id).execute()
    
    if not res.data:
        return error("NOT_FOUND", "No study plan found for this classroom", 404)

    from app.services.study_plan_cache_service import invalidate_study_plan_caches

    await invalidate_study_plan_caches(token.tenant_id, class_id)
    return success({"status": "active", "message": "Study plan published to students"})




@router.get("/study-plans/{plan_id}/submissions")
async def get_plan_submissions(
    plan_id: str,
    task_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    query = admin.table("study_plan_submissions").select("*, student:students(name, phone), task:study_plan_tasks(title, task_type)")
    
    if task_id:
        query = query.eq("task_id", task_id)
    else:
        # Filter by tasks belonging to this plan
        # This requires a join or a subquery which PostgREST doesn't do easily for filtering across tables
        # So we'll fetch task_ids first
        tasks = admin.table("study_plan_tasks").select("id").eq("period_id.day_id.plan_id", plan_id).execute()
        task_ids = [t["id"] for t in (tasks.data or [])]
        if not task_ids: return success([])
        query = query.in_("task_id", task_ids)

    res = query.order("created_at", desc=True).execute()
    return success(res.data or [])

async def get_student_overall_progress(admin, student_id, plan_id, template_id=None):
    """Calculates completion % and average score across the whole plan using pre-calculated metrics."""
    res = (
        admin.table("student_progress_metrics")
        .select("total_tasks, completed_tasks, reviewed_tasks, average_score")
        .eq("student_id", student_id)
        .eq("plan_id", plan_id)
        .execute()
    )
    metrics = res.data or []
    if not metrics:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}

    total = sum([m["total_tasks"] for m in metrics])
    completed = sum([m["completed_tasks"] for m in metrics])
    reviewed = sum([m["reviewed_tasks"] for m in metrics])
    
    # Weighted average for score
    total_score = sum([m["average_score"] * m["reviewed_tasks"] for m in metrics])
    
    return {
        "total": total,
        "completed": completed,
        "reviewed": reviewed,
        "pct": round((completed / total) * 100) if total > 0 else 0,
        "average_score": round(total_score / reviewed) if reviewed > 0 else 0
    }


async def get_student_day_progress(admin, student_id, day_id):
    """Calculates completion % and average score for a student for a specific day using metrics table."""
    # First get plan_id and day_number
    day_res = admin.table("study_plan_days").select("plan_id, day_number").eq("id", day_id).maybe_single().execute()
    if not day_res.data:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
    
    plan_id = day_res.data["plan_id"]
    day_number = day_res.data["day_number"]

    res = (
        admin.table("student_progress_metrics")
        .select("total_tasks, completed_tasks, reviewed_tasks, average_score")
        .eq("student_id", student_id)
        .eq("plan_id", plan_id)
        .eq("day_number", day_number)
        .maybe_single()
        .execute()
    )
    m = res.data
    if not m:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
    
    return {
        "total": m["total_tasks"],
        "completed": m["completed_tasks"],
        "reviewed": m["reviewed_tasks"],
        "pct": round((m["completed_tasks"] / m["total_tasks"]) * 100) if m["total_tasks"] > 0 else 0,
        "average_score": m["average_score"]
    }


@router.get("/submissions/{submission_id:uuid}")
async def get_single_submission(
    submission_id: UUID,
    token: TokenData = Depends(require_teacher)
):
    """Returns full details for a single submission."""
    admin = get_admin_client()
    sid = str(submission_id)
    try:
        sub_res = (
            admin.table("study_plan_submissions")
            .select("id, student_id, task_id, status, score, feedback, created_at, reviewed_at, audio_url, content")
            .eq("id", sid)
            .limit(1)
            .execute()
        )
        if not sub_res.data:
            return error("NOT_FOUND", "Submission not found", 404)
        submission = dict(sub_res.data[0])

        student_id = str(submission.get("student_id") or "")
        task_id = str(submission.get("task_id") or "")

        student = {}
        task = {}
        day_id = None

        if student_id:
            s_res = (
                admin.table("students")
                .select("id, name, phone")
                .eq("id", student_id)
                .limit(1)
                .execute()
            )
            student = (s_res.data or [{}])[0] if s_res else {}

        if task_id:
            t_res = (
                admin.table("study_plan_tasks")
                .select("id, title, task_type, period_id")
                .eq("id", task_id)
                .limit(1)
                .execute()
            )
            task = (t_res.data or [{}])[0] if t_res else {}
            period_id = str(task.get("period_id") or "")
            if period_id:
                p_res = (
                    admin.table("study_plan_periods")
                    .select("id, day_id")
                    .eq("id", period_id)
                    .limit(1)
                    .execute()
                )
                period = (p_res.data or [{}])[0] if p_res else {}
                day_id = period.get("day_id")

        day_progress = {"total": 0, "completed": 0, "reviewed": 0, "pct": 0}
        if day_id and student_id:
            day_progress = await get_student_day_progress(admin, student_id, day_id)

        submission["student"] = student
        submission["task"] = task
        submission["day_progress"] = day_progress
        return success(submission)
    except Exception as exc:
        return error("QUERY_ERROR", f"Failed to load submission: {exc}", 500)


@router.get("/students/{student_id}/study-plan/period/{period_id}/submissions")
async def get_period_submissions(
    student_id: str,
    period_id: str,
    token: TokenData = Depends(require_teacher)
):
    """Returns all submissions by a student for all tasks in a specific period."""
    admin = get_admin_client()
    
    # 1. Get period and tasks
    period_res = admin.table("study_plan_periods").select("title").eq("id", period_id).maybe_single().execute()
    period_title = period_res.data["title"] if period_res.data else "Period"

    tasks_res = admin.table("study_plan_tasks").select("id, title, task_type").eq("period_id", period_id).execute()
    tasks = tasks_res.data or []
    if not tasks:
        return success([])
    
    task_ids = [t["id"] for t in tasks]
    
    # 2. Get submissions for these tasks
    subs_res = (
        admin.table("study_plan_submissions")
        .select("*, student:students(id, name, phone), task:study_plan_tasks(id, title, task_type)")
        .eq("student_id", student_id)
        .in_("task_id", task_ids)
        .execute()
    )
    
    submissions = subs_res.data or []
    
    day_progress = {"total": 0, "completed": 0, "reviewed": 0, "pct": 0}
    if submissions:
        # Get day_id from the first task's period
        first_task_id = task_ids[0]
        task_info = admin.table("study_plan_tasks").select("period:study_plan_periods(day_id)").eq("id", first_task_id).maybe_single().execute()
        if task_info.data:
            p = task_info.data.get("period") or {}
            day_id = p.get("day_id")
            if day_id:
                day_progress = await get_student_day_progress(admin, student_id, day_id)

    for sub in submissions:
        sub["period_title"] = period_title
        sub["day_progress"] = day_progress
        
    return success(submissions)


@router.get("/submissions/pending")
async def get_pending_submissions(
    request: Request,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns all submissions from students in teacher's classes 
    that have status 'submitted' (Under Review).
    """
    admin = get_admin_client()
    tenant_id = str(token.tenant_id)
    teacher_id = str(token.user_id)

    try:
        # 1. Get teacher's classes (admin client + tenant filter avoids RLS-related 500s)
        classes_res = (
            admin.table("classes")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("teacher_id", teacher_id)
            .execute()
        )
        class_ids = [str(c.get("id")) for c in (classes_res.data or []) if c and c.get("id")]
        if not class_ids:
            return success([])

        # 2. Get students in those classes
        enrollments_res = (
            admin.table("class_enrollments")
            .select("student_id")
            .in_("class_id", class_ids)
            .execute()
        )
        student_ids = list({str(r.get("student_id")) for r in (enrollments_res.data or []) if r and r.get("student_id")})
        if not student_ids:
            return success([])

        # 3. Fetch pending submissions (core list)
        subs_res = (
            admin.table("study_plan_submissions")
            .select("id, student_id, task_id, status, score, feedback, created_at, audio_url, content")
            .eq("tenant_id", tenant_id)
            .in_("student_id", student_ids)
            .eq("status", "submitted")
            .order("created_at", desc=True)
            .execute()
        )
        submissions = subs_res.data or []
        if not submissions:
            return success([])
    except Exception:
        # Never hard-fail the queue for transient DB/query issues.
        return success([])

    student_map: dict[str, dict] = {}
    task_map: dict[str, dict] = {}
    period_map: dict[str, dict] = {}
    day_map: dict[str, dict] = {}
    plan_map: dict[str, dict] = {}
    class_name_map: dict[str, str] = {}

    try:
        # students
        student_lookup_ids = list({str(s.get("student_id")) for s in submissions if s and s.get("student_id")})
        if student_lookup_ids:
            s_rows = (
                admin.table("students")
                .select("id, name, phone")
                .in_("id", student_lookup_ids)
                .execute()
            )
            student_map = {str(r.get("id")): r for r in (s_rows.data or []) if r and r.get("id")}

        # tasks
        task_lookup_ids = list({str(s.get("task_id")) for s in submissions if s and s.get("task_id")})
        if task_lookup_ids:
            t_rows = (
                admin.table("study_plan_tasks")
                .select("id, title, task_type, period_id, config")
                .in_("id", task_lookup_ids)
                .execute()
            )
            task_map = {str(r.get("id")): r for r in (t_rows.data or []) if r and r.get("id")}

        # periods
        period_ids = [str(t.get("period_id")) for t in task_map.values() if t.get("period_id")]
        if period_ids:
            p_rows = (
                admin.table("study_plan_periods")
                .select("id, day_id")
                .in_("id", list(set(period_ids)))
                .execute()
            )
            period_map = {str(r.get("id")): r for r in (p_rows.data or []) if r and r.get("id")}

        # days
        day_ids = [str(p.get("day_id")) for p in period_map.values() if p.get("day_id")]
        if day_ids:
            d_rows = (
                admin.table("study_plan_days")
                .select("id, day_number, scheduled_date, plan_id")
                .in_("id", list(set(day_ids)))
                .execute()
            )
            day_map = {str(r.get("id")): r for r in (d_rows.data or []) if r and r.get("id")}

        # plans + class names
        plan_ids = [str(d.get("plan_id")) for d in day_map.values() if d.get("plan_id")]
        if plan_ids:
            plan_rows = (
                admin.table("study_plans")
                .select("id, class_id")
                .in_("id", list(set(plan_ids)))
                .execute()
            )
            plan_map = {str(r.get("id")): r for r in (plan_rows.data or []) if r and r.get("id")}
            class_id_set = set(class_ids)
            class_ids_for_names = [
                str(r.get("class_id"))
                for r in plan_map.values()
                if r.get("class_id") and str(r.get("class_id")) in class_id_set
            ]
            if class_ids_for_names:
                cls_rows = (
                    admin.table("classes")
                    .select("id, name")
                    .in_("id", list(set(class_ids_for_names)))
                    .execute()
                )
                class_name_map = {str(r.get("id")): str(r.get("name") or "") for r in (cls_rows.data or []) if r and r.get("id")}
    except Exception:
        # Leave maps best-effort; endpoint still returns core pending items.
        pass

    try:
        flat_data = []
        for sub in submissions:
            if not isinstance(sub, dict):
                continue
            sid = str(sub.get("student_id") or "")
            tid = str(sub.get("task_id") or "")
            student_row = student_map.get(sid, {})
            task = task_map.get(tid, {})
            if is_tracker_task(task) or is_day_topic_task(task):
                continue
            period = period_map.get(str(task.get("period_id") or ""), {})
            day = day_map.get(str(period.get("day_id") or ""), {})
            plan = plan_map.get(str(day.get("plan_id") or ""), {})
            class_id = str(plan.get("class_id") or "") or None
            content = sub.get("content") if isinstance(sub.get("content"), dict) else {}
            meta = content.get("submission_meta") if isinstance(content.get("submission_meta"), dict) else {}

            flat_data.append(
                {
                    "id": sub.get("id"),
                    "student_id": sid,
                    "student_name": student_row.get("name") or "Unknown",
                    "task_id": tid,
                    "task_title": task.get("title") or "Unknown Task",
                    "task_type": task.get("task_type") or "unknown",
                    "class_id": class_id,
                    "class_name": class_name_map.get(class_id or "", None),
                    "day_number": day.get("day_number"),
                    "scheduled_date": day.get("scheduled_date"),
                    "submission_meta": meta,
                    "marked_done": bool(content.get("toggled")) if isinstance(content, dict) else False,
                    "status": sub.get("status"),
                    "score": sub.get("score"),
                    "feedback": sub.get("feedback"),
                    "submitted_at": sub.get("created_at"),
                    "audio_url": sub.get("audio_url"),
                    "content": content,
                }
            )

        return success(flat_data)
    except Exception:
        # Guardrail: never crash pending queue due to malformed row payloads.
        return success([])


@router.patch("/submissions/{submission_id}/review")
async def review_submission(
    submission_id: str,
    body: sp.SubmissionReview,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    current = (
        admin.table("study_plan_submissions")
        .select("student_id, task_id, tenant_id")
        .eq("id", submission_id)
        .maybe_single()
        .execute()
    )
    if not current.data:
        return error("NOT_FOUND", "Submission not found", 404)
    
    update_data = {
        "status": body.status.value,
        "feedback": body.feedback,
        "score": body.score,
        "reviewed_by": str(token.user_id),
        "reviewed_at": datetime.utcnow().isoformat()
    }
    
    # If there's a response override (for MCQs), update the content
    if body.responses_override is not None:
        sub_res = admin.table("study_plan_submissions").select("content").eq("id", submission_id).maybe_single().execute()
        if sub_res.data:
            content = sub_res.data["content"] or {}
            content["responses"] = body.responses_override
            update_data["content"] = content

    res = admin.table("study_plan_submissions").update(update_data).eq("id", submission_id).execute()
    student_id = str(current.data.get("student_id") or "")
    task_id = str(current.data.get("task_id") or "")
    tenant_id = str(current.data.get("tenant_id") or token.tenant_id or "")
    if student_id and task_id and tenant_id:
        task_res = (
            admin.table("study_plan_tasks")
            .select("*, study_plan_periods(study_plan_days(*))")
            .eq("id", task_id)
            .limit(1)
            .execute()
        )
        task = task_res.data[0] if task_res.data else None
        class_id = resolve_class_id_from_task(admin, task) if task else None
        if class_id:
            # Broadcast real-time event to student portal
            await broadcast_submission_reviewed(
                tenant_id=tenant_id,
                class_id=class_id,
                student_id=student_id,
                submission_id=submission_id,
                task_id=task_id,
                score=body.score,
                status=body.status.value,
            )
            await invalidate_student_study_plan_cache(tenant_id, class_id, student_id)
            # Also invalidate teacher caches so dashboard shows updated reviews
            from app.services.study_plan_cache_service import invalidate_study_plan_caches
            await invalidate_study_plan_caches(tenant_id, class_id)
        await invalidate_student_progress_report_caches(tenant_id, student_id)

    return success(res.data[0] if res.data else {})


# ── Profile update ────────────────────────────────────────────

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


@router.post("/complete-profile")
async def complete_teacher_profile(
    body: ProfileComplete,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    update_data = body.dict()
    update_data["is_registered"] = True
    full_name = f"{body.first_name} {body.last_name}".strip()
    update_data["name"] = full_name

    admin.table("users").update(update_data).eq("id", token.user_id).eq("tenant_id", token.tenant_id).execute()

    return success({"message": "Profile completed successfully"})


class TeacherDayCreate(sp.TeacherDayCreate): pass
class TeacherDayUpdate(sp.TeacherDayUpdate): pass
class TeacherPeriodCreate(sp.TeacherPeriodCreate): pass
class TeacherPeriodUpdate(sp.TeacherPeriodUpdate): pass
class TeacherTaskCreate(sp.TeacherTaskCreate): pass
class TeacherTaskUpdate(sp.TeacherTaskUpdate): pass


# ── Teacher Plan Editing ──────────────────────────────────────

@router.post("/study-plans/days")
async def create_classroom_day(
    body: TeacherDayCreate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    
    # Touch parent plan to mark as dirty
    admin.table("study_plans").update({"updated_at": "now()"}).eq("id", body.plan_id).execute()

    # 1. Fetch the plan to see if it's template-linked
    plan_res = admin.table("study_plans").select("template_id").eq("id", body.plan_id).maybe_single().execute()
    plan_data = plan_res.data if plan_res.data else {}
    
    # 2. Determine target (template vs instance)
    # If linked to a template, we add the day to the template to keep them in sync
    target_field = "template_id" if plan_data.get("template_id") else "plan_id"
    target_id = plan_data.get("template_id") if plan_data.get("template_id") else str(body.plan_id)

    res = admin.table("study_plan_days").insert({
        target_field: target_id,
        "day_number": body.day_number,
        "scheduled_date": body.scheduled_date.isoformat() if body.scheduled_date else None
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/days/{day_id}")
async def update_classroom_day(
    day_id: str,
    body: TeacherDayUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    before_res = admin.table("study_plan_days").select("*").eq("id", day_id).maybe_single().execute()
    before_row = before_res.data if before_res else None

    update_data = {}
    if body.day_number is not None: update_data["day_number"] = body.day_number
    
    # Handle date conversion carefully to avoid 422
    if "scheduled_date" in body.dict(exclude_unset=True):
        update_data["scheduled_date"] = body.scheduled_date.isoformat() if body.scheduled_date else None
    
    if body.is_accessible is not None:
        update_data["is_accessible"] = body.is_accessible
    
    await touch_plan_by_day(day_id)
    res = admin.table("study_plan_days").update(update_data).eq("id", day_id).execute()
    updated = res.data[0] if res.data else {}
    if before_row and updated:
        record_teacher_study_plan_change(
            entity_type="day",
            entity_id=day_id,
            change_type="update",
            previous_details=snapshot_for_entity("day", before_row),
            new_details=snapshot_for_entity("day", updated),
            teacher_user_id=token.user_id,
        )
    return success(updated)

@router.delete("/study-plans/days/{day_id}")
async def delete_classroom_day(
    day_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_day(day_id)
    admin = get_admin_client()
    admin.table("study_plan_days").delete().eq("id", day_id).execute()
    return success({"deleted": True})

@router.post("/study-plans/periods")
async def create_classroom_period(
    body: TeacherPeriodCreate,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_day(str(body.day_id))

    admin = get_admin_client()
    res = admin.table("study_plan_periods").insert({
        "day_id": str(body.day_id),
        "title": body.title,
        "duration_minutes": body.duration_minutes,
        "order_index": body.order_index
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/periods/{period_id}")
async def update_classroom_period(
    period_id: str,
    body: TeacherPeriodUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    before_res = admin.table("study_plan_periods").select("*").eq("id", period_id).maybe_single().execute()
    before_row = before_res.data if before_res else None

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    await touch_plan_by_period(period_id)
    res = admin.table("study_plan_periods").update(update_data).eq("id", period_id).execute()
    updated = res.data[0] if res.data else {}
    if before_row and updated:
        record_teacher_study_plan_change(
            entity_type="period",
            entity_id=period_id,
            change_type="update",
            previous_details=snapshot_for_entity("period", before_row),
            new_details=snapshot_for_entity("period", updated),
            teacher_user_id=token.user_id,
        )
    return success(updated)

@router.delete("/study-plans/periods/{period_id}")
async def delete_classroom_period(
    period_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_period(period_id)
    admin = get_admin_client()
    admin.table("study_plan_periods").delete().eq("id", period_id).execute()
    return success({"deleted": True})

@router.post("/study-plans/tasks")
async def create_classroom_task(
    body: TeacherTaskCreate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    period_id = str(body.period_id)

    await touch_plan_by_period(period_id)
    class_id = resolve_class_id_from_period_id(admin, period_id)

    res = admin.table("study_plan_tasks").insert({
        "period_id": period_id,
        "tenant_id": str(token.tenant_id),
        "title": body.title,
        "description": body.description,
        "task_type": body.task_type.value,
        "required": body.required,
        "order_index": body.order_index,
        "config": _merge_task_config(body.config, body.kpi_bucket)
    }).execute()

    created = res.data[0] if res.data else {}
    if created:
        try:
            record_teacher_study_plan_change(
                entity_type="task",
                entity_id=str(created.get("id", "")),
                change_type="create",
                previous_details={},
                new_details=snapshot_for_entity("task", created),
                teacher_user_id=token.user_id,
            )
        except Exception:
            _logger.exception("Failed to record study plan change for new task")

    if class_id:
        await invalidate_study_plan_caches(str(token.tenant_id), class_id)

    return success(created, status_code=201)

@router.patch("/study-plans/tasks/{task_id}")
async def update_classroom_task(
    task_id: str,
    body: TeacherTaskUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    before_res = admin.table("study_plan_tasks").select("*").eq("id", task_id).limit(1).execute()
    before_row = before_res.data[0] if before_res.data else None

    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if "task_type" in update_data and update_data["task_type"]:
        update_data["task_type"] = update_data["task_type"].value
    if "config" in update_data or "kpi_bucket" in update_data:
        update_data["config"] = _merge_task_config(update_data.get("config"), update_data.get("kpi_bucket"))
    update_data.pop("kpi_bucket", None)
    
    await touch_plan_by_task(task_id)
    res = admin.table("study_plan_tasks").update(update_data).eq("id", task_id).execute()
    updated = res.data[0] if res.data else {}
    if before_row and updated:
        try:
            record_teacher_study_plan_change(
                entity_type="task",
                entity_id=task_id,
                change_type="update",
                previous_details=snapshot_for_entity("task", before_row),
                new_details=snapshot_for_entity("task", updated),
                teacher_user_id=token.user_id,
            )
        except Exception:
            _logger.exception("Failed to record study plan change for task %s", task_id)
    class_id = resolve_class_id_from_task(admin, updated or before_row or {})
    if class_id and token.tenant_id:
        await invalidate_study_plan_caches(str(token.tenant_id), class_id)
    return success(updated)

@router.delete("/study-plans/tasks/{task_id}")
async def delete_classroom_task(
    task_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_task(task_id)
    admin = get_admin_client()
    admin.table("study_plan_tasks").delete().eq("id", task_id).execute()
    return success({"deleted": True})


@router.get("/students/{student_id}/study-plan/{class_id}/progress")
async def get_student_study_plan_progress(
    student_id: str,
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns the full study plan structure for a student in a class,
    including their submission status and scores for every task.
    """
    admin = get_admin_client()
    
    # 1. Verify class belongs to teacher/tenant
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
    
    class_res = q.eq("id", class_id).maybe_single().execute()
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # 2. Get the latest active plan for this classroom (same behavior as student)
    plan_res = (
        admin.table("study_plans")
        .select("*")
        .eq("class_id", class_id)
        .eq("tenant_id", token.tenant_id)
        .eq("status", "active")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    plan = (plan_res.data or [None])[0] if plan_res else None
    if not plan:
        return error("NOT_FOUND", "No study plan assigned to this classroom", 404)

    plan_id = plan["id"]
    template_id = plan.get("template_id")

    # 3. Fetch days, periods, tasks
    # We fetch days that belong to EITHER the specific plan OR the template it's linked to.
    # This ensures sync even if some days were added to the template and some to the plan.
    q = admin.table("study_plan_days").select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))")
    
    if template_id:
        days_res = q.or_(f"plan_id.eq.{plan_id},template_id.eq.{template_id}").order("day_number").execute()
    else:
        days_res = q.eq("plan_id", plan_id).order("day_number").execute()
    days = days_res.data or []

    # 4. Fetch all submissions by this student for these tasks
    # We'll get task_ids first to filter submissions
    task_ids = []
    for d in days:
        for p in d.get("periods", []):
            for t in p.get("tasks", []):
                task_ids.append(t["id"])
    
    submissions = _fetch_submissions_for_student_tasks(admin, student_id, task_ids)

    # 5. Map latest submission per task
    subs_map: dict[str, dict] = {}
    for sub in submissions:
        task_id = str(sub.get("task_id") or "")
        if not task_id:
            continue
        prev = subs_map.get(task_id)
        if not prev:
            subs_map[task_id] = sub
            continue
        prev_key = str(prev.get("reviewed_at") or prev.get("updated_at") or prev.get("created_at") or "")
        next_key = str(sub.get("reviewed_at") or sub.get("updated_at") or sub.get("created_at") or "")
        if next_key > prev_key:
            subs_map[task_id] = sub
    
    overall_bucket_records = []
    for d in days:
        filter_submittable_tasks(d)
        day_tasks_count = 0
        day_completed_count = 0
        day_reviewed_count = 0
        day_total_score = 0
        day_bucket_records = []
        
        for p in d.get("periods", []):
            period_tasks_count = 0
            period_completed_count = 0
            period_reviewed_count = 0
            period_total_score = 0
            period_bucket_records = []
            
            p["tasks"].sort(key=lambda x: x.get("order_index", 0))
            for t in p["tasks"]:
                period_tasks_count += 1
                day_tasks_count += 1
                sub = subs_map.get(t["id"])
                t["submission"] = sub
                t["kpi_bucket"] = kpi_bucket_for_task(t)
                record = {"task": t, "submission": sub}
                period_bucket_records.append(record)
                day_bucket_records.append(record)
                overall_bucket_records.append(record)
                if sub:
                    period_completed_count += 1
                    day_completed_count += 1
                    if sub["status"] == "reviewed":
                        period_reviewed_count += 1
                        day_reviewed_count += 1
                        score = sub.get("score", 0)
                        period_total_score += score
                        day_total_score += score
            
            p["progress"] = {
                "total": period_tasks_count,
                "completed": period_completed_count,
                "reviewed": period_reviewed_count,
                "pct": round((period_completed_count / period_tasks_count) * 100) if period_tasks_count > 0 else 0,
                "average_score": round(period_total_score / period_reviewed_count) if period_reviewed_count > 0 else 0,
                "is_fully_corrected": period_reviewed_count == period_tasks_count and period_tasks_count > 0
            }
            p["bucket_progress"] = summarize_bucket_progress(period_bucket_records)
        
        d["periods"].sort(key=lambda x: x.get("order_index", 0))
        d["progress"] = {
            "total": day_tasks_count,
            "completed": day_completed_count,
            "reviewed": day_reviewed_count,
            "pct": round((day_completed_count / day_tasks_count) * 100) if day_tasks_count > 0 else 0,
            "average_score": round(day_total_score / day_reviewed_count) if day_reviewed_count > 0 else 0,
            "is_fully_corrected": day_reviewed_count == day_tasks_count and day_tasks_count > 0
        }
        d["bucket_progress"] = summarize_bucket_progress(day_bucket_records)

    # Calculate overall progress
    overall_progress = await get_student_overall_progress(admin, student_id, plan_id, template_id)

    return success({
        "plan": plan,
        "days": days,
        "overall_progress": overall_progress,
        "bucket_progress": summarize_bucket_progress(overall_bucket_records),
    })


@router.get("/classrooms/{class_id}/study-plan")
async def get_teacher_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns the full study plan structure for a classroom.
    Teacher edit view — shows any non-archived plan (not just active).
    Uses Redis caching for improved performance.
    """
    # Use the cached teacher study plan (shows non-archived plan for editing)
    plan, cache_hit = await get_cached_teacher_study_plan(str(token.tenant_id), class_id)
    if plan is None:
        return error("NOT_FOUND", "No study plan assigned to this classroom", 404)

    response = success(plan)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    return response


@router.get("/classrooms/{class_id}/study-plan-source")
async def get_teacher_classroom_study_plan_source(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns the PDF source metadata for a classroom study plan.
    Uses Redis caching for improved performance.
    """
    payload, cache_hit = await get_cached_study_plan_source(str(token.tenant_id), class_id)
    response = success(payload)
    response.headers["X-Cache"] = "HIT" if cache_hit else "MISS"
    return response

