"""
Student routes — all require role=student JWT.
"""
from datetime import date, timedelta, datetime, timezone
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional, List
from app.schemas import study_plan as sp
from app.services.study_plan_pdf_import_service import build_import_payload
from app.services.study_plan_kpi_service import kpi_bucket_for_task, summarize_bucket_progress

from app.core.deps import require_student, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client

router = APIRouter(prefix="/student", tags=["student"])

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
    title: str
    body: str
    class_id: str
    task_id: Optional[str] = None

# ── Today's tasks ─────────────────────────────────────────────

@router.get("/tasks/today")
async def get_today_tasks(request: Request, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    today = date.today().isoformat()

    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)
    student_id = student_res.data["id"]

    enrolled_res = admin.table("class_enrollments").select("class_id").eq("student_id", student_id).execute()
    class_ids = [r["class_id"] for r in (enrolled_res.data or [])]
    
    if not class_ids: return success([])

    plans_res = admin.table("study_plans").select("id").in_("class_id", class_ids).eq("status", "active").execute()
    plan_ids = [r["id"] for r in (plans_res.data or [])]

    if not plan_ids: return success([])

    days_res = (
        admin.table("study_plan_days")
        .select("id, day_number, scheduled_date, study_plans(name), study_plan_periods(id, title, study_plan_tasks(*, study_plan_submissions(*)))")
        .in_("plan_id", plan_ids)
        .eq("scheduled_date", today)
        .execute()
    )

    tasks = []
    for day in (days_res.data or []):
        if not day.get("is_accessible", False):
            continue

        plan_name = day.get("study_plans", {}).get("name", "Study Plan")
        day_number = day.get("day_number")
        for period in (day.get("study_plan_periods") or []):
            for t in (period.get("study_plan_tasks") or []):
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

    return success(tasks)

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
    
    day = task.get("study_plan_periods", {}).get("study_plan_days", {})
    if not day.get("is_accessible"):
        return error("FORBIDDEN", "This day is not yet accessible", 403)
        
    scheduled_date_str = day.get("scheduled_date")
    if scheduled_date_str:
        if date.fromisoformat(scheduled_date_str) > date.today():
            return error("FORBIDDEN", "Cannot complete tasks for future dates", 403)

    sub_data = {
        "tenant_id": token.tenant_id,
        "student_id": student_id,
        "task_id": task_id,
        "status": "submitted",
        "content": body.content,
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
    if not res.data: return error("NOT_FOUND", "Task not found", 404)
    return success(res.data[0])

@router.delete("/tasks/{completion_id}/complete")
async def uncomplete_task(completion_id: str, request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    res = client.table("task_completions").update({"completed_at": None, "notes": None}).eq("id", completion_id).execute()
    if not res.data: return error("NOT_FOUND", "Task not found", 404)
    return success(res.data[0])

@router.patch("/tasks/{task_id}/toggle")
async def toggle_task(task_id: str, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    existing = admin.table("study_plan_submissions").select("id, status").eq("student_id", student_id).eq("task_id", task_id).maybe_single().execute()
    if existing.data:
        admin.table("study_plan_submissions").delete().eq("id", existing.data["id"]).execute()
        return success({"completed": False})
    else:
        new_sub = {
            "tenant_id": token.tenant_id,
            "student_id": student_id,
            "task_id": task_id,
            "status": "submitted",
            "content": {"toggled": True},
            "created_at": datetime.utcnow().isoformat()
        }
        admin.table("study_plan_submissions").insert(new_sub).execute()
        return success({"completed": True})

# ── My classes ────────────────────────────────────────────────

@router.get("/classes/my")
async def get_my_classes(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("id").eq("user_id", token.user_id).single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student record not found", 404)
    student_id = student_res.data["id"]

    res = (
        client.table("class_enrollments")
        .select("classes(id, name, zoom_link, schedule_json, users!classes_teacher_id_fkey(name))")
        .eq("student_id", student_id)
        .execute()
    )

    classes = []
    for row in (res.data or []):
        c = row.get("classes") or {}
        teacher = c.pop("users", None) or {}
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
        "*, periods:study_plan_periods(*, tasks:study_plan_tasks(*, study_plan_submissions(*)))"
    )
    filter_clause = f"plan_id.eq.{plan_id}"
    if template_id:
        filter_clause += f",template_id.eq.{template_id}"

    days_res = q.or_(filter_clause).order("day_number").execute()
    today = date.today()
    days = _safe_data(days_res) or []
    plan_bucket_records = []

    for day in days:
        is_accessible = day.get("is_accessible", False)
        scheduled_date_str = day.get("scheduled_date")
        date_arrived = True
        if scheduled_date_str:
            if date.fromisoformat(scheduled_date_str) > today:
                date_arrived = False

        if not is_accessible or not date_arrived:
            day["periods"] = []
            day["is_locked"] = True
            day["lock_reason"] = "Date not arrived" if not date_arrived else "Waiting for teacher access"
        else:
            day["is_locked"] = False
            day_bucket_records = []
            for period in (day.get("periods") or []):
                period_bucket_records = []
                for task in (period.get("tasks") or []):
                    all_subs = task.get("study_plan_submissions") or []
                    task["study_plan_submissions"] = [s for s in all_subs if s["student_id"] == student_id]
                    task["kpi_bucket"] = kpi_bucket_for_task(task)
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


@router.get("/study-plan")
async def get_student_aggregate_study_plan(token: TokenData = Depends(require_student)):
    """First enrolled classroom with an active plan (StudyPlanPage uses this path)."""
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    enr = admin.table("class_enrollments").select("class_id").eq("student_id", student_id).execute()
    class_ids = [r["class_id"] for r in (enr.data or [])]
    for cid in class_ids:
        bundle = _student_class_study_plan_bundle(admin, student_id, token.tenant_id, cid)
        if bundle and (bundle.get("days") or []):
            return success(bundle)
    return success(None)


@router.get("/study-plan-source")
async def get_student_aggregate_study_plan_source(token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    enr = admin.table("class_enrollments").select("class_id").eq("student_id", student_id).execute()
    class_ids = [r["class_id"] for r in (enr.data or [])]
    if not class_ids:
        return success(None)

    for cid in class_ids:
        plan_res = (
            admin.table("study_plans")
            .select("source_import_id")
            .eq("class_id", cid)
            .eq("tenant_id", token.tenant_id)
            .eq("status", "active")
            .maybe_single()
            .execute()
        )
        plan = plan_res.data if plan_res else None
        if not plan or not plan.get("source_import_id"):
            continue

        import_res = (
            admin.table("study_plan_pdf_imports")
            .select("*")
            .eq("id", plan["source_import_id"])
            .eq("tenant_id", token.tenant_id)
            .maybe_single()
            .execute()
        )
        import_row = import_res.data if import_res else None
        if import_row:
            return success(build_import_payload(import_row, admin))
    return success(None)


@router.get("/classes/{class_id}/study-plan")
async def get_student_classroom_study_plan(class_id: str, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    enr_check = (
        admin.table("class_enrollments")
        .select("id")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not enr_check.data:
        return error("FORBIDDEN", "Not enrolled in this classroom", 403)

    bundle = _student_class_study_plan_bundle(admin, student_id, token.tenant_id, class_id)
    return success(bundle)


@router.get("/classes/{class_id}/study-plan-source")
async def get_student_classroom_study_plan_source(class_id: str, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    enr_check = (
        admin.table("class_enrollments")
        .select("id")
        .eq("class_id", class_id)
        .eq("student_id", student_id)
        .maybe_single()
        .execute()
    )
    if not enr_check.data:
        return error("FORBIDDEN", "Not enrolled in this classroom", 403)

    plan_res = (
        admin.table("study_plans")
        .select("source_import_id")
        .eq("class_id", class_id)
        .eq("tenant_id", token.tenant_id)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    plan = plan_res.data if plan_res else None
    if not plan or not plan.get("source_import_id"):
        return success(None)

    import_res = (
        admin.table("study_plan_pdf_imports")
        .select("*")
        .eq("id", plan["source_import_id"])
        .eq("tenant_id", token.tenant_id)
        .maybe_single()
        .execute()
    )
    import_row = import_res.data if import_res else None
    return success(build_import_payload(import_row, admin) if import_row else None)

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

    q = client.table("doubts").select("*, doubt_responses(id, body, created_at, users!doubt_responses_teacher_id_fkey(name))").eq("student_id", student_res.data["id"]).order("created_at", desc=True)
    if status: q = q.eq("status", status)
    res = q.execute()
    return success(res.data or [])

@router.post("/doubts")
async def create_doubt(body: DoubtCreate, request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    student_res = client.table("students").select("id, tenant_id").eq("user_id", token.user_id).single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student record not found", 404)

    new_doubt = {
        "student_id": student_res.data["id"],
        "tenant_id": student_res.data["tenant_id"],
        "class_id": body.class_id,
        "task_id": body.task_id,
        "title": body.title,
        "body": body.body,
        "status": "pending",
    }
    res = client.table("doubts").insert(new_doubt).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


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
