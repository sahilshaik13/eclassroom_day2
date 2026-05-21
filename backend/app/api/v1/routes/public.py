from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, EmailStr
from typing import Any, Optional

from app.core import cache_keys, cache_ttl
from app.core.cache_service import get_or_set_cache
from app.db.supabase import get_admin_client
from app.core.response import success, error

router = APIRouter(prefix="/public", tags=["public"])

_PUBLIC_CACHE = "public, max-age=300, s-maxage=600"


class TeacherApplicationSubmit(BaseModel):
    name: str
    email: EmailStr
    whatsapp: str
    subject: Optional[str] = None
    experience: Optional[str] = None


class StudentApplicationSubmit(BaseModel):
    name: str
    phone: str
    notes: Optional[str] = None

@router.get("/tenants/{slug}")
async def get_tenant_public(slug: str, response: Response):
    """Fetch basic tenant info for the recruitment page."""
    cache_key = cache_keys.public_tenant(slug)

    async def _load() -> Optional[dict[str, Any]]:
        admin = get_admin_client()
        res = (
            admin.table("tenants")
            .select("id, name, slug")
            .eq("slug", slug)
            .eq("is_active", True)
            .maybe_single()
            .execute()
        )
        return res.data

    data, hit = await get_or_set_cache(cache_key, cache_ttl.PUBLIC_TENANT, _load)
    if not data:
        return error("NOT_FOUND", "Organization not found", 404)

    out = success(data)
    out.headers["Cache-Control"] = _PUBLIC_CACHE
    out.headers["X-Cache"] = "HIT" if hit else "MISS"
    return out

@router.post("/tenants/{slug}/apply")
async def apply_teacher(slug: str, body: TeacherApplicationSubmit):
    """Submit a teacher application."""
    admin = get_admin_client()
    
    # 1. Get tenant
    tenant_res = admin.table("tenants").select("id").eq("slug", slug).eq("is_active", True).maybe_single().execute()
    if not tenant_res.data:
        return error("NOT_FOUND", "Organization not found", 404)
    
    tenant_id = tenant_res.data["id"]
    
    # 2. Prevent duplicate pending applications
    # Using simple select() instead of maybe_single() for better compatibility
    res = admin.table("teacher_applications").select("id").eq("tenant_id", tenant_id).eq("email", body.email).eq("status", "pending").execute()
    if res and res.data:
        return error("ALREADY_EXISTS", "You have a pending application with this organization.", 400)
    
    # 3. Insert application
    res = admin.table("teacher_applications").insert({
        "tenant_id": tenant_id,
        "name": body.name,
        "email": body.email,
        "whatsapp": body.whatsapp,
        "subject": body.subject,
        "experience": body.experience,
    }).execute()
    
    return success({"message": "Application submitted successfully! Our team will review it and get back to you via email."})


@router.post("/tenants/{slug}/student-apply")
async def apply_student(slug: str, body: StudentApplicationSubmit):
    """Submit a student application for admin review."""
    admin = get_admin_client()

    tenant_res = (
        admin.table("tenants")
        .select("id")
        .eq("slug", slug)
        .eq("is_active", True)
        .maybe_single()
        .execute()
    )
    if not tenant_res.data:
        return error("NOT_FOUND", "Organization not found", 404)

    tenant_id = tenant_res.data["id"]
    normalized_phone = body.phone.strip()

    pending_res = (
        admin.table("student_applications")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("phone", normalized_phone)
        .eq("status", "pending")
        .execute()
    )
    if pending_res and pending_res.data:
        return error("ALREADY_EXISTS", "You already have a pending student application with this organization.", 400)

    admin.table("student_applications").insert(
        {
            "tenant_id": tenant_id,
            "name": body.name,
            "phone": normalized_phone,
            "notes": body.notes,
        }
    ).execute()

    return success({"message": "Student application submitted successfully! The admin will review it and assign you to a class."})
