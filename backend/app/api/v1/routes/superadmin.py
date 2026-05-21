"""
Super Admin routes — platform-level management.

GET  /api/v1/super-admin/stats
GET  /api/v1/super-admin/tenants
POST /api/v1/super-admin/tenants
PATCH /api/v1/super-admin/tenants/:id
GET  /api/v1/super-admin/tenants/:id
GET  /api/v1/super-admin/tenants/:id/admins
POST /api/v1/super-admin/tenants/:id/admins
GET  /api/v1/super-admin/audit-logs
"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from app.core.deps import require_super_admin, TokenData
from app.core.response import success, error, paginated
from app.db.supabase import get_admin_client
from app.services.auth_service import AuthService, AuthError
from app.services.super_admin_service import (
    bust_platform_dashboard_cache,
    fetch_platform_stats,
    fetch_tenants_with_counts,
    fetch_tenant_teachers_enriched,
    fetch_tenant_students_enriched,
)
from app.core.config import settings


router = APIRouter(prefix="/super-admin", tags=["super-admin"])


class TeacherInvite(BaseModel):
    email: EmailStr
    name: str

class StudentCreate(BaseModel):
    name: str
    phone: str
    class_id: Optional[str] = None


# ── Request schemas ────────────────────────────────────────────────────────────

class CreateTenantRequest(BaseModel):
    name: str
    slug: str
    admin_name: str
    admin_email: EmailStr


class UpdateTenantRequest(BaseModel):
    is_active: Optional[bool] = None
    name: Optional[str] = None


class CreateAdminRequest(BaseModel):
    email: EmailStr
    name: str


class UpdateAdminRequest(BaseModel):
    is_active: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_platform_stats(token: TokenData = Depends(require_super_admin)):
    """Get platform-wide statistics (parallel counts + Redis cache)."""
    try:
        data, cached = await fetch_platform_stats()
        response = success(data)
        response.headers["X-Cache"] = "HIT" if cached else "MISS"
        return response
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = 1,
    limit: int = 100,
    tenant_id: Optional[str] = None,
    token: TokenData = Depends(require_super_admin),
):
    """
    Paginated application log trail from Neon Postgres (DATABASE_URL).
    HTTP requests, warnings, and errors. Retention trimmed by cron.
    """
    limit = max(1, min(limit, 200))
    page = max(1, page)

    try:
        from app.services.audit_log_service import list_audit_events

        rows, total = await list_audit_events(page=page, limit=limit, tenant_id=tenant_id)
        return paginated(rows, page, limit, total)
    except RuntimeError as e:
        return error("SERVICE_UNAVAILABLE", str(e), 503)  # DATABASE_URL missing
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants")
async def list_tenants(token: TokenData = Depends(require_super_admin)):
    """List all tenants with role/student counts (bulk fetch + Redis cache)."""
    try:
        enriched, cached = await fetch_tenants_with_counts()
        response = success({"tenants": enriched})
        response.headers["X-Cache"] = "HIT" if cached else "MISS"
        return response
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/tenants")
async def create_tenant(
    body: CreateTenantRequest,
    request: Request,
    token: TokenData = Depends(require_super_admin),
):
    """Create a new tenant and its primary admin in one flow."""
    admin_client = get_admin_client()
    
    try:
        # 1. Check if slug already exists
        existing = admin_client.table("tenants").select("id").eq("slug", body.slug).maybe_single().execute()
        if existing and existing.data:
            return error("CONFLICT", "A tenant with this slug already exists", 409)
        
        # 2. Check if admin email is already in use
        existing_user = admin_client.table("users").select("id").eq("email", body.admin_email).maybe_single().execute()
        if existing_user and existing_user.data:
            return error("CONFLICT", "An admin with this email already exists", 409)

        # 3. Create tenant
        tenant_res = admin_client.table("tenants").insert({
            "name": body.name,
            "slug": body.slug,
            "is_active": True,
        }).execute()
        
        if not tenant_res.data:
            return error("INTERNAL_ERROR", "Failed to create tenant", 500)
        
        tenant = tenant_res.data[0]
        tenant_id = tenant["id"]

        # 4. Invite Admin
        # Determine dynamic redirect URL
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = settings.FRONTEND_URL
        if origin:
            base_url = origin
        elif referer:
            from urllib.parse import urlparse
            p = urlparse(referer)
            base_url = f"{p.scheme}://{p.netloc}"
        redirect_url = f"{base_url}/auth/callback"

        invite_res = await AuthService.invite_user_by_email(
            email=body.admin_email,
            name=body.admin_name,
            role="admin",
            tenant_id=tenant_id,
            redirect_to=redirect_url,
        )
        
        # 5. Create user record
        admin_client.table("users").insert({
            "id": invite_res["user_id"],
            "name": body.admin_name,
            "email": body.admin_email,
            "role": "admin",
            "tenant_id": tenant_id,
            "has_password": False,
            "is_registered": False,
        }).execute()
        
        await bust_platform_dashboard_cache(str(tenant_id))
        return success({
            "tenant": tenant,
            "admin": {
                "id": invite_res["user_id"],
                "name": body.admin_name,
                "email": body.admin_email
            }
        })
    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.patch("/tenants/{tenant_id}")
async def update_tenant(tenant_id: UUID, body: UpdateTenantRequest, token: TokenData = Depends(require_super_admin)):
    """Update a tenant (activate/deactivate, rename)."""
    admin = get_admin_client()
    
    try:
        update_data = {}
        if body.is_active is not None:
            update_data["is_active"] = body.is_active
        if body.name is not None:
            update_data["name"] = body.name
        
        if not update_data:
            return error("BAD_REQUEST", "No fields to update", 400)
        
        result = admin.table("tenants").update(update_data).eq("id", str(tenant_id)).execute()
        
        if not result.data:
            return error("NOT_FOUND", "Tenant not found", 404)

        await bust_platform_dashboard_cache(str(tenant_id))
        return success({"tenant": result.data[0]})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """
    Permanently delete a tenant and all associated data.
    Order: enrollments → students → classes → applications → audit logs → users → tenant
    """
    admin = get_admin_client()
    tid = str(tenant_id)

    try:
        # 1. Remove class enrollments for all classes in this tenant
        class_ids_res = admin.table("classes").select("id").eq("tenant_id", tid).execute()
        class_ids = [c["id"] for c in (class_ids_res.data or [])]
        if class_ids:
            admin.table("class_enrollments").delete().in_("class_id", class_ids).execute()

        # 2. Remove all students
        admin.table("students").delete().eq("tenant_id", tid).execute()

        # 3. Remove all classes
        admin.table("classes").delete().eq("tenant_id", tid).execute()

        # 4. Remove tenant application queues
        admin.table("teacher_applications").delete().eq("tenant_id", tid).execute()
        admin.table("student_applications").delete().eq("tenant_id", tid).execute()

        # 4b. Audit log rows for this tenant (Redis)
        try:
            from app.services.audit_log_service import purge_tenant_audit_logs

            await purge_tenant_audit_logs(tid)
        except Exception:
            pass

        # 5. Remove all users (admins + teachers)
        admin.table("users").delete().eq("tenant_id", tid).execute()

        # 6. Finally delete the tenant itself
        result = admin.table("tenants").delete().eq("id", tid).execute()

        if not result.data:
            return error("NOT_FOUND", "Tenant not found", 404)

        await bust_platform_dashboard_cache(tid)
        return success({"message": "Tenant and all associated data permanently deleted."})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """Get a single tenant with its singular admin details."""
    admin_client = get_admin_client()
    
    try:
        tenant_res = admin_client.table("tenants").select("*").eq("id", str(tenant_id)).single().execute()
        
        if not tenant_res.data:
            return error("NOT_FOUND", "Tenant not found", 404)
        
        tenant = tenant_res.data
        
        # Get the primary admin
        admin_res = admin_client.table("users").select("id, name, email, is_registered, deactivated_at").eq("tenant_id", str(tenant_id)).eq("role", "admin").maybe_single().execute()
        
        # Get other counts
        teachers_count = admin_client.table("users").select("id", count="exact").eq("tenant_id", str(tenant_id)).eq("role", "teacher").execute()
        students_count = admin_client.table("students").select("id", count="exact").eq("tenant_id", str(tenant_id)).execute()
        
        return success({
            "tenant": {
                **tenant,
                "admin": admin_res.data if admin_res else None,
                "teacher_count": teachers_count.count or 0,
                "student_count": students_count.count or 0,
            }
        })
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants/{tenant_id}/admins")
async def list_tenant_admins(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """List all admins for a specific tenant."""
    admin = get_admin_client()
    
    try:
        result = admin.table("users").select("id, name, email, role, is_registered, created_at, deactivated_at").eq("tenant_id", str(tenant_id)).eq("role", "admin").order("created_at", desc=True).execute()
        
        admins = result.data or []
        # Add is_active field based on deactivated_at
        for a in admins:
            a["is_active"] = a.get("deactivated_at") is None
        
        return success({"admins": admins})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/tenants/{tenant_id}/admins")
async def create_tenant_admin(
    tenant_id: UUID,
    body: CreateAdminRequest,
    request: Request,
    token: TokenData = Depends(require_super_admin),
):
    """Set the primary admin for a tenant. Replaces existing list logic with singular enforcement."""
    admin_client = get_admin_client()
    
    try:
        # Check tenant exists
        tenant_res = admin_client.table("tenants").select("id").eq("id", str(tenant_id)).maybe_single().execute()
        if not tenant_res or not tenant_res.data:
            return error("NOT_FOUND", "Tenant not found", 404)
        
        # Check if an admin already exists (singular enforcement)
        existing = admin_client.table("users").select("id").eq("tenant_id", str(tenant_id)).eq("role", "admin").maybe_single().execute()
        if existing and existing.data:
            return error("CONFLICT", "This tenant already has an admin. Use 'Change Manager' instead.", 409)

        # Send invite email (non-fatal — admin must be created even if email fails)
        # Determine dynamic redirect URL
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        base_url = settings.FRONTEND_URL
        if origin:
            base_url = origin
        elif referer:
            from urllib.parse import urlparse
            p = urlparse(referer)
            base_url = f"{p.scheme}://{p.netloc}"
        redirect_url = f"{base_url}/auth/callback"

        invite_result = None
        invite_warning = None
        try:
            invite_result = await AuthService.invite_user_by_email(
                email=body.email,
                name=body.name,
                role="admin",
                tenant_id=str(tenant_id),
                redirect_to=redirect_url,
            )
        except AuthError as e:
            invite_warning = f"Invite email failed: {e.message}. Please share login details manually."
        except Exception as e:
            invite_warning = f"Invite email failed: {str(e)}. Please share login details manually."

        # Fallback: create auth user directly if invite failed
        if not invite_result:
            import httpx
            import uuid as _uuid
            try:
                auth_headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type": "application/json",
                }
                async with httpx.AsyncClient() as http:
                    resp = await http.post(
                        f"{settings.SUPABASE_URL}/auth/v1/admin/users",
                        json={
                            "email": body.email,
                            "email_confirm": True,
                            "app_metadata": {"role": "admin", "tenant_id": str(tenant_id)},
                            "user_metadata": {"name": body.name},
                        },
                        headers=auth_headers,
                    )
                    if resp.status_code < 400:
                        invite_result = {"user_id": resp.json()["id"]}
                    else:
                        return error("INTERNAL_ERROR", f"Could not create auth user: {resp.text}", 500)
            except Exception as e2:
                return error("INTERNAL_ERROR", f"Auth user creation failed: {str(e2)}", 500)

        # Create user record in users table
        admin_client.table("users").insert({
            "id": invite_result["user_id"],
            "name": body.name,
            "email": body.email,
            "role": "admin",
            "tenant_id": str(tenant_id),
            "has_password": False,
            "is_registered": False,
        }).execute()

        response_data = {
            "message": f"Admin created for {body.email}" if invite_warning else f"Invite email sent to {body.email}",
            "admin_id": invite_result["user_id"],
        }
        if invite_warning:
            response_data["invite_warning"] = invite_warning

        await bust_platform_dashboard_cache(str(tenant_id))
        return success(response_data)
    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.patch("/admins/{admin_id}")
async def update_admin(admin_id: UUID, body: UpdateAdminRequest, token: TokenData = Depends(require_super_admin)):
    """Activate/deactivate a tenant admin."""
    admin = get_admin_client()
    
    try:
        from datetime import datetime, timezone
        
        update_data = {
            "deactivated_at": None if body.is_active else datetime.now(timezone.utc).isoformat()
        }
        
        result = admin.table("users").update(update_data).eq("id", str(admin_id)).eq("role", "admin").execute()
        
        if not result.data:
            return error("NOT_FOUND", "Admin not found", 404)
        
        return success({"admin": result.data[0]})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/admins/{admin_id}/resend-invite")
async def resend_admin_invite(admin_id: UUID, request: Request, token: TokenData = Depends(require_super_admin)):
    """Resend the invitation email to a tenant admin who has not yet set their password."""
    admin_client = get_admin_client()
    try:
        res = admin_client.table("users") \
            .select("id, email, role, has_password, tenant_id") \
            .eq("id", str(admin_id)) \
            .eq("role", "admin") \
            .maybe_single() \
            .execute()

        if not res or not res.data:
            return error("NOT_FOUND", "Admin not found", 404)

        user = res.data
        if user.get("has_password"):
            return error("ALREADY_REGISTERED", "This admin has already set their password. No invite needed.", 400)

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
            user_id=user["id"],
            email=user["email"],
            role="admin",
            tenant_id=user["tenant_id"],
            redirect_to=redirect_to,
        )
        return success(result)

    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants/{tenant_id}/teachers")
async def list_tenant_teachers(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """List all teachers for a specific tenant (read-only platform view)."""
    try:
        enriched = fetch_tenant_teachers_enriched(str(tenant_id))
        return success({"teachers": enriched})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/tenants/{tenant_id}/teachers")
async def invite_teacher_to_tenant(
    tenant_id: UUID,
    body: TeacherInvite,
    request: Request,
    token: TokenData = Depends(require_super_admin)
):
    """Invite a teacher to a specific tenant (platform admin view)."""
    try:
        # 1. Verify tenant exists
        admin = get_admin_client()
        tenant_res = admin.table("tenants").select("id").eq("id", str(tenant_id)).maybe_single().execute()
        if not tenant_res.data:
            return error("NOT_FOUND", "Tenant not found", 404)

        # 2. Determine redirect URL
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

        # 3. Invite via AuthService
        result = await AuthService.invite_user_by_email(
            email=body.email,
            name=body.name,
            role="teacher",
            tenant_id=str(tenant_id),
            redirect_to=redirect_to,
        )

        # 4. Sync to users table
        admin.table("users").upsert({
            "id": result["user_id"],
            "tenant_id": str(tenant_id),
            "role": "teacher",
            "email": body.email,
            "name": body.name,
            "is_active": True,
        }).execute()

        # 5. Update app_metadata
        import httpx
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            await client.put(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{result['user_id']}",
                json={"app_metadata": {"role": "teacher", "tenant_id": str(tenant_id)}},
                headers=auth_headers,
            )

        await bust_platform_dashboard_cache(str(tenant_id))
        return success(result, status_code=201)

    except AuthError as e:
        if "user already exists" in e.message.lower():
            return error("ALREADY_EXISTS", f"A user with email {body.email} is already registered.", 400)
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", f"An unexpected error occurred: {str(e)}", 500)


@router.get("/tenants/{tenant_id}/students")
async def list_tenant_students(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """List all students for a specific tenant (read-only platform view)."""
    try:
        enriched = fetch_tenant_students_enriched(str(tenant_id))
        return success({"students": enriched})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/tenants/{tenant_id}/students")
async def invite_student_to_tenant(
    tenant_id: UUID,
    body: StudentCreate,
    request: Request,
    token: TokenData = Depends(require_super_admin)
):
    """Register a student for a specific tenant (platform admin view)."""
    admin = get_admin_client()

    try:
        # 1. Verify tenant exists
        tenant_res = admin.table("tenants").select("id").eq("id", str(tenant_id)).maybe_single().execute()
        if not tenant_res.data:
            return error("NOT_FOUND", "Tenant not found", 404)

        # 2. Create auth user (phone-based, no password)
        import httpx
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        
        payload = {
            "phone": body.phone,
            "phone_confirm": True,
            "app_metadata": {"role": "student", "tenant_id": str(tenant_id)},
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

        # 3. Insert user row
        admin.table("users").insert({
            "id": user_id,
            "tenant_id": str(tenant_id),
            "role": "student",
            "phone": body.phone,
            "name": body.name,
        }).execute()

        # 4. Insert student row
        stu_res = admin.table("students").insert({
            "user_id": user_id,
            "tenant_id": str(tenant_id),
            "name": body.name,
            "phone": body.phone,
        }).execute()

        student = stu_res.data[0] if stu_res.data else {}

        # 5. Enroll in class if provided
        if body.class_id and student.get("id"):
            admin.table("class_enrollments").insert({
                "student_id": student["id"],
                "class_id": body.class_id,
                "tenant_id": str(tenant_id),
            }).execute()

        await bust_platform_dashboard_cache(str(tenant_id))
        return success(student, status_code=201)
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)
