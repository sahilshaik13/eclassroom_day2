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
from typing import Optional

from app.core.deps import require_student, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client


router = APIRouter(prefix="/classroom", tags=["student"])

# ── Today's tasks ─────────────────────────────────────────────

@router.get("/tasks/today")
async def get_today_tasks(request: Request, token: TokenData = Depends(require_student)):
    client = get_user_client(request.state.jwt_token)
    today = date.today().isoformat()

    # Get student record for this user
    student_res = (
        client.table("students")
        .select("id")
        .eq("user_id", token.user_id)
        .single()
        .execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    student_id = student_res.data["id"]

    # Get task completions for today joined with task details
    res = (
        client.table("task_completions")
        .select("id, assigned_date, completed_at, notes, study_plan_tasks(id, title, description, task_type, day_number)")
        .eq("student_id", student_id)
        .eq("assigned_date", today)
        .execute()
    )

    tasks = []
    for row in (res.data or []):
        task = row.get("study_plan_tasks") or {}
        tasks.append({
            "id": row["id"],                         # completion row id — used for complete/uncomplete
            "task_id": task.get("id"),
            "title": task.get("title", ""),
            "description": task.get("description"),
            "task_type": task.get("task_type", "memorise"),
            "day_number": task.get("day_number", 1),
            "completed": row["completed_at"] is not None,
            "completed_at": row["completed_at"],
            "notes": row["notes"],
        })

    return success(tasks)


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
