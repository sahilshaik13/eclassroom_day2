"""
Admin routes — require role=admin + mfa_verified JWT.

GET    /api/v1/admin/stats
GET    /api/v1/admin/students
POST   /api/v1/admin/students
PATCH  /api/v1/admin/students/{id}
POST   /api/v1/admin/students/{id}/deactivate
POST   /api/v1/admin/students/{id}/activate
DELETE /api/v1/admin/students/{id}
GET    /api/v1/admin/teachers
POST   /api/v1/admin/teachers          (invite by email)
PATCH  /api/v1/admin/teachers/{id}
POST   /api/v1/admin/teachers/{id}/deactivate
POST   /api/v1/admin/teachers/{id}/activate
DELETE /api/v1/admin/teachers/{id}
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


# ── Class Enrollments Management ──────────────────────────────

@router.get("/classes/{class_id}/students")
async def list_class_students(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = (
        admin.table("class_enrollments")
        .select("student_id, students(id, name, phone, deactivated_at)")
        .eq("class_id", class_id)
        .eq("tenant_id", token.tenant_id)
        .execute()
    )
    # Return flattened data
    students_data = []
    for row in (res.data or []):
        stu = row.get("students") or {}
        students_data.append({
            "id": stu.get("id"),
            "name": stu.get("name"),
            "phone": stu.get("phone"),
            "status": "Inactive" if stu.get("deactivated_at") else "Active"
        })
    return success(students_data)

@router.delete("/classes/{class_id}/enroll/{student_id}")
async def unenroll_student_admin(
    class_id: str,
    student_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    admin.table("class_enrollments").delete().eq("class_id", class_id).eq("student_id", student_id).eq("tenant_id", token.tenant_id).execute()
    return success({"unenrolled": True})

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
        .select("*, class_enrollments(class_id, classes(name, users!classes_teacher_id_fkey(name)))", count="exact")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
    )
    if search:
        q = q.ilike("name", f"%{search}%")
    res = q.execute()
    
    students_data = []
    for row in (res.data or []):
        enrollments = row.pop("class_enrollments", [])
        class_name = None
        teacher_name = None
        if enrollments:
            # Join multiple classes with a comma
            class_names = [e.get("classes", {}).get("name") for e in enrollments if e.get("classes")]
            class_name = ", ".join(filter(None, class_names))
            
            # Just take the first teacher for the primary display to keep it simple
            teacher_info = enrollments[0].get("classes", {}).get("users") or {}
            teacher_name = teacher_info.get("name")
            
        row["class_name"] = class_name
        row["teacher_name"] = teacher_name
        students_data.append(row)
        
    return paginated(students_data, page, limit, res.count or 0)


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


@router.post("/students/{student_id}/deactivate")
async def deactivate_student(
    student_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Soft-disable a student (mark as on leave). They cannot log in but data is preserved."""
    from datetime import datetime, timezone
    admin = get_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    
    # Update student (only if matched by id AND tenant_id)
    stu_res = admin.table("students").update({"deactivated_at": now}).eq("id", student_id).eq("tenant_id", token.tenant_id).execute()
    
    if stu_res.data:
        user_id = stu_res.data[0]["user_id"]
        admin.table("users").update({"deactivated_at": now, "is_active": False}).eq("id", user_id).eq("tenant_id", token.tenant_id).execute()
    
    return success({"deactivated": True})


@router.post("/students/{student_id}/activate")
async def activate_student(
    student_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Re-activate a previously disabled student."""
    admin = get_admin_client()
    
    stu_res = admin.table("students").update({"deactivated_at": None}).eq("id", student_id).eq("tenant_id", token.tenant_id).execute()
    
    if stu_res.data:
        user_id = stu_res.data[0]["user_id"]
        admin.table("users").update({"deactivated_at": None, "is_active": True}).eq("id", user_id).eq("tenant_id", token.tenant_id).execute()
    
    return success({"activated": True})


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Permanently delete a student — removes all data and auth user."""
    import httpx
    admin = get_admin_client()
    
    # 1. Get the student to find user_id
    stu = admin.table("students").select("user_id").eq("id", student_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not stu.data:
        return error("NOT_FOUND", "Student not found", 404)
    user_id = stu.data["user_id"]
    
    # 2. Delete related rows (enrollments, completions, etc.)
    admin.table("class_enrollments").delete().eq("student_id", student_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("task_completions").delete().eq("student_id", student_id).eq("tenant_id", token.tenant_id).execute()
    
    # 3. Delete student row
    admin.table("students").delete().eq("id", student_id).eq("tenant_id", token.tenant_id).execute()
    
    # 4. Delete user row
    admin.table("users").delete().eq("id", user_id).eq("tenant_id", token.tenant_id).execute()
    
    # 5. Delete auth user via Supabase Admin API
    auth_headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers=auth_headers,
        )
    
    return success({"deleted": True})


# ── Teachers ──────────────────────────────────────────────────

@router.get("/teachers")
async def list_teachers(request: Request, token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    res = (
        admin.table("users")
        .select("id, name, email, deactivated_at, classes(id, class_enrollments(count))")
        .eq("tenant_id", token.tenant_id)
        .eq("role", "teacher")
        .order("created_at", desc=True)
        .execute()
    )
    
    teachers = []
    for row in (res.data or []):
        classes = row.pop("classes", [])
        class_count = len(classes)
        student_count = 0
        for c in classes:
            enr = c.get("class_enrollments", [])
            if enr and isinstance(enr, list):
                student_count += enr[0].get("count", 0)
        
        teachers.append({
            **row,
            "class_count": class_count,
            "student_count": student_count
        })
        
    return success(teachers)


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
        # Determine dynamic redirect URL based on admin's origin (Local vs Prod)
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        
        base_url = settings.FRONTEND_URL # Fallback
        
        # If admin is on localhost, we want the invite to point to localhost
        if origin and ("localhost" in origin or "127.0.0.1" in origin):
            base_url = origin
        elif referer and ("localhost" in referer or "127.0.0.1" in referer):
            from urllib.parse import urlparse
            p = urlparse(referer)
            base_url = f"{p.scheme}://{p.netloc}"
            
        redirect_to = f"{base_url}/auth/callback"

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

        # Update Supabase auth user's app_metadata so the JWT contains
        # the correct role and tenant_id claims.  The /invite endpoint
        # puts data into user_metadata only, NOT app_metadata.
        import httpx
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            await client.put(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{result['user_id']}",
                json={"app_metadata": {"role": "teacher", "tenant_id": token.tenant_id}},
                headers=auth_headers,
            )

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


@router.post("/teachers/{teacher_id}/deactivate")
async def deactivate_teacher(
    teacher_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Disable a teacher (mark as on leave). Students will see their teacher is on leave."""
    from datetime import datetime, timezone
    admin = get_admin_client()
    now = datetime.now(timezone.utc).isoformat()
    
    res = admin.table("users").update({"deactivated_at": now, "is_active": False}).eq("id", teacher_id).eq("role", "teacher").eq("tenant_id", token.tenant_id).execute()
    
    if not res.data:
        return error("NOT_FOUND", "Teacher not found", 404)
    
    return success({"deactivated": True})


@router.post("/teachers/{teacher_id}/activate")
async def activate_teacher(
    teacher_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Re-activate a previously disabled teacher."""
    admin = get_admin_client()
    
    res = admin.table("users").update({"deactivated_at": None, "is_active": True}).eq("id", teacher_id).eq("role", "teacher").eq("tenant_id", token.tenant_id).execute()
    
    if not res.data:
        return error("NOT_FOUND", "Teacher not found", 404)
    
    return success({"activated": True})


@router.delete("/teachers/{teacher_id}")
async def delete_teacher(
    teacher_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Permanently delete a teacher — removes user record and auth user."""
    import httpx
    admin = get_admin_client()
    
    # 1. Verify teacher exists and belongs to tenant
    user = admin.table("users").select("id").eq("id", teacher_id).eq("role", "teacher").eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not user.data:
        return error("NOT_FOUND", "Teacher not found", 404)
    
    # 2. Unassign teacher from related records (classes, doubts, attendance, grades)
    admin.table("classes").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("doubt_responses").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("attendance").update({"marked_by": None}).eq("marked_by", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("grades").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("study_plan_templates").update({"created_by": None}).eq("created_by", teacher_id).eq("tenant_id", token.tenant_id).execute()
    
    # 3. Delete user row
    admin.table("users").delete().eq("id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    
    # 4. Delete auth user via Supabase Admin API
    auth_headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
    }
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{teacher_id}",
            headers=auth_headers,
        )
    
    return success({"deleted": True})


@router.get("/tenant-info")
async def get_tenant_info(token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    res = admin.table("tenants").select("id, name, slug").eq("id", token.tenant_id).maybe_single().execute()
    if not res.data:
        return error("NOT_FOUND", "Organization not found", 404)
    return success(res.data)


@router.get("/teachers/applications")
async def list_teacher_applications(
    status: Optional[str] = "pending",
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    q = admin.table("teacher_applications").select("*").eq("tenant_id", token.tenant_id)
    if status:
        q = q.eq("status", status)
    res = q.order("created_at", desc=True).execute()
    
    data = res.data or []
    
    # Simple relative time helper for internal use
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for app in data:
        dt = datetime.fromisoformat(app["created_at"].replace("Z", "+00:00"))
        diff = now - dt
        if diff.days > 0:
            app["applied_ago"] = f"{diff.days}d ago"
        elif diff.seconds > 3600:
            app["applied_ago"] = f"{diff.seconds // 3600}h ago"
        elif diff.seconds > 60:
            app["applied_ago"] = f"{diff.seconds // 60}m ago"
        else:
            app["applied_ago"] = "just now"
            
    return success(data)


@router.post("/teachers/applications/{app_id}/approve")
async def approve_teacher_application(
    app_id: str,
    request: Request,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    
    # 1. Get application
    app_res = admin.table("teacher_applications").select("*").eq("id", app_id).eq("tenant_id", token.tenant_id).execute()
    if not app_res or not app_res.data:
        return error("NOT_FOUND", "Application not found", 404)
    
    app = app_res.data[0]
    if app["status"] != "pending":
        return error("BAD_REQUEST", f"Application is already {app['status']}", 400)
    
    # 2. Trigger invitation
    try:
        # Determine dynamic redirect URL
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = settings.FRONTEND_URL
        if origin and ("localhost" in origin or "127.0.0.1" in origin):
            base_url = origin
        elif referer and ("localhost" in referer or "127.0.0.1" in referer):
            from urllib.parse import urlparse
            p = urlparse(referer)
            base_url = f"{p.scheme}://{p.netloc}"
            
        redirect_to = f"{base_url}/auth/callback"

        invite = await AuthService.invite_user_by_email(
            email=app["email"],
            name=app["name"],
            role="teacher",
            tenant_id=app["tenant_id"],
            redirect_to=redirect_to
        )
        
        # 3. Create user row
        admin.table("users").upsert({
            "id": invite["user_id"],
            "tenant_id": token.tenant_id,
            "role": "teacher",
            "name": app["name"],
            "email": app["email"],
            "is_registered": False
        }).execute()

        # 4. Update Supabase auth user app_metadata for login capabilities
        import httpx
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            await client.put(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{invite['user_id']}",
                json={"app_metadata": {"role": "teacher", "tenant_id": token.tenant_id}},
                headers=auth_headers
            )

        # 5. Update application status
        admin.table("teacher_applications").update({
            "status": "approved"
        }).eq("id", app_id).execute()

        return success({"message": "Application approved and invitation sent."})

    except Exception as e:
        import traceback
        print(f"ERROR: {str(e)}\n{traceback.format_exc()}")
        return error("INVITE_FAILED", str(e), 500)


@router.post("/teachers/applications/{app_id}/reject")
async def reject_teacher_application(
    app_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    res = admin.table("teacher_applications").update({"status": "rejected"}).eq("id", app_id).eq("tenant_id", token.tenant_id).execute()
    if not res.data:
        return error("NOT_FOUND", "Application not found", 404)
    return success({"message": "Application rejected."})


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
        count = enr[0].get("count", 0) if enr and isinstance(enr, list) else 0
        classes.append({**row, "teacher_name": teacher.get("name", ""), "enrollment_count": count})
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


@router.delete("/classes/{class_id}")
async def delete_class(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    
    # 1. Clean up related data natively since Supabase might not have cascade properly configured on all relations
    admin.table("class_enrollments").delete().eq("class_id", class_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("doubts").delete().eq("class_id", class_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("attendance").delete().eq("class_id", class_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("grades").delete().eq("class_id", class_id).eq("tenant_id", token.tenant_id).execute()
    
    # 2. Delete the actual class
    res = admin.table("classes").delete().eq("id", class_id).eq("tenant_id", token.tenant_id).execute()
    
    if not res.data:
        return error("NOT_FOUND", "Class not found", 404)
        
    return success({"deleted": True})


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
