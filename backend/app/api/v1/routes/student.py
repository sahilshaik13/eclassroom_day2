"""
Student routes — all require role=student JWT.

GET  /api/v1/classroom/tasks/today
GET  /api/v1/classroom/tasks/week
POST /api/v1/classroom/tasks/{task_id}/complete
DEL  /api/v1/classroom/tasks/{task_id}/complete
GET  /api/v1/classroom/classes/my
GET  /api/v1/classroom/partner
GET  /api/v1/announcements/latest
"""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from app.schemas import study_plan as sp
from typing import Optional

from app.core.deps import require_student, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client


router = APIRouter(prefix="/student", tags=["student"])

# ── Today's tasks ─────────────────────────────────────────────

@router.get("/tasks/today")
async def get_today_tasks(request: Request, token: TokenData = Depends(require_student)):
    admin = get_admin_client()
    today = date.today().isoformat()

    # 1. Get student record
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)
    student_id = student_res.data["id"]

    # 2. Find scheduled days for today
    # Find plans for classes this student is enrolled in
    enrolled_res = admin.table("class_enrollments").select("class_id").eq("student_id", student_id).execute()
    class_ids = [r["class_id"] for r in (enrolled_res.data or [])]
    
    if not class_ids: return success([])

    plans_res = admin.table("study_plans").select("id").in_("class_id", class_ids).eq("status", "active").execute()
    plan_ids = [r["id"] for r in (plans_res.data or [])]

    if not plan_ids: return success([])

    # Find days scheduled for today
    days_res = (
        admin.table("study_plan_days")
        .select("id, day_number, study_plans(name), study_plan_periods(id, title, study_plan_tasks(*, study_plan_submissions(*)))")
        .in_("plan_id", plan_ids)
        .eq("scheduled_date", today)
        .execute()
    )

    tasks = []
    for day in (days_res.data or []):
        if not day.get("is_accessible", False):
            continue
            
        plan_name = day.get("study_plans", {}).get("name", "Study Plan")
        for period in (day.get("study_plan_periods") or []):
            for t in (period.get("study_plan_tasks") or []):
                # Check if student already submitted this task
                submissions = t.pop("study_plan_submissions", []) or []
                my_sub = next((s for s in submissions if s["student_id"] == student_id), None)
                
                tasks.append({
                    **t,
                    "plan_name": plan_name,
                    "period_title": period["title"],
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
    from datetime import datetime

    # 1. Get student record
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    # 2. Get task and day details
    task_res = admin.table("study_plan_tasks").select("*, study_plan_periods(study_plan_days(*))").eq("id", task_id).maybe_single().execute()
    if not task_res.data: return error("NOT_FOUND", "Task not found", 404)
    task = task_res.data
    
    day = task.get("study_plan_periods", {}).get("study_plan_days", {})
    if not day.get("is_accessible"):
        return error("FORBIDDEN", "This day is not yet accessible", 403)
        
    scheduled_date_str = day.get("scheduled_date")
    if scheduled_date_str:
        from datetime import date
        if date.fromisoformat(scheduled_date_str) > date.today():
            return error("FORBIDDEN", "Cannot complete tasks for future dates", 403)

    # 3. Create/Upsert submission
    sub_data = {
        "tenant_id": token.tenant_id,
        "student_id": student_id,
        "task_id": task_id,
        "status": "submitted",
        "content": body.content,
        "audio_url": body.audio_url,
        "updated_at": datetime.utcnow().isoformat()
    }

    # MCQ AUTO GRADING
    if task["task_type"] == "mcq" and "responses" in body.content:
        correct_count = 0
        questions = task.get("config", {}).get("questions", [])
        student_responses = body.content["responses"] # [{index: 0, answer: 1}, ...]
        
        for q_idx, q_meta in enumerate(questions):
            # Find student's answer for this question index
            ans = next((r["answer"] for r in student_responses if r.get("index") == q_idx), None)
            if ans is not None and ans == q_meta.get("correct_option"):
                correct_count += 1
        
        total = len(questions)
        score = int((correct_count / total) * 100) if total > 0 else 0
        
        sub_data["score"] = score
        sub_data["feedback"] = f"Automated Score: {correct_count}/{total}"
        # We leave it as 'submitted' so the teacher can still review/override if they want

    res = admin.table("study_plan_submissions").upsert(sub_data, on_conflict="student_id,task_id").execute()
    
    response_data = res.data[0] if res.data else {}
    if task["task_type"] == "mcq":
        response_data["total_questions"] = len(task.get("config", {}).get("questions", []))
    
    return success(response_data)


# ── Week progress ─────────────────────────────────────────────

@router.get("/tasks/week")
async def get_week_progress(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)

    student_res = (
        client.table("students").select("id")
        .eq("user_id", token.user_id).single().execute()
    )
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

    # Aggregate by date
    by_date: dict[str, dict] = {}
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


# ── Mark task complete ────────────────────────────────────────

@router.post("/tasks/{completion_id}/complete")
async def complete_task(
    completion_id: str,
    request: Request,
    token: TokenData = Depends(require_student),
):
    client = get_user_client(request.state.jwt_token)
    from datetime import datetime, timezone

    res = (
        client.table("task_completions")
        .update({"completed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", completion_id)
        .execute()
    )

    if not res.data:
        return error("NOT_FOUND", "Task not found or already completed", 404)

    return success(res.data[0])


# ── Un-complete task ──────────────────────────────────────────

@router.delete("/tasks/{completion_id}/complete")
async def uncomplete_task(
    completion_id: str,
    request: Request,
    token: TokenData = Depends(require_student),
):
    client = get_user_client(request.state.jwt_token)

    res = (
        client.table("task_completions")
        .update({"completed_at": None, "notes": None})
        .eq("id", completion_id)
        .execute()
    )

    if not res.data:
        return error("NOT_FOUND", "Task not found", 404)

    return success(res.data[0])


@router.patch("/tasks/{task_id}/toggle")
async def toggle_task(
    task_id: str,
    token: TokenData = Depends(require_student)
):
    admin = get_admin_client()
    from datetime import datetime

    # 1. Get student record
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]

    # 2. Check if submission exists
    existing = admin.table("study_plan_submissions").select("id, status").eq("student_id", student_id).eq("task_id", task_id).maybe_single().execute()
    
    if existing.data:
        # Toggle: if submitted, we can't easily "un-submit" without deleting, 
        # but for simple tasks, we'll just delete the submission to mark as uncompleted
        admin.table("study_plan_submissions").delete().eq("id", existing.data["id"]).execute()
        return success({"completed": False})
    else:
        # Mark as completed
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

    student_res = (
        client.table("students").select("id")
        .eq("user_id", token.user_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

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


@router.get("/classes/{class_id}/study-plan")
async def get_student_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_student)
):
    admin = get_admin_client()
    
    # Verify student is enrolled in this class
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).maybe_single().execute()
    if not student_res.data: return error("NOT_FOUND", "Student not found", 404)
    student_id = student_res.data["id"]
    
    enr_check = admin.table("class_enrollments").select("id").eq("class_id", class_id).eq("student_id", student_id).maybe_single().execute()
    if not enr_check.data:
        return error("FORBIDDEN", "Not enrolled in this classroom", 403)

    # Fetch active plan for this classroom (must be active/published for students)
    plan_res = admin.table("study_plans").select("*").eq("class_id", class_id).eq("tenant_id", token.tenant_id).eq("status", "active").maybe_single().execute()
    if not plan_res.data:
        return success(None)

    plan = plan_res.data
    plan_id = plan["id"]
    days_res = (
        admin.table("study_plan_days")
        .select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*, study_plan_submissions(*)))")
        .eq("plan_id", plan_id)
        .order("day_number")
        .execute()
    )
    
    from datetime import date
    today = date.today()
    days = days_res.data or []
    
    # Filter content based on accessibility and date
    for day in days:
        is_accessible = day.get("is_accessible", False)
        scheduled_date_str = day.get("scheduled_date")
        
        # Check if date has arrived
        date_arrived = True
        if scheduled_date_str:
            scheduled_date = date.fromisoformat(scheduled_date_str)
            if scheduled_date > today:
                date_arrived = False

        # If not accessible or date not arrived, hide periods and tasks
        if not is_accessible or not date_arrived:
            day["periods"] = []
            day["is_locked"] = True
            day["lock_reason"] = "Date not arrived" if not date_arrived else "Waiting for teacher access"
        else:
            day["is_locked"] = False
            # Filter submissions to only include this student's own work
            for period in (day.get("periods") or []):
                for task in (period.get("tasks") or []):
                    all_subs = task.get("study_plan_submissions") or []
                    task["study_plan_submissions"] = [s for s in all_subs if s["student_id"] == student_id]
    
    plan["days"] = days
    return success(plan)


# ── Accountability partner ────────────────────────────────────

@router.get("/partner")
async def get_partner(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)

    student_res = (
        client.table("students")
        .select("accountability_partner_id")
        .eq("user_id", token.user_id)
        .single()
        .execute()
    )
    if not student_res.data or not student_res.data.get("accountability_partner_id"):
        return success(None)

    partner_id = student_res.data["accountability_partner_id"]
    partner_res = (
        client.table("students")
        .select("id, name, phone")
        .eq("id", partner_id)
        .single()
        .execute()
    )

    return success(partner_res.data)


# ── Doubts ────────────────────────────────────────────────────

# ── Full study plan (all days) ────────────────────────────────

@router.get("/tasks/plan")
async def get_full_plan(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)

    student_res = (
        client.table("students").select("id")
        .eq("user_id", token.user_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    student_id = student_res.data["id"]

    res = (
        client.table("task_completions")
        .select("id, assigned_date, completed_at, notes, study_plan_tasks(id, title, description, task_type, day_number)")
        .eq("student_id", student_id)
        .order("assigned_date")
        .execute()
    )

    tasks = []
    for row in (res.data or []):
        task = row.get("study_plan_tasks") or {}
        tasks.append({
            "id": row["id"],
            "task_id": task.get("id"),
            "title": task.get("title", ""),
            "description": task.get("description"),
            "task_type": task.get("task_type", "memorise"),
            "day_number": task.get("day_number", 1),
            "assigned_date": row["assigned_date"],
            "completed": row["completed_at"] is not None,
            "completed_at": row["completed_at"],
            "notes": row["notes"],
        })

    return success(tasks)


# ── Profile update ────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: str

@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    token: TokenData = Depends(require_student),
):
    admin = get_admin_client()
    admin.table("users").update({"name": body.name}).eq("id", token.user_id).execute()
    admin.table("students").update({"name": body.name}).eq("user_id", token.user_id).execute()
    return success({"name": body.name})


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
async def complete_student_profile(
    body: ProfileComplete,
    request: Request,
    token: TokenData = Depends(require_student),
):
    admin = get_admin_client()
    update_data = body.dict()
    update_data["is_registered"] = True
    full_name = f"{body.first_name} {body.last_name}".strip()
    update_data["name"] = full_name
    
    # Update users table (strict tenant isolation)
    admin.table("users").update(update_data).eq("id", token.user_id).eq("tenant_id", token.tenant_id).execute()
    # Update students table
    admin.table("students").update({"name": full_name}).eq("user_id", token.user_id).eq("tenant_id", token.tenant_id).execute()
    
    return success({"message": "Profile completed successfully"})


# ── Latest announcement ────────────────────────────────────────

@router.get("/announcements/latest")
async def get_latest_announcement(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    res = (
        client.table("announcements")
        .select("body")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    body_text = res.data[0]["body"] if res.data else None
    return success({"body": body_text})


class DoubtCreate(BaseModel):
    title: str
    body: str
    class_id: str
    task_id: Optional[str] = None


@router.get("/doubts")
async def get_my_doubts(
    request: Request,
    status: Optional[str] = None,
    token: TokenData = Depends(require_student),
):
    client = get_user_client(request.state.jwt_token)

    student_res = (
        client.table("students").select("id")
        .eq("user_id", token.user_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    q = (
        client.table("doubts")
        .select("*, doubt_responses(id, body, created_at, users!doubt_responses_teacher_id_fkey(name))")
        .eq("student_id", student_res.data["id"])
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)

    res = q.execute()
    return success(res.data or [])


@router.post("/doubts")
async def create_doubt(
    body: DoubtCreate,
    request: Request,
    token: TokenData = Depends(require_student),
):
    client = get_user_client(request.state.jwt_token)

    student_res = (
        client.table("students").select("id, tenant_id")
        .eq("user_id", token.user_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

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
