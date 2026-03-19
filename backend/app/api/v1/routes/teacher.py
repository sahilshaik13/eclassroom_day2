"""
Teacher routes — all require role=teacher (or admin) JWT.

GET  /api/v1/teacher/pulse/today
GET  /api/v1/teacher/classes
GET  /api/v1/teacher/students
POST /api/v1/teacher/attendance
GET  /api/v1/teacher/attendance/{class_id}
GET  /api/v1/teacher/doubts
POST /api/v1/teacher/doubts/{doubt_id}/reply
POST /api/v1/teacher/grades
GET  /api/v1/teacher/reports/{student_id}
"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr
from app.core.config import settings

from app.core.deps import require_teacher, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client


router = APIRouter(prefix="/teacher", tags=["teacher"])


# ── Daily Pulse ───────────────────────────────────────────────

@router.get("/pulse/today")
async def daily_pulse(request: Request, token: TokenData = Depends(require_teacher)):
    client = get_user_client(request.state.jwt_token)
    today = date.today().isoformat()

    # Get classes for this teacher
    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]
    if not class_ids:
        return success([])

    # Get enrolled students
    enrollments_res = (
        client.table("class_enrollments")
        .select("student_id, students(id, name, user_id)")
        .in_("class_id", class_ids)
        .execute()
    )

    # Get today's completions for those students
    student_ids = list({r["student_id"] for r in (enrollments_res.data or [])})
    if not student_ids:
        return success([])

    completions_res = (
        client.table("task_completions")
        .select("student_id, completed_at")
        .in_("student_id", student_ids)
        .eq("assigned_date", today)
        .execute()
    )

    # Count pending doubts per student
    doubts_res = (
        client.table("doubts")
        .select("student_id")
        .in_("class_id", class_ids)
        .eq("status", "pending")
        .execute()
    )

    # Build aggregated pulse
    completion_by_student: dict[str, dict] = {}
    for row in (completions_res.data or []):
        sid = row["student_id"]
        if sid not in completion_by_student:
            completion_by_student[sid] = {"total": 0, "done": 0}
        completion_by_student[sid]["total"] += 1
        if row["completed_at"]:
            completion_by_student[sid]["done"] += 1

    doubts_by_student: dict[str, int] = {}
    for row in (doubts_res.data or []):
        sid = row["student_id"]
        doubts_by_student[sid] = doubts_by_student.get(sid, 0) + 1

    seen: set = set()
    pulse = []
    for row in (enrollments_res.data or []):
        sid = row["student_id"]
        if sid in seen:
            continue
        seen.add(sid)
        student = row.get("students") or {}
        comp = completion_by_student.get(sid, {"total": 0, "done": 0})
        pct = round((comp["done"] / comp["total"]) * 100) if comp["total"] else 0
        pulse.append({
            "student_id": sid,
            "name": student.get("name", ""),
            "completion_pct": pct,
            "pending_doubts": doubts_by_student.get(sid, 0),
        })

    return success(sorted(pulse, key=lambda x: x["completion_pct"]))


# ── Classes ───────────────────────────────────────────────────

@router.get("/classes")
async def get_my_classes(request: Request, token: TokenData = Depends(require_teacher)):
    client = get_user_client(request.state.jwt_token)
    res = (
        client.table("classes")
        .select("*, class_enrollments(count)")
        .eq("teacher_id", token.user_id)
        .execute()
    )
    return success(res.data or [])


# ── Students ──────────────────────────────────────────────────

@router.get("/students")
async def get_students(
    request: Request,
    search: Optional[str] = None,
    class_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    # Get teacher's class IDs
    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    teacher_class_ids = [c["id"] for c in (classes_res.data or [])]
    filter_ids = [class_id] if class_id and class_id in teacher_class_ids else teacher_class_ids

    enr_res = (
        client.table("class_enrollments")
        .select("students(id, name, phone, deactivated_at), class_id")
        .in_("class_id", filter_ids)
        .execute()
    )

    seen: set = set()
    students = []
    for row in (enr_res.data or []):
        s = row.get("students") or {}
        if not s or s["id"] in seen:
            continue
        if search and search.lower() not in s.get("name", "").lower():
            continue
        seen.add(s["id"])
        students.append({**s, "class_id": row["class_id"]})

    return success(students)


class StudentCreate(BaseModel):
    name: str
    phone: str
    class_id: Optional[str] = None

@router.post("/students")
async def create_student(
    body: StudentCreate,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    from app.db.supabase import get_admin_client
    import httpx
    admin = get_admin_client()

    # 1. If class_id is provided, verify it belongs to this teacher
    if body.class_id:
        class_check = admin.table("classes").select("id").eq("id", body.class_id).eq("teacher_id", token.user_id).maybe_single().execute()
        if not class_check.data:
            return error("UNAUTHORIZED", "You can only assign students to your own classes", 403)

    # 2. Create auth user (phone-based)
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

    # 3. Synchronize to public schema
    admin.table("users").upsert({
        "id": user_id,
        "tenant_id": token.tenant_id,
        "role": "student",
        "phone": body.phone,
        "name": body.name,
        "is_active": True,
    }).execute()

    stu_res = admin.table("students").upsert({
        "user_id": user_id,
        "tenant_id": token.tenant_id,
        "name": body.name,
        "phone": body.phone,
    }).execute()

    student = stu_res.data[0] if stu_res.data else {}

    # 4. Enroll in class
    if body.class_id and student.get("id"):
        admin.table("class_enrollments").upsert({
            "student_id": student["id"],
            "class_id": body.class_id,
            "tenant_id": token.tenant_id,
        }).execute()

    return success(student, status_code=201)


# ── Attendance ────────────────────────────────────────────────

class AttendanceRecord(BaseModel):
    student_id: str
    status: str  # present | absent | late


class AttendancePayload(BaseModel):
    class_id: str
    session_date: str   # YYYY-MM-DD
    records: list[AttendanceRecord]


@router.post("/attendance")
async def mark_attendance(
    body: AttendancePayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    # Upsert each record
    rows = [
        {
            "class_id": body.class_id,
            "student_id": r.student_id,
            "tenant_id": token.tenant_id,
            "session_date": body.session_date,
            "status": r.status,
            "marked_by": token.user_id,
        }
        for r in body.records
    ]

    res = (
        client.table("attendance")
        .upsert(rows, on_conflict="student_id,class_id,session_date")
        .execute()
    )

    return success({"saved": len(res.data or [])})


@router.get("/attendance/{class_id}")
async def get_attendance_calendar(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)
    since = (date.today() - timedelta(days=30)).isoformat()

    res = (
        client.table("attendance")
        .select("student_id, session_date, status, students(name)")
        .eq("class_id", class_id)
        .gte("session_date", since)
        .order("session_date", desc=True)
        .execute()
    )

    return success(res.data or [])


# ── Doubts ────────────────────────────────────────────────────

@router.get("/doubts")
async def get_class_doubts(
    request: Request,
    status: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]
    if not class_ids:
        return success([])

    q = (
        client.table("doubts")
        .select("*, students(name), doubt_responses(id, body, created_at)")
        .in_("class_id", class_ids)
        .order("created_at", desc=True)
    )
    if status:
        q = q.eq("status", status)

    res = q.execute()
    return success(res.data or [])


class ReplyBody(BaseModel):
    body: str


@router.post("/doubts/{doubt_id}/reply")
async def reply_to_doubt(
    doubt_id: str,
    body: ReplyBody,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    # Insert response
    resp_res = (
        client.table("doubt_responses")
        .insert({
            "doubt_id": doubt_id,
            "teacher_id": token.user_id,
            "tenant_id": token.tenant_id,
            "body": body.body,
        })
        .execute()
    )

    # Mark doubt resolved
    client.table("doubts").update({"status": "resolved"}).eq("id", doubt_id).execute()

    return success(resp_res.data[0] if resp_res.data else {}, status_code=201)


# ── Grades ────────────────────────────────────────────────────

class GradeEntry(BaseModel):
    student_id: str
    score: int
    remarks: Optional[str] = None


class GradesPayload(BaseModel):
    class_id: str
    month: str          # YYYY-MM
    grades: list[GradeEntry]


@router.post("/grades")
async def save_grades(
    body: GradesPayload,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    rows = [
        {
            "student_id": g.student_id,
            "class_id": body.class_id,
            "teacher_id": token.user_id,
            "tenant_id": token.tenant_id,
            "month": body.month,
            "score": g.score,
            "remarks": g.remarks,
        }
        for g in body.grades
    ]

    res = (
        client.table("grades")
        .upsert(rows, on_conflict="student_id,class_id,month")
        .execute()
    )

    return success({"saved": len(res.data or [])})


# ── Report card data ──────────────────────────────────────────

@router.get("/reports/{student_id}")
async def get_report_data(
    student_id: str,
    request: Request,
    month: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)
    if not month:
        month = date.today().strftime("%Y-%m")

    # Student info
    student_res = (
        client.table("students").select("id, name")
        .eq("id", student_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)

    # Class info
    enr_res = (
        client.table("class_enrollments")
        .select("classes(id, name)")
        .eq("student_id", student_id)
        .limit(1).execute()
    )
    class_info = {}
    if enr_res.data:
        class_info = enr_res.data[0].get("classes") or {}

    # Attendance %
    att_res = (
        client.table("attendance")
        .select("status")
        .eq("student_id", student_id)
        .gte("session_date", f"{month}-01")
        .lte("session_date", f"{month}-31")
        .execute()
    )
    att_rows = att_res.data or []
    att_pct = (
        round(len([r for r in att_rows if r["status"] == "present"]) / len(att_rows) * 100)
        if att_rows else 0
    )

    # Task completion %
    comp_res = (
        client.table("task_completions")
        .select("completed_at")
        .eq("student_id", student_id)
        .gte("assigned_date", f"{month}-01")
        .lte("assigned_date", f"{month}-31")
        .execute()
    )
    comp_rows = comp_res.data or []
    comp_pct = (
        round(len([r for r in comp_rows if r["completed_at"]]) / len(comp_rows) * 100)
        if comp_rows else 0
    )

    # Grade
    grade_res = (
        client.table("grades")
        .select("score, remarks")
        .eq("student_id", student_id)
        .eq("month", month)
        .maybe_single()
        .execute()
    )

    # Teacher info
    teacher_res = (
        client.table("users").select("name")
        .eq("id", token.user_id).single().execute()
    )

    return success({
        "student": student_res.data,
        "class": class_info,
        "month": month,
        "attendance_pct": att_pct,
        "task_completion_pct": comp_pct,
        "grade": grade_res.data,
        "teacher": teacher_res.data or {},
    })


# ── Profile update ────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    name: str

@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    admin.table("users").update({"name": body.name}).eq("id", token.user_id).execute()
    # We don't have a separate teachers table like students, so we just update users.
    # Actually, let me check if there IS a teachers table.
    return success({"name": body.name})


class ProfileComplete(BaseModel):
    first_name: str
    last_name: str
    islamic_name: Optional[str] = None
    gender: str
    dob: str
    nationality: str
    emirates_id: Optional[str] = None
    whatsapp_number: str
    city: str
    needs_transport: bool = False
    address: Optional[str] = None

@router.post("/complete-profile")
async def complete_teacher_profile(
    body: ProfileComplete,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    from app.db.supabase import get_admin_client
    admin = get_admin_client()
    update_data = body.dict()
    update_data["is_registered"] = True
    full_name = f"{body.first_name} {body.last_name}".strip()
    update_data["name"] = full_name
    
    # Update users table (strict tenant isolation)
    admin.table("users").update(update_data).eq("id", token.user_id).eq("tenant_id", token.tenant_id).execute()
    
    return success({"message": "Profile completed successfully"})
