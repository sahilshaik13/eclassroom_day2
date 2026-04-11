"""
Super Admin routes — platform-level management.

GET  /api/v1/super-admin/stats
GET  /api/v1/super-admin/tenants
POST /api/v1/super-admin/tenants
PATCH /api/v1/super-admin/tenants/:id
GET  /api/v1/super-admin/tenants/:id
GET  /api/v1/super-admin/tenants/:id/admins
POST /api/v1/super-admin/tenants/:id/admins
PATCH /api/v1/super-admin/admins/:id
"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from app.core.deps import require_super_admin, TokenData
from app.core.response import success, error
from app.db.supabase import get_admin_client
from app.services.auth_service import AuthService, AuthError
from app.core.config import settings


router = APIRouter(prefix="/super-admin", tags=["super-admin"])


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
    """Get platform-wide statistics."""
    admin = get_admin_client()
    
    try:
        # Count tenants
        tenants_res = admin.table("tenants").select("id", count="exact").execute()
        total_tenants = tenants_res.count if tenants_res else 0
        
        # Count active tenants
        active_tenants_res = admin.table("tenants").select("id", count="exact").eq("is_active", True).execute()
        active_tenants = active_tenants_res.count if active_tenants_res else 0
        
        # Count all admins (role = admin in users table)
        admins_res = admin.table("users").select("id", count="exact").eq("role", "admin").execute()
        total_admins = admins_res.count if admins_res else 0
        
        # Count all teachers
        teachers_res = admin.table("users").select("id", count="exact").eq("role", "teacher").execute()
        total_teachers = teachers_res.count if teachers_res else 0
        
        # Count all students
        students_res = admin.table("students").select("id", count="exact").execute()
        total_students = students_res.count if students_res else 0
        
        return success({
            "total_tenants": total_tenants,
            "active_tenants": active_tenants,
            "total_admins": total_admins,
            "total_teachers": total_teachers,
            "total_students": total_students,
        })
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants")
async def list_tenants(token: TokenData = Depends(require_super_admin)):
    """List all tenants with their stats."""
    admin = get_admin_client()
    
    try:
        # Get all tenants
        tenants_res = admin.table("tenants").select("*").order("created_at", desc=True).execute()
        tenants = (tenants_res.data if tenants_res else []) or []
        
        # Enrich each tenant with counts
        enriched_tenants = []
        for tenant in tenants:
            tenant_id = tenant["id"]
            
            # Count admins for this tenant
            admins_count = admin.table("users").select("id", count="exact").eq("tenant_id", tenant_id).eq("role", "admin").execute()
            
            # Count teachers for this tenant
            teachers_count = admin.table("users").select("id", count="exact").eq("tenant_id", tenant_id).eq("role", "teacher").execute()
            
            # Count students for this tenant
            students_count = admin.table("students").select("id", count="exact").eq("tenant_id", tenant_id).execute()
            
            enriched_tenants.append({
                **tenant,
                "admin_count": admins_count.count or 0,
                "teacher_count": teachers_count.count or 0,
                "student_count": students_count.count or 0,
            })
        
        return success({"tenants": enriched_tenants})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.post("/tenants")
async def create_tenant(body: CreateTenantRequest, token: TokenData = Depends(require_super_admin)):
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
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback"
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
        
        return success({"tenant": result.data[0]})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """
    Permanently delete a tenant and all associated data.
    Order: enrollments → students → classes → teacher_applications → users → tenant
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

        # 4. Remove teacher applications
        admin.table("teacher_applications").delete().eq("tenant_id", tid).execute()

        # 5. Remove all users (admins + teachers)
        admin.table("users").delete().eq("tenant_id", tid).execute()

        # 6. Finally delete the tenant itself
        result = admin.table("tenants").delete().eq("id", tid).execute()

        if not result.data:
            return error("NOT_FOUND", "Tenant not found", 404)

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
async def create_tenant_admin(tenant_id: UUID, body: CreateAdminRequest, token: TokenData = Depends(require_super_admin)):
    """Set the primary admin for a tenant. Replaces existing list logic with singular enforcement."""
    admin_client = get_admin_client()
    
    try:
        # Check tenant exists
        tenant_res = admin_client.table("tenants").select("id").eq("id", str(tenant_id)).single().execute()
        if not tenant_res.data:
            return error("NOT_FOUND", "Tenant not found", 404)
        
        # Check if an admin already exists (singular enforcement)
        existing = admin_client.table("users").select("id").eq("tenant_id", str(tenant_id)).eq("role", "admin").maybe_single().execute()
        if existing.data:
            return error("CONFLICT", "This tenant already has an admin. Use 'Change Manager' instead.", 409)

        # Use existing invite flow
        redirect_url = f"{settings.FRONTEND_URL}/auth/callback"
        result = await AuthService.invite_user_by_email(
            email=body.email,
            name=body.name,
            role="admin",
            tenant_id=str(tenant_id),
            redirect_to=redirect_url,
        )
        
        # Create user record in users table
        admin_client.table("users").insert({
            "id": result["user_id"],
            "name": body.name,
            "email": body.email,
            "role": "admin",
            "tenant_id": str(tenant_id),
            "has_password": False,
            "is_registered": False,
        }).execute()
        
        return success({
            "message": f"Invite email sent to {body.email}",
            "admin_id": result["user_id"],
        })
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


@router.get("/tenants/{tenant_id}/teachers")
async def list_tenant_teachers(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """List all teachers for a specific tenant (read-only platform view)."""
    admin_client = get_admin_client()

    try:
        result = admin_client.table("users").select(
            "id, name, email, is_active, is_registered, deactivated_at, created_at"
        ).eq("tenant_id", str(tenant_id)).eq("role", "teacher").order("created_at", desc=True).execute()

        teachers = result.data or []

        # Enrich with class and student counts
        enriched = []
        for t in teachers:
            classes_res = admin_client.table("classes").select("id", count="exact").eq("teacher_id", t["id"]).execute()
            class_count = classes_res.count or 0

            # Count students across all classes for this teacher
            class_ids_res = admin_client.table("classes").select("id").eq("teacher_id", t["id"]).execute()
            class_ids = [c["id"] for c in (class_ids_res.data or [])]
            student_count = 0
            if class_ids:
                enrollments_res = admin_client.table("class_enrollments").select("id", count="exact").in_("class_id", class_ids).execute()
                student_count = enrollments_res.count or 0

            enriched.append({
                **t,
                "class_count": class_count,
                "student_count": student_count,
            })

        return success({"teachers": enriched})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/tenants/{tenant_id}/students")
async def list_tenant_students(tenant_id: UUID, token: TokenData = Depends(require_super_admin)):
    """List all students for a specific tenant (read-only platform view)."""
    admin_client = get_admin_client()

    try:
        students_res = admin_client.table("students").select(
            "id, user_id, name, phone, deactivated_at, created_at"
        ).eq("tenant_id", str(tenant_id)).order("created_at", desc=True).execute()

        students = students_res.data or []

        # Enrich with class info
        enriched = []
        for s in students:
            enrollment_res = admin_client.table("class_enrollments").select(
                "classes(id, name, teacher_id, users(name))"
            ).eq("student_id", s["id"]).limit(1).execute()

            class_name = None
            teacher_name = None
            if enrollment_res.data:
                cls = enrollment_res.data[0].get("classes")
                if cls:
                    class_name = cls.get("name")
                    teacher_name = (cls.get("users") or {}).get("name")

            enriched.append({
                **s,
                "is_active": s.get("deactivated_at") is None,
                "class_name": class_name,
                "teacher_name": teacher_name,
                "status": "Inactive" if s.get("deactivated_at") else "Active",
            })

        return success({"students": enriched})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)
