"""
Admin routes — require role=admin + mfa_verified JWT.

GET    /api/v1/admin/stats
GET    /api/v1/admin/students
POST   /api/v1/admin/students
GET    /api/v1/admin/students/applications
POST   /api/v1/admin/students/applications/{id}/approve
POST   /api/v1/admin/students/applications/{id}/reject
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
POST   /api/v1/admin/study-plans/{id}/apply
"""
from datetime import date, timedelta, datetime
import logging
from typing import Optional, List, Any
import httpx
from fastapi import APIRouter, Depends, Request, File, UploadFile
from pydantic import BaseModel, EmailStr
from app.schemas import study_plan as sp

from app.core.deps import require_admin, TokenData
from app.core.response import success, error, paginated
from app.db.supabase import get_admin_client
from app.services.auth_service import AuthService, AuthError
from app.core.config import settings
from app.services.study_plan_pdf_import_service import (
    STUDY_PLAN_PDF_BUCKET,
    build_import_payload,
    build_plan_rows,
    cancel_provider_job,
    ensure_nexusocr_configured,
    extract_columns_and_rows,
    fetch_filtered_provider_result,
    normalize_import_status,
    retry_provider_job,
    sync_import_status,
    upload_pdf_to_provider,
    upload_pdf_to_storage,
)
from app.services.study_plan_kpi_service import build_column_bucket_map, normalize_kpi_bucket

class TeacherDayCreate(sp.TeacherDayCreate): pass
class TeacherDayUpdate(sp.TeacherDayUpdate): pass
class TeacherPeriodCreate(sp.TeacherPeriodCreate): pass
class TeacherPeriodUpdate(sp.TeacherPeriodUpdate): pass
class TeacherTaskCreate(sp.TeacherTaskCreate): pass
class TeacherTaskUpdate(sp.TeacherTaskUpdate): pass


router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


def _merge_task_config(config: Optional[dict], kpi_bucket: Optional[Any]) -> dict:
    next_config = dict(config or {})
    normalized_bucket = normalize_kpi_bucket(kpi_bucket)
    if normalized_bucket:
        next_config["kpi_bucket"] = normalized_bucket
    elif "kpi_bucket" in next_config and not normalize_kpi_bucket(next_config.get("kpi_bucket")):
        next_config.pop("kpi_bucket", None)
    return next_config


# ── Stats ─────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    request: Request, 
    tenant_id: Optional[str] = None,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    
    # Use provided tenant_id if platform_admin, otherwise token's tid
    tid = tenant_id if (tenant_id and token.role == "platform_admin") else token.tenant_id

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
    tenant_id: Optional[str] = None,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    
    # Use provided tenant_id if platform_admin, otherwise token's tid
    tid = tenant_id if (tenant_id and token.role == "platform_admin") else token.tenant_id

    q = (
        admin.table("students")
        .select("*, class_enrollments(class_id, classes(name, users!classes_teacher_id_fkey(name)))", count="exact")
        .eq("tenant_id", tid)
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


class AdminStudentCreateRequest(BaseModel):
    name: str
    phone: str
    class_id: Optional[str] = None


class StudentApplicationApproveRequest(BaseModel):
    class_id: str


@router.post("/students")
async def create_student(
    body: AdminStudentCreateRequest,
    request: Request,
    tenant_id: Optional[str] = None,
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
    
    # Use tenant_id from query if provided (for platform_admins), otherwise from token
    tid = tenant_id or token.tenant_id
    
    if not tid:
        return error("BAD_REQUEST", "Tenant ID is required. Please select a school first.", 400)

    payload = {
        "phone": body.phone,
        "phone_confirm": True,
        "app_metadata": {"role": "student", "tenant_id": tid},
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
        "tenant_id": tid,
        "role": "student",
        "phone": body.phone,
        "name": body.name,
    }).execute()

    # Insert student row
    stu_res = admin.table("students").insert({
        "user_id": user_id,
        "tenant_id": tid,
        "name": body.name,
        "phone": body.phone,
    }).execute()

    student = stu_res.data[0] if stu_res.data else {}

    # Enroll in class if provided
    if body.class_id and student.get("id"):
        admin.table("class_enrollments").insert({
            "student_id": student["id"],
            "class_id": body.class_id,
            "tenant_id": tid,
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
    
    # 4. Delete user row (base table)
    admin.table("users").delete().eq("id", user_id).eq("tenant_id", token.tenant_id).execute()

    # 5. Delete auth user via AuthService
    await AuthService.delete_auth_user(user_id)

    return success({"message": "Student and auth user deleted successfully"})


# ── Teachers ──────────────────────────────────────────────────

@router.get("/teachers")
async def list_teachers(
    request: Request, 
    tenant_id: Optional[str] = None,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    
    # Use provided tenant_id if platform_admin, otherwise token's tid
    tid = tenant_id if (tenant_id and token.role == "platform_admin") else token.tenant_id

    res = (
        admin.table("users")
        .select("id, name, email, deactivated_at, classes(id, class_enrollments(count))")
        .eq("tenant_id", tid)
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


class AdminTeacherInviteRequest(BaseModel):
    email: str
    name: str


@router.post("/teachers")
async def invite_teacher(
    body: AdminTeacherInviteRequest,
    request: Request,
    tenant_id: Optional[str] = None,
    token: TokenData = Depends(require_admin),
):
    tid = tenant_id or token.tenant_id
    
    if not tid:
        return error("BAD_REQUEST", "Tenant ID is required. Please select a school first.", 400)

    # Determine dynamic redirect URL based on admin's environment (Local vs Prod)
    # We prioritize Origin, then Referer, then the configured FRONTEND_URL.
    origin = request.headers.get("origin")
    referer = request.headers.get("referer")
    base_url = settings.FRONTEND_URL # Final fallback
    
    print(f"DEBUG REDIRECT: origin={origin}, referer={referer}, fallback={settings.FRONTEND_URL}")

    if origin:
        base_url = origin
    elif referer:
        from urllib.parse import urlparse
        p = urlparse(referer)
        base_url = f"{p.scheme}://{p.netloc}"
        
    redirect_to = f"{base_url}/auth/callback"
    print(f"DEBUG REDIRECT: resolved base_url={base_url}, redirect_to={redirect_to}")

    try:
        # Step 1: Attempt to invite via Auth Service
        try:
            result = await AuthService.invite_user_by_email(
                email=body.email,
                name=body.name,
                role="teacher",
                tenant_id=tid,
                redirect_to=redirect_to,
            )
            user_id = result["user_id"]
        except AuthError as e:
            # If user already exists in Supabase Auth, return a clear error
            if "already" in e.message.lower() or e.status == 422:
                return error("ALREADY_EXISTS", f"A user with email {body.email} is already registered in the system.", 400)
            raise e

        # Sync to users table
        admin = get_admin_client()
        admin.table("users").upsert({
            "id": user_id,
            "tenant_id": tid,
            "role": "teacher",
            "email": body.email,
            "name": body.name,
            "is_active": True,
        }).execute()

        return success({"user_id": user_id, "message": "Teacher invited successfully"}, status_code=201)

    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        import traceback
        print(f"ERROR in invite_teacher: {str(e)}")
        print(traceback.format_exc())
        return error("INTERNAL_ERROR", f"An unexpected error occurred: {str(e)}", 500)


@router.post("/teachers/{teacher_id}/resend-invite")
async def resend_teacher_invite(
    teacher_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    """Resend the invitation email to a teacher who has not yet set their password."""
    admin_client = get_admin_client()
    try:
        # Fetch teacher (must belong to same tenant)
        res = admin_client.table("users") \
            .select("id, email, role, has_password, tenant_id") \
            .eq("id", teacher_id) \
            .eq("tenant_id", token.tenant_id) \
            .eq("role", "teacher") \
            .maybe_single() \
            .execute()

        if not res or not res.data:
            return error("NOT_FOUND", "Teacher not found", 404)

        teacher = res.data
        if teacher.get("has_password"):
            return error("ALREADY_REGISTERED", "This teacher has already set their password. No invite needed.", 400)

        # Determine redirect URL (localhost vs production)
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = settings.FRONTEND_URL
        if origin:
            base_url = origin
        elif referer:
            from urllib.parse import urlparse
            p = urlparse(referer)
            base_url = f"{p.scheme}://{p.netloc}"
            
        redirect_to = f"{base_url}/auth/callback"

        result = await AuthService.resend_invite_or_reset(
            user_id=teacher["id"],
            email=teacher["email"],
            role="teacher",
            tenant_id=token.tenant_id,
            redirect_to=redirect_to,
        )
        return success(result)

    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        import traceback
        print(f"DEBUG ERROR in invite_teacher: {str(e)}")
        print(traceback.format_exc())
        return error("INTERNAL_ERROR", str(e), 500)


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
    admin = get_admin_client()
    
    # 1. Verify teacher exists and belongs to tenant
    user = admin.table("users").select("id").eq("id", teacher_id).eq("role", "teacher").eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not user.data:
        return error("NOT_FOUND", "Teacher not found", 404)
    
    # 2. Unassign teacher from related records
    admin.table("classes").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("doubt_responses").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("attendance").update({"marked_by": None}).eq("marked_by", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("grades").update({"teacher_id": None}).eq("teacher_id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    admin.table("study_plan_templates").update({"created_by": None}).eq("created_by", teacher_id).eq("tenant_id", token.tenant_id).execute()
    
    # 3. Delete user row
    admin.table("users").delete().eq("id", teacher_id).eq("tenant_id", token.tenant_id).execute()
    
    # 4. Delete auth user via AuthService
    await AuthService.delete_auth_user(teacher_id)
    
    return success({"message": "Teacher and auth user deleted successfully"})


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


@router.get("/students/applications")
async def list_student_applications(
    status: Optional[str] = "pending",
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    q = admin.table("student_applications").select("*").eq("tenant_id", token.tenant_id)
    if status:
        q = q.eq("status", status)
    res = q.order("created_at", desc=True).execute()

    data = res.data or []

    now = datetime.utcnow()
    for app in data:
        dt = datetime.fromisoformat(app["created_at"].replace("Z", "+00:00")).replace(tzinfo=None)
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


@router.post("/students/applications/{app_id}/approve")
async def approve_student_application(
    app_id: str,
    body: StudentApplicationApproveRequest,
    token: TokenData = Depends(require_admin)
):
    import httpx

    admin = get_admin_client()

    app_res = (
        admin.table("student_applications")
        .select("*")
        .eq("id", app_id)
        .eq("tenant_id", token.tenant_id)
        .execute()
    )
    if not app_res or not app_res.data:
        return error("NOT_FOUND", "Application not found", 404)

    app = app_res.data[0]
    if app["status"] != "pending":
        return error("BAD_REQUEST", f"Application is already {app['status']}", 400)

    class_res = (
        admin.table("classes")
        .select("id, name, teacher_id")
        .eq("id", body.class_id)
        .eq("tenant_id", token.tenant_id)
        .maybe_single()
        .execute()
    )
    if not class_res.data:
        return error("NOT_FOUND", "Class not found", 404)

    normalized_phone = "".join(filter(lambda x: x.isdigit() or x == "+", app["phone"]))

    existing_user = (
        admin.table("users")
        .select("id")
        .eq("tenant_id", token.tenant_id)
        .eq("phone", normalized_phone)
        .execute()
    )
    if existing_user.data:
        return error("ALREADY_EXISTS", "A user with this phone number already exists.", 400)

    auth_headers = {
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "phone": normalized_phone,
        "phone_confirm": True,
        "app_metadata": {"role": "student", "tenant_id": token.tenant_id},
        "user_metadata": {"name": app["name"]},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            json=payload,
            headers=auth_headers,
        )

    if resp.status_code >= 400:
        error_msg = resp.json().get("msg", resp.text) if "application/json" in resp.headers.get("Content-Type", "") else resp.text
        return error("CREATE_ERROR", error_msg, 400)

    auth_res = resp.json()
    user_id = auth_res.get("id")

    admin.table("users").upsert(
        {
            "id": user_id,
            "tenant_id": token.tenant_id,
            "role": "student",
            "phone": normalized_phone,
            "name": app["name"],
            "is_registered": False,
            "is_active": True,
        }
    ).execute()

    stu_res = admin.table("students").insert(
        {
            "user_id": user_id,
            "tenant_id": token.tenant_id,
            "name": app["name"],
            "phone": normalized_phone,
        }
    ).execute()
    student = stu_res.data[0] if stu_res.data else {}

    if student.get("id"):
        admin.table("class_enrollments").upsert(
            {
                "student_id": student["id"],
                "class_id": body.class_id,
                "tenant_id": token.tenant_id,
            },
            on_conflict="student_id,class_id",
        ).execute()

    admin.table("student_applications").update(
        {
            "status": "approved",
            "assigned_class_id": body.class_id,
            "reviewed_at": f"{datetime.utcnow().isoformat()}Z",
        }
    ).eq("id", app_id).eq("tenant_id", token.tenant_id).execute()

    return success(
        {
            "message": "Student application approved and assigned successfully.",
            "student_id": student.get("id"),
            "class_id": body.class_id,
        }
    )


@router.post("/students/applications/{app_id}/reject")
async def reject_student_application(
    app_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    res = admin.table("student_applications").update(
        {"status": "rejected", "reviewed_at": f"{datetime.utcnow().isoformat()}Z"}
    ).eq("id", app_id).eq("tenant_id", token.tenant_id).execute()
    if not res.data:
        return error("NOT_FOUND", "Application not found", 404)
    return success({"message": "Student application rejected."})


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
        .select("*, days:study_plan_days(count)")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    plans = []
    for row in (res.data or []):
        days = row.pop("days", []) or []
        plans.append({**row, "day_count": len(days)})
    return success(plans)


@router.get("/applied-study-plans")
async def list_applied_study_plans(token: TokenData = Depends(require_admin)):
    admin = get_admin_client()
    class_res = (
        admin.table("classes")
        .select("*, users!classes_teacher_id_fkey(name), class_enrollments(count)")
        .eq("tenant_id", token.tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    class_map: dict[str, dict[str, Any]] = {}
    for row in (class_res.data or []):
        teacher = row.pop("users", None) or {}
        enr = row.pop("class_enrollments", []) or []
        count = enr[0].get("count", 0) if enr and isinstance(enr, list) else 0
        class_map[row["id"]] = {**row, "teacher_name": teacher.get("name", ""), "enrollment_count": count}

    plan_res = (
        admin.table("study_plans")
        .select("*")
        .eq("tenant_id", token.tenant_id)
        .not_.is_("class_id", "null")
        .neq("status", "archived")
        .order("updated_at", desc=True)
        .execute()
    )
    plans = plan_res.data or []

    import_ids = [row.get("source_import_id") for row in plans if row.get("source_import_id")]
    import_map: dict[str, dict[str, Any]] = {}
    if import_ids:
        import_res = (
            admin.table("study_plan_pdf_imports")
            .select("id, original_filename, ocr_status, updated_at")
            .in_("id", import_ids)
            .execute()
        )
        import_map = {row["id"]: row for row in (import_res.data or [])}

    result = []
    for row in plans:
        class_info = class_map.get(row["class_id"])
        if not class_info:
            continue
        source_info = import_map.get(row.get("source_import_id"))
        result.append(
            {
                **row,
                "class": class_info,
                "source_import": source_info,
            }
        )

    return success(result)


@router.post("/study-plans")
async def create_study_plan(
    body: sp.StudyPlanBase,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("study_plan_templates").insert({
        "tenant_id": token.tenant_id,
        "created_by": token.user_id,
        "name": body.name,
        "description": body.description,
        "total_days": 0,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.get("/study-plans/{template_id}")
async def get_study_plan_template(
    template_id: str,
    request: Request,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    # Fetch template with nested hierarchy
    # Supabase doesn't support deep nested joins easily in one go with select()
    # So we'll fetch them in steps or use a complex select if possible
    plan_res = admin.table("study_plan_templates").select("*").eq("id", template_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not plan_res.data:
        return error("NOT_FOUND", "Template not found", 404)
    
    days_res = admin.table("study_plan_days").select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))").eq("template_id", template_id).order("day_number").execute()
    
    # Sort nested periods and tasks manually if needed, or rely on Supabase order if configured
    plan = plan_res.data
    plan["days"] = days_res.data or []
    
    return success(plan)


@router.post("/study-plans/{template_id}/days")
async def add_template_day(
    template_id: str,
    body: sp.DayCreate,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("study_plan_days").insert({
        "template_id": template_id,
        "day_number": body.day_number,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/days/{day_id}")
async def update_template_day(
    day_id: str,
    body: TeacherDayUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {}
    if body.day_number is not None: update_data["day_number"] = body.day_number
    
    res = admin.table("study_plan_days").update(update_data).eq("id", day_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/study-plans/days/{day_id}")
async def delete_template_day(
    day_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    admin.table("study_plan_days").delete().eq("id", day_id).execute()
    return success({"deleted": True})


@router.post("/study-plans/days/{day_id}/periods")
async def add_template_period(
    day_id: str,
    body: sp.PeriodCreate,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    res = admin.table("study_plan_periods").insert({
        "day_id": day_id,
        "title": body.title,
        "duration_minutes": body.duration_minutes,
        "order_index": body.order_index,
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.patch("/study-plans/periods/{period_id}")
async def update_template_period(
    period_id: str,
    body: TeacherPeriodUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    res = admin.table("study_plan_periods").update(update_data).eq("id", period_id).execute()
    return success(res.data[0] if res.data else {})


@router.delete("/study-plans/periods/{period_id}")
async def delete_template_period(
    period_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    admin.table("study_plan_periods").delete().eq("id", period_id).execute()
    return success({"deleted": True})


@router.post("/study-plans/periods/{period_id}/tasks")
async def add_template_task(
    period_id: str,
    body: sp.TaskCreate,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    # Get template_id from period -> day
    period = admin.table("study_plan_periods").select("day_id").eq("id", period_id).maybe_single().execute()
    if not period.data: return error("NOT_FOUND", "Period not found", 404)
    
    day = admin.table("study_plan_days").select("template_id").eq("id", period.data["day_id"]).maybe_single().execute()
    template_id = day.data["template_id"] if day.data else None

    res = admin.table("study_plan_tasks").insert({
        "period_id": period_id,
        "template_id": template_id,
        "tenant_id": token.tenant_id,
        "title": body.title,
        "description": body.description,
        "task_type": body.task_type.value,
        "required": body.required,
        "order_index": body.order_index,
        "config": _merge_task_config(body.config, body.kpi_bucket)
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)


@router.patch("/study-plans/tasks/{task_id}")
async def update_template_task(
    task_id: str,
    body: TeacherTaskUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if "task_type" in update_data and update_data["task_type"]:
        update_data["task_type"] = update_data["task_type"].value
    if "config" in update_data or "kpi_bucket" in update_data:
        update_data["config"] = _merge_task_config(update_data.get("config"), update_data.get("kpi_bucket"))
    update_data.pop("kpi_bucket", None)
        
    res = admin.table("study_plan_tasks").update(update_data).eq("id", task_id).execute()
    return success(res.data[0] if res.data else {})


@router.delete("/study-plans/tasks/{task_id}")
async def delete_template_task(
    task_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    admin.table("study_plan_tasks").delete().eq("id", task_id).eq("tenant_id", token.tenant_id).execute()
    return success({"deleted": True})


# ── Classroom Study Plans (Actual content being delivered) ────

@router.get("/classrooms/{class_id}/study-plan")
async def get_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_admin)
):
    """Fetch the actual study plan being delivered in a classroom."""
    admin = get_admin_client()
    try:
        # 1. Verify class belongs to tenant
        class_res = admin.table("classes").select("id").eq("id", class_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
        if not class_res.data:
            return error("NOT_FOUND", "Class not found", 404)

        # 2. Fetch plan
        plan_res = admin.table("study_plans").select("*").eq("class_id", class_id).maybe_single().execute()
        if not plan_res.data:
            return success(None) # No plan yet
        
        plan = plan_res.data
        plan_id = plan["id"]
        
        # 3. Fetch days, periods, tasks
        # If the plan is linked to a template, we fetch the template's days/tasks
        # to ensure the admin and teacher are seeing the EXACT same data.
        target_field = "template_id" if plan.get("template_id") else "plan_id"
        target_id = plan.get("template_id") if plan.get("template_id") else plan_id
        
        days_res = admin.table("study_plan_days").select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))").eq(target_field, target_id).order("day_number").execute()
        
        days = days_res.data or []
        # Sort manually
        for day in days:
            if "periods" in day and day["periods"]:
                day["periods"].sort(key=lambda x: x.get("order_index", 0))
                for period in day["periods"]:
                    if "tasks" in period and period["tasks"]:
                        period["tasks"].sort(key=lambda x: x.get("order_index", 0))
        
        plan["days"] = days
        return success(plan)
    except Exception as e:
        return error("QUERY_ERROR", str(e), 500)


@router.delete("/classrooms/{class_id}/study-plan")
async def delete_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    classroom = _verify_admin_classroom(admin, token.tenant_id, class_id)
    if not classroom:
        return error("NOT_FOUND", "Class not found", 404)

    plan_res = (
        admin.table("study_plans")
        .select("id, source_import_id")
        .eq("tenant_id", token.tenant_id)
        .eq("class_id", class_id)
        .maybe_single()
        .execute()
    )
    plan = plan_res.data if plan_res else None
    if not plan:
        return error("NOT_FOUND", "Study plan not found", 404)

    admin.table("study_plans").delete().eq("id", plan["id"]).execute()

    if plan.get("source_import_id"):
        admin.table("study_plan_pdf_imports").update(
            {
                "applied_plan_id": None,
                "ocr_status": "completed",
                "parse_message": "Study plan removed from class",
            }
        ).eq("id", plan["source_import_id"]).execute()

    return success({"deleted": True, "class_id": class_id})

@router.post("/classroom-study-plans/days")
async def admin_create_classroom_day(
    body: TeacherDayCreate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    # Mark plan as dirty
    admin.table("study_plans").update({"updated_at": "now()"}).eq("id", body.plan_id).execute()
    # 1. Fetch the plan to see if it's template-linked
    plan_res = admin.table("study_plans").select("template_id").eq("id", body.plan_id).maybe_single().execute()
    plan_data = plan_res.data if plan_res.data else {}
    
    # 2. Determine target
    target_field = "template_id" if plan_data.get("template_id") else "plan_id"
    target_id = plan_data.get("template_id") if plan_data.get("template_id") else str(body.plan_id)

    res = admin.table("study_plan_days").insert({
        target_field: target_id,
        "day_number": body.day_number,
        "scheduled_date": body.scheduled_date.isoformat() if body.scheduled_date else None
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/classroom-study-plans/days/{day_id}")
async def admin_update_classroom_day(
    day_id: str,
    body: TeacherDayUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {}
    if body.day_number is not None: update_data["day_number"] = body.day_number
    if body.scheduled_date is not None: update_data["scheduled_date"] = body.scheduled_date.isoformat()
    if body.is_accessible is not None: update_data["is_accessible"] = body.is_accessible
    
    res = admin.table("study_plan_days").update(update_data).eq("id", day_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/classroom-study-plans/days/{day_id}")
async def admin_delete_classroom_day(
    day_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    admin.table("study_plan_days").delete().eq("id", day_id).execute()
    return success({"deleted": True})

@router.post("/classroom-study-plans/periods")
async def admin_create_classroom_period(
    body: TeacherPeriodCreate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    res = admin.table("study_plan_periods").insert({
        "day_id": str(body.day_id),
        "title": body.title,
        "duration_minutes": body.duration_minutes,
        "order_index": body.order_index
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/classroom-study-plans/periods/{period_id}")
async def admin_update_classroom_period(
    period_id: str,
    body: TeacherPeriodUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    res = admin.table("study_plan_periods").update(update_data).eq("id", period_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/classroom-study-plans/periods/{period_id}")
async def admin_delete_classroom_period(
    period_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    admin.table("study_plan_periods").delete().eq("id", period_id).execute()
    return success({"deleted": True})

@router.post("/classroom-study-plans/tasks")
async def admin_create_classroom_task(
    body: TeacherTaskCreate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    res = admin.table("study_plan_tasks").insert({
        "period_id": str(body.period_id),
        "tenant_id": str(token.tenant_id),
        "title": body.title,
        "description": body.description,
        "task_type": body.task_type.value,
        "required": body.required,
        "order_index": body.order_index,
        "config": _merge_task_config(body.config, body.kpi_bucket)
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/classroom-study-plans/tasks/{task_id}")
async def admin_update_classroom_task(
    task_id: str,
    body: TeacherTaskUpdate,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if "task_type" in update_data and update_data["task_type"]:
        update_data["task_type"] = update_data["task_type"].value
    if "config" in update_data or "kpi_bucket" in update_data:
        update_data["config"] = _merge_task_config(update_data.get("config"), update_data.get("kpi_bucket"))
    update_data.pop("kpi_bucket", None)
    res = admin.table("study_plan_tasks").update(update_data).eq("id", task_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/classroom-study-plans/tasks/{task_id}")
async def admin_delete_classroom_task(
    task_id: str,
    token: TokenData = Depends(require_admin)
):
    admin = get_admin_client()
    admin.table("study_plan_tasks").delete().eq("id", task_id).execute()
    return success({"deleted": True})


@router.post("/study-plans/{template_id}/apply")
async def apply_study_plan(
    template_id: str,
    body: sp.StudyPlanCreate,
    token: TokenData = Depends(require_admin),
):
    """
    Forks a template into a classroom-specific Study Plan.
    """
    admin = get_admin_client()
    
    if not body.class_id:
        return error("BAD_REQUEST", "class_id is required", 400)

    # 1. Create the Study Plan (Instance)
    plan_res = admin.table("study_plans").insert({
        "tenant_id": token.tenant_id,
        "class_id": str(body.class_id),
        "template_id": template_id,
        "name": body.name,
        "description": body.description,
        "status": "active"
    }).execute()
    
    if not plan_res.data:
        return error("INTERNAL_ERROR", "Failed to create classroom study plan", 500)
    
    new_plan_id = plan_res.data[0]["id"]

    # 2. Link to template (NO CLONING)
    # By not cloning, we ensure that the classroom study plan and the template 
    # stay in perfect sync. Any changes made by the teacher or admin will 
    # be reflected in both places because they will share the same template_id 
    # for their days, periods, and tasks.
    
    return success({"plan_id": new_plan_id})


def _verify_admin_classroom(admin: Any, tenant_id: str, class_id: str) -> Optional[dict]:
    result = (
        admin.table("classes")
        .select("id, name, teacher_id")
        .eq("id", class_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


def _get_import_by_id(admin: Any, tenant_id: str, import_id: str) -> Optional[dict]:
    result = (
        admin.table("study_plan_pdf_imports")
        .select("*")
        .eq("id", import_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


def _get_latest_import_for_class(admin: Any, tenant_id: str, class_id: str) -> Optional[dict]:
    result = (
        admin.table("study_plan_pdf_imports")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("class_id", class_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def _project_rows(selected_columns: List[str], rows: List[dict]) -> List[dict]:
    projected: List[dict] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        projected.append({column: row.get(column, "") for column in selected_columns})
    return projected


@router.post("/classrooms/{class_id}/study-plan-imports/upload")
async def upload_classroom_study_plan_pdf(
    class_id: str,
    file: UploadFile = File(...),
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    classroom = _verify_admin_classroom(admin, token.tenant_id, class_id)
    if not classroom:
        return error("NOT_FOUND", "Class not found", 404)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        return error("BAD_REQUEST", "Please upload a PDF file", 400)

    try:
        ensure_nexusocr_configured()
    except ValueError as exc:
        return error("CONFIG_ERROR", str(exc), 400)

    file_bytes = await file.read()
    if not file_bytes:
        return error("BAD_REQUEST", "Uploaded PDF is empty", 400)

    try:
        storage_path = upload_pdf_to_storage(admin, token.tenant_id, class_id, file.filename, file_bytes)
        created = (
            admin.table("study_plan_pdf_imports")
            .insert(
                {
                    "tenant_id": token.tenant_id,
                    "class_id": class_id,
                    "teacher_id": classroom.get("teacher_id"),
                    "uploaded_by": token.user_id,
                    "pdf_bucket": STUDY_PLAN_PDF_BUCKET,
                    "pdf_storage_path": storage_path,
                    "original_filename": file.filename,
                    "file_size_bytes": len(file_bytes),
                    "ocr_status": "uploading",
                }
            )
            .execute()
        )
        import_row = created.data[0] if created.data else None
        if not import_row:
            return error("INTERNAL_ERROR", "Failed to create study-plan import", 500)

        provider_payload = await upload_pdf_to_provider(file_bytes, file.filename)
        job_id = (
            provider_payload.get("job_id")
            or provider_payload.get("id")
            or (provider_payload.get("job") or {}).get("id")
        )
        if not job_id:
            admin.table("study_plan_pdf_imports").update(
                {
                    "ocr_status": "failed",
                    "parse_message": "NexusOCR did not return a job id",
                    "latest_payload": provider_payload,
                }
            ).eq("id", import_row["id"]).execute()
            return error("OCR_ERROR", "NexusOCR did not return a job id", 502)

        updated = (
            admin.table("study_plan_pdf_imports")
            .update(
                {
                    "ocr_job_id": job_id,
                    "ocr_status": normalize_import_status(provider_payload.get("status")),
                    "latest_payload": provider_payload,
                }
            )
            .eq("id", import_row["id"])
            .execute()
        )
        saved = updated.data[0] if updated.data else {**import_row, "ocr_job_id": job_id}
        return success(build_import_payload(saved, admin), status_code=201)
    except httpx.HTTPError as exc:
        message = str(exc)
        if 'import_row' in locals() and import_row:
            admin.table("study_plan_pdf_imports").update(
                {"ocr_status": "failed", "parse_message": message}
            ).eq("id", import_row["id"]).execute()
        return error("OCR_ERROR", message, 502)
    except Exception as exc:
        if 'import_row' in locals() and import_row:
            admin.table("study_plan_pdf_imports").update(
                {"ocr_status": "failed", "parse_message": str(exc)}
            ).eq("id", import_row["id"]).execute()
        return error("UPLOAD_ERROR", str(exc), 500)


@router.get("/classrooms/{class_id}/study-plan-imports/current")
async def get_current_classroom_study_plan_import(
    class_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    classroom = _verify_admin_classroom(admin, token.tenant_id, class_id)
    if not classroom:
        return error("NOT_FOUND", "Class not found", 404)

    import_row = _get_latest_import_for_class(admin, token.tenant_id, class_id)
    if not import_row:
        return success(None)

    try:
        if import_row.get("ocr_job_id") and (
            import_row.get("ocr_status") not in {"failed", "cancelled", "applied"}
            or not import_row.get("extracted_rows")
        ):
            import_row = await sync_import_status(admin, import_row)
    except Exception:
        pass

    return success(build_import_payload(import_row, admin))


@router.get("/study-plan-imports/{import_id}")
async def get_study_plan_import(
    import_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)
    return success(build_import_payload(import_row, admin))


@router.post("/study-plan-imports/{import_id}/refresh")
async def refresh_study_plan_import(
    import_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)

    if not import_row.get("ocr_job_id"):
        return success(build_import_payload(import_row, admin))

    try:
        import_row = await sync_import_status(admin, import_row)
        return success(build_import_payload(import_row, admin))
    except httpx.HTTPError as exc:
        return error("OCR_ERROR", str(exc), 502)


@router.post("/study-plan-imports/{import_id}/select-columns")
async def select_study_plan_import_columns(
    import_id: str,
    body: sp.StudyPlanImportColumnSelection,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)

    selected_columns = [column for column in body.selected_columns if str(column).strip()]
    if not selected_columns:
        return error("BAD_REQUEST", "Select at least one column", 400)

    if import_row.get("ocr_job_id") and (
        import_row.get("ocr_status") not in {"completed", "applied"}
        or not import_row.get("extracted_rows")
    ):
        import_row = await sync_import_status(admin, import_row)

    if not import_row.get("extracted_rows"):
        return error("BAD_REQUEST", "OCR result is not ready yet", 400)

    column_bucket_map = build_column_bucket_map(
        selected_columns,
        import_row.get("extracted_rows") or [],
        body.column_bucket_map or import_row.get("column_bucket_map") or {},
    )
    filtered_rows = _project_rows(selected_columns, import_row.get("extracted_rows") or [])
    latest_payload: Any = import_row.get("latest_payload") or {}
    if import_row.get("ocr_job_id"):
        try:
            provider_payload = await fetch_filtered_provider_result(import_row["ocr_job_id"], selected_columns)
            _, provider_rows = extract_columns_and_rows(provider_payload)
            if provider_rows:
                filtered_rows = provider_rows
            latest_payload = provider_payload
        except httpx.HTTPError:
            pass

    updated = (
        admin.table("study_plan_pdf_imports")
        .update(
            {
                "selected_columns": selected_columns,
                "filtered_rows": filtered_rows,
                "column_bucket_map": column_bucket_map,
                "latest_payload": latest_payload,
            }
        )
        .eq("id", import_id)
        .execute()
    )
    saved = updated.data[0] if updated.data else {
        **import_row,
        "selected_columns": selected_columns,
        "filtered_rows": filtered_rows,
        "column_bucket_map": column_bucket_map,
    }
    return success(build_import_payload(saved, admin))


@router.post("/study-plan-imports/{import_id}/cancel")
async def cancel_study_plan_import(
    import_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)
    if not import_row.get("ocr_job_id"):
        return error("BAD_REQUEST", "This import has no OCR job", 400)

    try:
        provider_payload = await cancel_provider_job(import_row["ocr_job_id"])
    except httpx.HTTPError as exc:
        return error("OCR_ERROR", str(exc), 502)

    updated = (
        admin.table("study_plan_pdf_imports")
        .update(
            {
                "ocr_status": "cancelled",
                "latest_payload": provider_payload,
                "parse_message": provider_payload.get("message") or "OCR job cancelled",
            }
        )
        .eq("id", import_id)
        .execute()
    )
    saved = updated.data[0] if updated.data else {**import_row, "ocr_status": "cancelled"}
    return success(build_import_payload(saved, admin))


@router.post("/study-plan-imports/{import_id}/retry")
async def retry_study_plan_import(
    import_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)
    if not import_row.get("ocr_job_id"):
        return error("BAD_REQUEST", "This import has no OCR job", 400)

    try:
        provider_payload = await retry_provider_job(import_row["ocr_job_id"])
        updated = (
            admin.table("study_plan_pdf_imports")
            .update(
                {
                    "ocr_status": normalize_import_status(provider_payload.get("status")),
                    "parse_message": provider_payload.get("message"),
                    "latest_payload": provider_payload,
                }
            )
            .eq("id", import_id)
            .execute()
        )
        saved = updated.data[0] if updated.data else {**import_row, "latest_payload": provider_payload}
        try:
            saved = await sync_import_status(admin, saved)
        except Exception:
            pass
        return success(build_import_payload(saved, admin))
    except httpx.HTTPError as exc:
        return error("OCR_ERROR", str(exc), 502)


@router.post("/study-plan-imports/{import_id}/apply")
async def apply_study_plan_import(
    import_id: str,
    body: sp.StudyPlanImportApply,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, token.tenant_id, import_id)
    if not import_row:
        return error("NOT_FOUND", "Study-plan import not found", 404)

    classroom = _verify_admin_classroom(admin, token.tenant_id, import_row["class_id"])
    if not classroom:
        return error("NOT_FOUND", "Class not found", 404)

    selected_columns = [column for column in body.selected_columns if str(column).strip()]
    if not selected_columns:
        return error("BAD_REQUEST", "Select at least one column before applying", 400)

    source_rows = import_row.get("filtered_rows") or import_row.get("extracted_rows") or []
    if body.rows:
        chosen_rows = body.rows
    elif body.selected_row_indexes:
        chosen_rows = [
            source_rows[index]
            for index in body.selected_row_indexes
            if isinstance(index, int) and 0 <= index < len(source_rows)
        ]
    else:
        chosen_rows = body.rows or []

    projected_rows = _project_rows(selected_columns, chosen_rows)
    column_bucket_map = build_column_bucket_map(
        selected_columns,
        projected_rows,
        body.column_bucket_map or import_row.get("column_bucket_map") or {},
    )
    try:
        plan_days = build_plan_rows(
            selected_columns,
            projected_rows,
            column_bucket_map=column_bucket_map,
            start_date=body.start_date,
            end_date=body.end_date,
        )
    except ValueError as exc:
        return error("BAD_REQUEST", str(exc), 400)

    if not plan_days:
        return error("BAD_REQUEST", "No usable study-plan rows were provided", 400)

    archived_plan_id: Optional[str] = None
    existing_plan_res = (
        admin.table("study_plans")
        .select("*")
        .eq("tenant_id", token.tenant_id)
        .eq("class_id", import_row["class_id"])
        .maybe_single()
        .execute()
    )
    existing_plan = existing_plan_res.data if existing_plan_res else None
    if existing_plan:
        archived_plan_id = existing_plan["id"]
        admin.table("study_plans").update(
            {
                "status": "archived",
                "archived_at": datetime.utcnow().isoformat(),
                "archived_class_id": import_row["class_id"],
                "class_id": None,
            }
        ).eq("id", archived_plan_id).execute()

    plan_name = (body.name or "").strip() or f"{classroom['name']} Study Plan"
    description = (body.description or "").strip() or f"Imported from {import_row.get('original_filename') or 'PDF study plan'}"
    plan_res = (
        admin.table("study_plans")
        .insert(
            {
                "tenant_id": token.tenant_id,
                "class_id": import_row["class_id"],
                "name": plan_name,
                "description": description,
                "status": "active",
                "created_by": token.user_id,
                "source_import_id": import_id,
            }
        )
        .execute()
    )
    if not plan_res.data:
        return error("INTERNAL_ERROR", "Failed to create study plan", 500)

    plan = plan_res.data[0]
    for day in plan_days:
        day_res = (
            admin.table("study_plan_days")
            .insert(
                {
                    "plan_id": plan["id"],
                    "day_number": day["day_number"],
                    "scheduled_date": day.get("scheduled_date"),
                    "is_accessible": day.get("is_accessible", True),
                }
            )
            .execute()
        )
        day_id = day_res.data[0]["id"]
        for period in day["periods"]:
            period_res = (
                admin.table("study_plan_periods")
                .insert(
                    {
                        "day_id": day_id,
                        "title": period["title"],
                        "duration_minutes": period["duration_minutes"],
                        "order_index": period["order_index"],
                    }
                )
                .execute()
            )
            period_id = period_res.data[0]["id"]
            for task in period["tasks"]:
                admin.table("study_plan_tasks").insert(
                    {
                        "period_id": period_id,
                        "tenant_id": token.tenant_id,
                        "title": task["title"],
                        "description": task.get("description"),
                        "task_type": task["task_type"],
                        "required": task.get("required", True),
                        "order_index": task["order_index"],
                        "config": task.get("config") or {},
                    }
                ).execute()

    updated = (
        admin.table("study_plan_pdf_imports")
        .update(
            {
                "ocr_status": "applied",
                "selected_columns": selected_columns,
                "filtered_rows": projected_rows,
                "applied_rows": projected_rows,
                "column_bucket_map": column_bucket_map,
                "applied_plan_id": plan["id"],
                "archived_plan_id": archived_plan_id,
                "parse_message": f"Applied to {classroom['name']}",
            }
        )
        .eq("id", import_id)
        .execute()
    )
    saved_import = updated.data[0] if updated.data else import_row
    return success(
        {
            "plan_id": plan["id"],
            "import": build_import_payload(saved_import, admin),
            "day_count": len(plan_days),
        }
    )


@router.get("/classrooms/{class_id}/study-plan-source")
async def get_admin_classroom_study_plan_source(
    class_id: str,
    token: TokenData = Depends(require_admin),
):
    admin = get_admin_client()
    classroom = _verify_admin_classroom(admin, token.tenant_id, class_id)
    if not classroom:
        return error("NOT_FOUND", "Class not found", 404)

    plan_res = (
        admin.table("study_plans")
        .select("id, source_import_id")
        .eq("tenant_id", token.tenant_id)
        .eq("class_id", class_id)
        .maybe_single()
        .execute()
    )
    plan = plan_res.data if plan_res else None
    import_row = None
    if plan and plan.get("source_import_id"):
        import_row = _get_import_by_id(admin, token.tenant_id, plan["source_import_id"])
    if not import_row:
        import_row = _get_latest_import_for_class(admin, token.tenant_id, class_id)
    return success(build_import_payload(import_row, admin) if import_row else None)


