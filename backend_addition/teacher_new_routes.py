# ── Student search (all tenant students, not just enrolled) ──
# Add this route to teacher.py BEFORE the existing /students route

from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, Request
from app.core.deps import require_teacher, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client


# ─────────────────────────────────────────────────────────────
# PASTE INTO teacher.py — search route
# ─────────────────────────────────────────────────────────────

@router.get("/students/search")
async def search_all_students(
    request: Request,
    q: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    """
    Search ALL students in the teacher's tenant (not just enrolled).
    Used by the 'Add Student to Class' dialog.
    Returns name, phone, id, and whether already enrolled in teacher's class.
    """
    if not q or len(q.strip()) < 2:
        return success([])

    # Use admin client to search across all tenant students
    admin = get_admin_client()
    search_term = q.strip()

    # Search by name OR phone (ilike for case-insensitive)
    name_res = (
        admin.table("students")
        .select("id, name, phone, deactivated_at, class_enrollments(class_id)")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .ilike("name", f"%{search_term}%")
        .limit(20)
        .execute()
    )

    phone_res = (
        admin.table("students")
        .select("id, name, phone, deactivated_at, class_enrollments(class_id)")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .ilike("phone", f"%{search_term}%")
        .limit(20)
        .execute()
    )

    # Get teacher's class IDs to show enrollment status
    classes_res = (
        admin.table("classes").select("id")
        .eq("teacher_id", token.user_id)
        .execute()
    )
    teacher_class_ids = {c["id"] for c in (classes_res.data or [])}

    # Merge and deduplicate results
    seen: set = set()
    results = []
    for row in (name_res.data or []) + (phone_res.data or []):
        if row["id"] in seen:
            continue
        seen.add(row["id"])

        # Check if already in one of teacher's classes
        enrolled_class_ids = {
            e["class_id"] for e in (row.get("class_enrollments") or [])
        }
        already_enrolled = bool(enrolled_class_ids & teacher_class_ids)

        results.append({
            "id": row["id"],
            "name": row["name"],
            "phone": row.get("phone", ""),
            "already_enrolled": already_enrolled,
        })

    return success(results)


# ─────────────────────────────────────────────────────────────
# PASTE INTO teacher.py — enroll route
# ─────────────────────────────────────────────────────────────

class EnrollStudentPayload(BaseModel):
    student_id: str
    class_id: str


@router.post("/students/enroll")
async def enroll_student_into_class(
    body: EnrollStudentPayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Enroll a student into one of the teacher's classes.
    Teacher can only enroll into their own classes (RLS enforced).
    Once enrolled, the student appears in admin dashboard counts.
    """
    admin = get_admin_client()

    # 1. Verify the class belongs to this teacher
    class_check = (
        admin.table("classes").select("id, name, tenant_id")
        .eq("id", body.class_id)
        .eq("teacher_id", token.user_id)
        .maybe_single()
        .execute()
    )
    if not class_check.data:
        return error("NOT_FOUND", "Class not found or you are not the assigned teacher", 403)

    class_data = class_check.data

    # 2. Verify student belongs to the same tenant
    student_check = (
        admin.table("students").select("id, name, tenant_id")
        .eq("id", body.student_id)
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .maybe_single()
        .execute()
    )
    if not student_check.data:
        return error("NOT_FOUND", "Student not found in your organization", 404)

    # 3. Enroll (upsert — safe to call if already enrolled)
    enroll_res = (
        admin.table("class_enrollments")
        .upsert(
            {
                "student_id": body.student_id,
                "class_id": body.class_id,
                "tenant_id": token.tenant_id,
            },
            on_conflict="student_id,class_id",
        )
        .execute()
    )

    return success({
        "enrolled": True,
        "student_name": student_check.data["name"],
        "class_name": class_data["name"],
    })
