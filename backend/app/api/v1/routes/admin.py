"""
Admin routes — require role=admin + mfa_verified JWT.

GET    /api/v1/admin/stats
GET    /api/v1/admin/students
POST   /api/v1/admin/students
PATCH  /api/v1/admin/students/{id}
DELETE /api/v1/admin/students/{id}
GET    /api/v1/admin/teachers
POST   /api/v1/admin/teachers          (invite by email)
GET    /api/v1/admin/classes
POST   /api/v1/admin/classes
PATCH  /api/v1/admin/classes/{id}
POST   /api/v1/admin/classes/{id}/enroll
GET    /api/v1/admin/study-plans
POST   /api/v1/admin/study-plans
GET    /api/v1/admin/study-plans/{id}/tasks
POST   /api/v1/admin/study-plans/{id}/tasks
DELETE /api/v1/admin/study-plans/{id}/tasks/{task_id}
POST   /api/v1/admin/study-plans/{id}/apply
"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from app.core.deps import require_admin, TokenData
from app.core.response import success, error, paginated
from app.db.supabase import get_admin_client
from app.services.auth_service import AuthService, AuthError
from app.core.config import settings


router = APIRouter(prefix="/admin", tags=["admin"])


# ── Stats ─────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(request: Request, token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    tid = token.tenant_id

    students_res = admin.table("students").select("id", count="exact").eq("tenant_id", tid).is_("deactivated_at", None).execute()
    classes_res  = admin.table("classes").select("id", count="exact").eq("tenant_id", tid).eq("is_active", True).execute()
    teachers_res = admin.table("users").select("id", count="exact").eq("tenant_id", tid).eq("role", "teacher").is_("deactivated_at", None).execute()
    doubts_res   = admin.table("doubts").select("id", count="exact").eq("tenant_id", tid).eq("status", "pending").execute()

    # Attendance % (last 30 days)
    since = (date.today() - timedelta(days=30)).isoformat()
    att_res = admin.table("attendance").select("status").eq("tenant_id", tid).gte("session_date", since).execute()
    att_rows = att_res.data or []
    avg_att = (
        round(len([r for r in att_rows if r["status"] == "present"]) / len(att_rows) * 100)
        if att_rows else 0
    )

    # Task completion % (today)
    comp_res = admin.table("task_completions").select("completed_at").eq("tenant_id", tid).eq("assigned_date", date.today().isoformat()).execute()
    comp_rows = comp_res.data or []
    avg_comp = (
        round(len([r for r in comp_rows if r["completed_at"]]) / len(comp_rows) * 100)
        if comp_rows else 0
    )

    return success({
        "total_students": students_res.count or 0,
        "total_classes": classes_res.count or 0,
        "total_teachers": teachers_res.count or 0,
        "active_doubts": doubts_res.count or 0,
        "avg_attendance_pct": avg_att,
        "avg_task_completion_pct": avg_comp,
    })


# ── Students ──────────────────────────────────────────────────

@router.get("/students")
async def list_students(
    request: Request,
    search: Optional[str] = None,
    class_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    q = (
        admin.table("students")
        .select("*, class_enrollments(class_id, classes(name))", count="exact")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
    )
    if search:
        q = q.ilike("name", f"%{search}%")
    res = q.execute()
    return paginated(res.data or [], page, limit, res.count or 0)


class StudentCreate(BaseModel):
    name: str
    phone: str
    class_id: Optional[str] = None


@router.post("/students")
async def create_student(
    body: StudentCreate,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()

    # Create auth user (phone-based, no password) via REST API to avoid gotrue deadlocks
    import httpx

    auth_headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    
    payload = {
        "phone": body.phone,
        "phone_confirm": True,
        "app_metadata": {"role": "student", "tenant_id": token.tenant_id},
        "user_metadata": {"name": body.name},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            json=payload,
            headers=auth_headers
        )

    if resp.status_code >= 400:
        error_msg = resp.json().get("msg", resp.text) if "application/json" in resp.headers.get("Content-Type", "") else resp.text
        return error("CREATE_ERROR", error_msg, 400)

    auth_res = resp.json()
    user_id = auth_res.get("id")

    # Insert user row
    admin.table("users").insert({
        "id": user_id,
        "tenant_id": token.tenant_id,
        "role": "student",
        "phone": body.phone,
        "name": body.name,
    }).execute()

    # Insert student row
    stu_res = admin.table("students").insert({
        "user_id": user_id,
        "tenant_id": token.tenant_id,
        "name": body.name,
        "phone": body.phone,
    }).execute()

    student = stu_res.data[0] if stu_res.data else {}

    # Enroll in class if provided
    if body.class_id and student.get("id"):
        admin.table("class_enrollments").insert({
            "student_id": student["id"],
            "class_id": body.class_id,
            "tenant_id": token.tenant_id,
        }).execute()

    return success(student, status_code=201)


@router.patch("/students/{student_id}")
async def update_student(
    student_id: str,
    body: dict,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    
    # 1. Get current student to find user_id
    stu = admin.table("students").select("user_id").eq("id", student_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not stu.data:
        return error("NOT_FOUND", "Student not found", 404)
    user_id = stu.data["user_id"]

    # 2. Update auth user if phone or name changed
    new_name = body.get("name")
    new_phone = body.get("phone")
    
    if new_name or new_phone:
        import httpx
        
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        
        payload = {}
        if new_phone:
            # Normalize new phone
            new_phone = "".join(filter(lambda x: x.isdigit() or x == '+', new_phone))
            payload["phone"] = new_phone
        if new_name:
            payload["user_metadata"] = {"name": new_name}

        if payload:
            async with httpx.AsyncClient() as client:
                resp = await client.put(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                    json=payload,
                    headers=auth_headers
                )
                if resp.status_code >= 400:
                    return error("AUTH_UPDATE_ERROR", resp.text, resp.status_code)

    # 3. Update public schema
    allowed = {k: v for k, v in body.items() if k in ("name", "phone")}
    if allowed:
        admin.table("students").update(allowed).eq("id", student_id).eq("tenant_id", token.tenant_id).execute()
        admin.table("users").update(allowed).eq("id", user_id).eq("tenant_id", token.tenant_id).execute()
        
    return success({"updated": True})


@router.delete("/students/{student_id}")
async def deactivate_student(
    student_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    from datetime import datetime, timezone
    admin = get_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    
    # Update student (only if matched by id AND tenant_id)
    stu_res = admin.table("students").update({"deactivated_at": now}).eq("id", student_id).eq("tenant_id", token.tenant_id).execute()
    
    if stu_res.data:
        # If student found, also deactivate their linked user account (ensure same tenant)
        user_id = stu_res.data[0]["user_id"]
        admin.table("users").update({"deactivated_at": now, "is_active": False}).eq("id", user_id).eq("tenant_id", token.tenant_id).execute()
    
    return success({"deactivated": True})


# ── Teachers ──────────────────────────────────────────────────

@router.get("/teachers")
async def list_teachers(request: Request, token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    res = (
        admin.table("users")
        .select("id, name, email, deactivated_at, classes(count)")
        .eq("tenant_id", token.tenant_id)
        .eq("role", "teacher")
        .order("created_at", desc=True)
        .execute()
    )
    return success(res.data or [])


class TeacherInvite(BaseModel):
    email: EmailStr
    name: str


@router.post("/teachers")
async def invite_teacher(
    body: TeacherInvite,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    try:
        # For teacher invites, always redirect through the password setup flow.
        # Supabase will verify the invite token, then redirect to this URL
        # with either ?token=... or #access_token=... so the frontend can
        # check has_password and gate access accordingly.
        redirect_to = f"{settings.FRONTEND_URL}/auth/setup-password"
        result = await AuthService.invite_user_by_email(
            email=body.email,
            name=body.name,
            role="teacher",
            tenant_id=token.tenant_id,
            redirect_to=redirect_to,
        )

        # Only sync to users table if invitation actually succeeded
        admin = get_admin_client()
        admin.table("users").upsert({
            "id": result["user_id"],
            "tenant_id": token.tenant_id,
            "role": "teacher",
            "email": body.email,
            "name": body.name,
            "is_active": True, # Ensure active upon invite
        }).execute()

        return success(result, status_code=201)

    except AuthError as e:
        # Check for specific "user already exists" from Supabase
        if "user already exists" in e.message.lower():
            return error("ALREADY_EXISTS", f"A user with email {body.email} is already registered.", 400)
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", f"An unexpected error occurred: {str(e)}", 500)


@router.patch("/teachers/{teacher_id}")
async def update_teacher(
    teacher_id: str,
    body: dict,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    
    # 1. Update auth user if email or name changed
    new_name = body.get("name")
    new_email = body.get("email")
    
    if new_name or new_email:
        import httpx
        
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        
        payload = {}
        if new_email:
            payload["email"] = new_email
        if new_name:
            payload["user_metadata"] = {"name": new_name}

        if payload:
            async with httpx.AsyncClient() as client:
                resp = await client.put(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users/{teacher_id}",
                    json=payload,
                    headers=auth_headers
                )
                if resp.status_code >= 400:
                    return error("AUTH_UPDATE_ERROR", resp.text, resp.status_code)

    # 2. Update public schema
    allowed = {k: v for k, v in body.items() if k in ("name", "email")}
    if allowed:
        admin.table("users").update(allowed).eq("id", teacher_id).eq("role", "teacher").eq("tenant_id", token.tenant_id).execute()
        
    return success({"updated": True})


# ── Classes ───────────────────────────────────────────────────

@router.get("/classes")
async def list_classes(request: Request, token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    res = (
        admin.table("classes")
        .select("*, users!classes_teacher_id_fkey(name), class_enrollments(count)")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    classes = []
    for row in (res.data or []):
        teacher = row.pop("users", None) or {}
        enr = row.pop("class_enrollments", []) or []
        classes.append({**row, "teacher_name": teacher.get("name", ""), "enrollment_count": len(enr)})
    return success(classes)


class ClassCreate(BaseModel):
    name: str
    teacher_id: str
    zoom_link: Optional[str] = None
    capacity: Optional[int] = None
    schedule_json: Optional[dict] = None


@router.post("/classes")
async def create_class(
    body: ClassCreate,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("classes").insert({
        "tenant_id": token.tenant_id,
        "teacher_id": body.teacher_id,
        "name": body.name,
        "zoom_link": body.zoom_link,
        "capacity": body.capacity,
        "schedule_json": body.schedule_json,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.patch("/classes/{class_id}")
async def update_class(
    class_id: str,
    body: dict,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    allowed = {k: v for k, v in body.items() if k in ("name", "teacher_id", "zoom_link", "capacity", "schedule_json")}
    res = admin.table("classes").update(allowed).eq("id", class_id).eq("tenant_id", token.tenant_id).execute()
    return success(res.data[0] if res.data else {})


class EnrollPayload(BaseModel):
    student_ids: list[str]


@router.post("/classes/{class_id}/enroll")
async def enroll_students(
    class_id: str,
    body: EnrollPayload,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    
    # 1. Verify class belongs to this tenant
    class_check = admin.table("classes").select("id").eq("id", class_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not class_check.data:
        return error("NOT_FOUND", "Class not found or access denied", 404)

    # 2. Verify all students belong to this tenant
    student_check = admin.table("students").select("id").in_("id", body.student_ids).eq("tenant_id", token.tenant_id).execute()
    valid_ids = [r["id"] for r in (student_check.data or [])]
    
    if len(valid_ids) != len(body.student_ids):
        return error("UNAUTHORIZED", "Some students do not belong to your tenant", 403)

    rows = [{"student_id": sid, "class_id": class_id, "tenant_id": token.tenant_id} for sid in body.student_ids]
    res = admin.table("class_enrollments").upsert(rows, on_conflict="student_id,class_id").execute()
    return success({"enrolled": len(res.data or [])})


# ── Study Plans ───────────────────────────────────────────────

@router.get("/study-plans")
async def list_study_plans(request: Request, token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    res = (
        admin.table("study_plan_templates")
        .select("*, study_plan_tasks(count)")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    plans = []
    for row in (res.data or []):
        tasks = row.pop("study_plan_tasks", []) or []
        plans.append({**row, "task_count": len(tasks)})
    return success(plans)


class StudyPlanCreate(BaseModel):
    name: str
    description: Optional[str] = None
    total_days: int


@router.post("/study-plans")
async def create_study_plan(
    body: StudyPlanCreate,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("study_plan_templates").insert({
        "tenant_id": token.tenant_id,
        "created_by": token.user_id,
        "name": body.name,
        "description": body.description,
        "total_days": body.total_days,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.get("/study-plans/{template_id}/tasks")
async def get_plan_tasks(
    template_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = (
        admin.table("study_plan_tasks")
        .select("*")
        .eq("template_id", template_id)
        .order("day_number")
        .order("order_index")
        .execute()
    )
    return success(res.data or [])


class TaskCreate(BaseModel):
    day_number: int
    title: str
    description: Optional[str] = None
    task_type: str = "memorise"
    order_index: int = 0


@router.post("/study-plans/{template_id}/tasks")
async def add_plan_task(
    template_id: str,
    body: TaskCreate,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("study_plan_tasks").insert({
        "template_id": template_id,
        "tenant_id": token.tenant_id,
        "day_number": body.day_number,
        "title": body.title,
        "description": body.description,
        "task_type": body.task_type,
        "order_index": body.order_index,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.delete("/study-plans/{template_id}/tasks/{task_id}")
async def delete_plan_task(
    template_id: str,
    task_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    admin.table("study_plan_tasks").delete().eq("id", task_id).eq("template_id", template_id).eq("tenant_id", token.tenant_id).execute()
    return success({"deleted": True})


class ApplyPayload(BaseModel):
    class_id: str
    start_date: Optional[str] = None   # YYYY-MM-DD, defaults to today


@router.post("/study-plans/{template_id}/apply")
async def apply_study_plan(
    template_id: str,
    body: ApplyPayload,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    start = date.fromisoformat(body.start_date) if body.start_date else date.today()

    # Get all enrolled students
    enr_res = admin.table("class_enrollments").select("student_id").eq("class_id", body.class_id).execute()
    student_ids = [r["student_id"] for r in (enr_res.data or [])]

    # Get all tasks for this template
    tasks_res = admin.table("study_plan_tasks").select("id, day_number").eq("template_id", template_id).execute()
    tasks = tasks_res.data or []

    # Build task_completions rows: day 1 → start_date, day 2 → start+1, etc.
    rows = []
    for task in tasks:
        assigned = (start + timedelta(days=task["day_number"] - 1)).isoformat()
        for sid in student_ids:
            rows.append({
                "student_id": sid,
                "task_id": task["id"],
                "tenant_id": token.tenant_id,
                "assigned_date": assigned,
            })

    # Batch upsert
    BATCH = 500
    total = 0
    for i in range(0, len(rows), BATCH):
        res = admin.table("task_completions").upsert(rows[i:i+BATCH], on_conflict="student_id,task_id,assigned_date").execute()
        total += len(res.data or [])

    return success({"tasks_assigned": total, "students": len(student_ids)})
