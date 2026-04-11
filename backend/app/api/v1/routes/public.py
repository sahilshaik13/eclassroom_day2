from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.db.supabase import get_admin_client
from app.core.response import success, error

router = APIRouter(prefix="/public", tags=["public"])

class TeacherApplicationSubmit(BaseModel):
    name: str
    email: EmailStr
    whatsapp: str
    subject: Optional[str] = None
    experience: Optional[str] = None

@router.get("/tenants/{slug}")
async def get_tenant_public(slug: str):
    """Fetch basic tenant info for the recruitment page."""
    admin = get_admin_client()
    res = admin.table("tenants").select("id, name, slug").eq("slug", slug).eq("is_active", True).maybe_single().execute()
    
    if not res.data:
        return error("NOT_FOUND", "Organization not found", 404)
        
    return success(res.data)

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
