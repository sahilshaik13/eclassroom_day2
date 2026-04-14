from uuid import UUID
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import get_current_user, TokenData, RequireRole, RequireActiveTenant
from app.core.response import success, error
from app.db.supabase import get_user_client

router = APIRouter(prefix="", tags=["competitions"])


# ── Schemas ────────────────────────────────────────────────────────

class CompetitionCreate(BaseModel):
    title: str
    category: str = "mcq" # mcq, hifz, khirat
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assigned_teacher_id: Optional[UUID] = None
    status: str = "draft"
    content: Optional[List] = None
    settings: Optional[dict] = None


class CompetitionUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    assigned_teacher_id: Optional[UUID] = None
    status: Optional[str] = None
    content: Optional[List] = None
    settings: Optional[dict] = None
    is_exam_active: Optional[bool] = None


class CompetitionRegister(BaseModel):
    phone: str
    name: str
    tenant_id: UUID


class ResultSubmit(BaseModel):
    registration_id: UUID
    score: int
    remarks: Optional[str] = None


class ResultUpdate(BaseModel):
    score: Optional[int] = None
    remarks: Optional[str] = None


class ExamSubmission(BaseModel):
    responses: List[dict] # [{index: 0, answer: 1}, {index: 1, audio_url: '...'}]
    metadata: Optional[dict] = None

class TeacherEvaluationSubmit(BaseModel):
    score: int
    remarks: Optional[str] = None
    responses_override: Optional[List[dict]] = None
    release_results: bool = False


# ── Public Endpoints ───────────────────────────────────────────────

@router.get("/competitions/{competition_id}/info")
async def get_competition_info(competition_id: UUID):
    # Public endpoint, no auth required, so we use admin client but strictly limit fields
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    res = (
        admin.table("competitions")
        .select("id, title, description, start_date, end_date, status, tenant_id, category, content, settings, is_exam_active")
        .eq("id", str(competition_id))
        .maybe_single()
        .execute()
    )
    if not res.data:
        return error("NOT_FOUND", "Competition not found", 404)
        
    return success(res.data)


# ── Post-OTP Registrant Endpoint ───────────────────────────────────

@router.post("/competitions/{competition_id}/register")
async def register_competition(
    competition_id: UUID,
    body: CompetitionRegister,
    token: TokenData = Depends(get_current_user)
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    tenant_id_str = str(body.tenant_id)
    comp_id_str = str(competition_id)
    
    # If phone is missing from body (e.g. authed user didn't have it in client state), fetch it
    real_phone = body.phone
    if not real_phone:
        user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
        if user_res and user_res.data:
            real_phone = user_res.data.get("phone", "")
            
    # Check if student exists — try by phone first, then by user_id from JWT
    student_id = None
    stu_res = (
        admin.table("students")
        .select("id")
        .eq("phone", real_phone)
        .eq("tenant_id", tenant_id_str)
        .maybe_single()
        .execute()
    )
    if stu_res and stu_res.data:
        student_id = stu_res.data["id"]
    
    # Fallback: check by user_id from the JWT token
    if not student_id:
        stu_res2 = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
        if stu_res2 and stu_res2.data:
            student_id = stu_res2.data["id"]

    try:
        res = admin.table("competition_registrations").upsert({
            "competition_id": comp_id_str,
            "tenant_id": tenant_id_str,
            "phone": real_phone,
            "name": body.name,
            "student_id": student_id,
            "status": "registered"
        }, on_conflict="competition_id, phone").execute()
        return success(res.data[0] if res.data else {"message": "Registered"})
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


# ── Teacher + Admin Endpoints ──────────────────────────────────────

@router.get("/competitions/{competition_id}/registrations")
async def get_competition_registrations(
    competition_id: UUID, 
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Only admins or teachers can view registrations", 403)
        
    client = get_user_client(token.raw_token)
    # Using service role pattern for competitions so we query via admin client 
    # but ensure it's limited to the tenant.
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    # Verify ownership or assignment
    comp_res = admin.table("competitions").select("tenant_id, assigned_teacher_id").eq("id", str(competition_id)).maybe_single().execute()
    if not comp_res.data or comp_res.data["tenant_id"] != str(token.tenant_id):
        return error("NOT_FOUND", "Competition not found or access denied", 404)
        
    if token.role == "teacher" and comp_res.data["assigned_teacher_id"] != str(token.user_id):
        return error("FORBIDDEN", "Not assigned to this competition", 403)

    regs = admin.table("competition_registrations").select("*, competition_results(*)").eq("competition_id", str(competition_id)).execute()
    return success(regs.data)


@router.patch("/competitions/{competition_id}/registrations/{registration_id}/evaluate")
async def evaluate_participant(
    competition_id: UUID,
    registration_id: UUID,
    body: TeacherEvaluationSubmit,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    tenant_id_str = str(token.tenant_id)

    # 1. Update competition_registrations (responses override & results_released)
    update_data = {
        "results_released": body.release_results
    }
    if body.responses_override is not None:
        update_data["responses"] = body.responses_override
        
    admin.table("competition_registrations").update(update_data).eq("id", str(registration_id)).eq("competition_id", str(competition_id)).execute()

    # 2. Upsert competition_results
    res = admin.table("competition_results").upsert({
        "competition_id": str(competition_id),
        "tenant_id": tenant_id_str,
        "registration_id": str(registration_id),
        "score": body.score,
        "remarks": body.remarks,
        "recorded_by": str(token.user_id)
    }, on_conflict="competition_id, registration_id").execute()

    return success(res.data[0] if res.data else {"message": "Evaluation saved"})

@router.post("/competitions/{competition_id}/results")
async def submit_result(
    competition_id: UUID,
    body: ResultSubmit,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    res = admin.table("competition_results").upsert({
        "competition_id": str(competition_id),
        "tenant_id": str(token.tenant_id),
        "registration_id": str(body.registration_id),
        "score": body.score,
        "remarks": body.remarks,
        "recorded_by": str(token.user_id)
    }, on_conflict="competition_id, registration_id").execute()
    
    return success(res.data[0] if res.data else {"message": "Result recorded"})


@router.patch("/competitions/{competition_id}/results/{result_id}")
async def update_result(
    competition_id: UUID,
    result_id: UUID,
    body: ResultUpdate,
    token: TokenData = Depends(get_current_user)
):
    if token.role not in ["admin", "teacher"]:
        return error("FORBIDDEN", "Access denied", 403)
        
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    update_data = {}
    if body.score is not None: update_data["score"] = body.score
    if body.remarks is not None: update_data["remarks"] = body.remarks
    
    if not update_data:
        return error("BAD_REQUEST", "Nothing to update", 400)
        
    res = admin.table("competition_results").update(update_data).eq("id", str(result_id)).eq("competition_id", str(competition_id)).execute()
    return success(res.data[0] if res.data else {"message": "Updated"})


# ── Admin-Only Endpoints ───────────────────────────────────────────

@router.post("/admin/competitions", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def create_competition(body: CompetitionCreate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    data = body.dict(exclude_unset=True)
    if "start_date" in data and isinstance(data["start_date"], date): data["start_date"] = data["start_date"].isoformat()
    if "end_date" in data and isinstance(data["end_date"], date): data["end_date"] = data["end_date"].isoformat()
    if "assigned_teacher_id" in data and data["assigned_teacher_id"]: data["assigned_teacher_id"] = str(data["assigned_teacher_id"])
    
    data["tenant_id"] = str(token.tenant_id)
    data["created_by"] = str(token.user_id)
    
    res = admin.table("competitions").insert(data).execute()
    return success(res.data[0] if res.data else {"message": "Created"})


@router.get("/admin/competitions", dependencies=[Depends(RequireRole(["admin"]))])
async def list_admin_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    res = admin.table("competitions").select("*, assigned_teacher:users!assigned_teacher_id(name)").eq("tenant_id", str(token.tenant_id)).order("created_at", desc=True).execute()
    return success(res.data)


@router.patch("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def modify_competition(competition_id: UUID, body: CompetitionUpdate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    update_data = body.dict(exclude_unset=True)
    if "start_date" in update_data and isinstance(update_data["start_date"], date): update_data["start_date"] = update_data["start_date"].isoformat()
    if "end_date" in update_data and isinstance(update_data["end_date"], date): update_data["end_date"] = update_data["end_date"].isoformat()
    if "assigned_teacher_id" in update_data and update_data["assigned_teacher_id"]: update_data["assigned_teacher_id"] = str(update_data["assigned_teacher_id"])
    
    # Auto-status logic
    if "assigned_teacher_id" in update_data and update_data["assigned_teacher_id"] and update_data.get("status") == "draft":
        update_data["status"] = "active"

    if not update_data: return error("BAD_REQUEST", "Nothing to update", 400)
    
    res = admin.table("competitions").update(update_data).eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).execute()
    return success(res.data[0] if res.data else {"message": "Updated"})


@router.get("/competitions/{competition_id}/content")
async def get_competition_content(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    # Look up phone/student_id for this user
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    
    # Find registration by student_id or phone
    reg = None
    if student_id:
        reg = admin.table("competition_registrations").select("id").eq("competition_id", str(competition_id)).eq("student_id", student_id).maybe_single().execute()
    if (not reg or not reg.data) and phone:
        reg = admin.table("competition_registrations").select("id").eq("competition_id", str(competition_id)).eq("phone", phone).maybe_single().execute()
    
    if not reg or not reg.data:
        return error("FORBIDDEN", "You are not registered for this competition", 403)
        
    res = admin.table("competitions").select("category, content, settings, is_exam_active").eq("id", str(competition_id)).maybe_single().execute()
    if res.data and not res.data.get("is_exam_active"):
        return error("FORBIDDEN", "The exam has not started yet. Please wait for the teacher.", 403)
        
    return success(res.data)


@router.post("/competitions/{competition_id}/submit")
async def submit_competition_exam(
    competition_id: UUID, 
    body: ExamSubmission, 
    token: TokenData = Depends(get_current_user)
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    from datetime import datetime
    
    # Look up phone/student_id for this user
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    
    # Find registration by student_id or phone
    reg = None
    if student_id:
        reg = admin.table("competition_registrations").select("id, is_submitted").eq("competition_id", str(competition_id)).eq("student_id", student_id).maybe_single().execute()
    if (not reg or not reg.data) and phone:
        reg = admin.table("competition_registrations").select("id, is_submitted").eq("competition_id", str(competition_id)).eq("phone", phone).maybe_single().execute()
    
    if not reg or not reg.data:
        return error("NOT_FOUND", "Registration not found", 404)
    if reg.data["is_submitted"]:
        return error("BAD_REQUEST", "Already submitted", 400)
        
    # Standard update
    update_data = {
        "responses": body.responses,
        "submitted_at": datetime.utcnow().isoformat(),
        "is_submitted": True,
        "status": "participated"
    }
    
    res = admin.table("competition_registrations").update(update_data).eq("id", reg.data["id"]).execute()
    
    # MCQ AUTO GRADING
    comp = admin.table("competitions").select("category, content").eq("id", str(competition_id)).maybe_single().execute()
    if comp.data and comp.data["category"] == "mcq":
        correct_answers = 0
        questions = comp.data["content"] or []
        for q_idx, question in enumerate(questions):
            student_ans = next((r["answer"] for r in body.responses if r.get("index") == q_idx), None)
            if student_ans is not None and student_ans == question.get("correct_option"):
                correct_answers += 1
        
        # Calculate percentage
        total_questions = len(questions)
        score = int((correct_answers / total_questions) * 100) if total_questions > 0 else 0
        
        # Record automated result
        admin.table("competition_results").upsert({
            "competition_id": str(competition_id),
            "tenant_id": str(token.tenant_id),
            "registration_id": reg.data["id"],
            "score": score,
            "remarks": f"Automated Score: {correct_answers}/{total_questions}",
            "recorded_by": str(token.user_id) # recorded by the system action
        }, on_conflict="competition_id, registration_id").execute()

    return success({"message": "Successfully submitted"})


@router.delete("/admin/competitions/{competition_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def delete_competition(competition_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    # HARD DELETE
    res = admin.table("competitions").delete().eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).execute()
    return success({"message": "Competition deleted permanently"})


@router.delete("/admin/competitions/{competition_id}/registrations/{registration_id}", dependencies=[Depends(RequireRole(["admin"])), Depends(RequireActiveTenant())])
async def delete_registration(competition_id: UUID, registration_id: UUID, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    # Verify competition belongs to tenant
    comp = admin.table("competitions").select("id").eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).maybe_single().execute()
    if not comp.data:
        return error("NOT_FOUND", "Competition not found", 404)
        
    # Delete registration
    res = admin.table("competition_registrations").delete().eq("id", str(registration_id)).eq("competition_id", str(competition_id)).execute()
    return success({"message": "Registration removed"})


# ── Teacher-Only Endpoints ─────────────────────────────────────────

@router.get("/teacher/competitions", dependencies=[Depends(RequireRole(["teacher"]))])
async def list_teacher_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    res = admin.table("competitions").select("*").eq("tenant_id", str(token.tenant_id)).eq("assigned_teacher_id", str(token.user_id)).execute()
    return success(res.data)


@router.patch("/teacher/competitions/{competition_id}/content", dependencies=[Depends(RequireRole(["teacher"]))])
async def save_teacher_exam_content(competition_id: UUID, body: CompetitionUpdate, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    # Verify teacher is assigned to this competition
    comp = admin.table("competitions").select("id").eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).eq("assigned_teacher_id", str(token.user_id)).maybe_single().execute()
    if not comp.data:
        return error("FORBIDDEN", "Not assigned to this competition", 403)

    update_data = body.dict(exclude_unset=True)
    # Only allow content and settings updates from teacher
    allowed = {}
    if "content" in update_data: allowed["content"] = update_data["content"]
    if "settings" in update_data: allowed["settings"] = update_data["settings"]

    if not allowed:
        return error("BAD_REQUEST", "Nothing to update", 400)

    res = admin.table("competitions").update(allowed).eq("id", str(competition_id)).execute()
    return success(res.data[0] if res.data else {"message": "Content saved"})


@router.patch("/teacher/competitions/{competition_id}/toggle-exam", dependencies=[Depends(RequireRole(["teacher"]))])
async def toggle_competition_exam(competition_id: UUID, body: dict, token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()

    # Verify teacher is assigned to this competition
    comp = admin.table("competitions").select("id").eq("id", str(competition_id)).eq("tenant_id", str(token.tenant_id)).eq("assigned_teacher_id", str(token.user_id)).maybe_single().execute()
    if not comp.data:
        return error("FORBIDDEN", "Not assigned to this competition", 403)

    is_active = body.get("is_exam_active", False)
    update_data = {"is_exam_active": is_active}
    if is_active:
        update_data["status"] = "active"
        
    res = admin.table("competitions").update(update_data).eq("id", str(competition_id)).execute()
    
    return success(res.data[0] if res.data else {"message": "Exam status updated"})


# ── Student Endpoint ───────────────────────────────────────────────

@router.get("/student/competitions", dependencies=[Depends(RequireRole(["student"]))])
async def list_student_competitions(token: TokenData = Depends(get_current_user)):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    
    # Look up both identifiers
    user_res = admin.table("users").select("phone").eq("id", str(token.user_id)).maybe_single().execute()
    phone = user_res.data["phone"] if user_res and user_res.data else None
    
    stu_res = admin.table("students").select("id, phone").eq("user_id", str(token.user_id)).maybe_single().execute()
    student_id = stu_res.data["id"] if stu_res and stu_res.data else None
    student_phone = stu_res.data["phone"] if stu_res and stu_res.data else None
    
    all_regs = []
    seen_ids = set()
    
    # Search by student_id
    if student_id:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*)").eq("student_id", student_id).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)
    
    # Also search by phone (catches registrations where student_id wasn't linked)
    if phone:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*)").eq("phone", phone).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)
    
    # Also search by student phone if different from user phone
    if student_phone and student_phone != phone:
        regs = admin.table("competition_registrations").select("*, competitions(*), competition_results(*)").eq("phone", student_phone).execute()
        for r in (regs.data or []):
            if r["id"] not in seen_ids:
                seen_ids.add(r["id"])
                all_regs.append(r)
    
    return success(all_regs)
