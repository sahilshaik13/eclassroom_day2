"""
Teacher routes — all require role=teacher (or admin) JWT.

GET  /api/v1/teacher/pulse/today
GET  /api/v1/teacher/classes
GET  /api/v1/teacher/students
POST /api/v1/teacher/students/search      ← NEW: search students by name/phone
POST /api/v1/teacher/students/enroll      ← NEW: enroll a student into teacher's class
GET  /api/v1/teacher/applicants           ← NEW: pending teacher applicants (from users table)
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
from pydantic import BaseModel

from app.core.deps import require_teacher, TokenData
from app.core.response import success, error
from app.db.supabase import get_user_client, get_admin_client


router = APIRouter(prefix="/teacher", tags=["teacher"])


# ── Daily Pulse ───────────────────────────────────────────────

@router.get("/pulse/today")
async def daily_pulse(request: Request, token: TokenData = Depends(require_teacher)):
    client = get_user_client(request.state.jwt_token)
    today = date.today().isoformat()

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]
    if not class_ids:
        return success([])

    enrollments_res = (
        client.table("class_enrollments")
        .select("student_id, students(id, name, user_id)")
        .in_("class_id", class_ids)
        .execute()
    )

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

    doubts_res = (
        client.table("doubts")
        .select("student_id")
        .in_("class_id", class_ids)
        .eq("status", "pending")
        .execute()
    )

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


# ── Stats summary for teacher dashboard ──────────────────────

@router.get("/stats")
async def teacher_stats(request: Request, token: TokenData = Depends(require_teacher)):
    """Returns real counts for teacher dashboard cards."""
    client = get_user_client(request.state.jwt_token)

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]

    total_students = 0
    if class_ids:
        enr_res = (
            client.table("class_enrollments")
            .select("student_id")
            .in_("class_id", class_ids)
            .execute()
        )
        # Unique student count
        total_students = len({r["student_id"] for r in (enr_res.data or [])})

    # Today's classes
    today = date.today().isoweekday()  # 1=Mon, 7=Sun
    total_classes = len(class_ids)

    # Pending doubts
    pending_doubts = 0
    if class_ids:
        d_res = (
            client.table("doubts")
            .select("id", count="exact")
            .in_("class_id", class_ids)
            .eq("status", "pending")
            .execute()
        )
        pending_doubts = d_res.count or 0

    # Attendance % last 30 days
    since = (date.today() - timedelta(days=30)).isoformat()
    avg_attendance = 0
    if class_ids:
        att_res = (
            client.table("attendance")
            .select("status")
            .in_("class_id", class_ids)
            .gte("session_date", since)
            .execute()
        )
        att_rows = att_res.data or []
        avg_attendance = (
            round(len([r for r in att_rows if r["status"] == "present"]) / len(att_rows) * 100)
            if att_rows else 0
        )

    return success({
        "total_students": total_students,
        "total_classes": total_classes,
        "pending_doubts": pending_doubts,
        "avg_attendance": avg_attendance,
    })


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

# ── Student search (all tenant students, not just enrolled) ──
# Add this route to teacher.py BEFORE the existing /students route

class SearchQuery(BaseModel):
    query: str


@router.post("/students/search")
async def search_all_students(
    body: SearchQuery,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Search ALL students in the teacher's tenant (not just enrolled).
    Used by the 'Add Student to Class' dialog.
    Returns name, phone, id, and list of enrolled classes.
    """
    q = body.query
    if not q or len(q.strip()) < 2:
        return success([])

    # Use admin client to search across all tenant students
    admin = get_admin_client()
    search_term = q.strip()

    # Search by name OR phone (ilike for case-insensitive)
    # We join with classes via class_enrollments
    res = (
        admin.table("students")
        .select("id, name, phone, deactivated_at, class_enrollments(classes(id, name))")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .or_(f"name.ilike.%{search_term}%,phone.ilike.%{search_term}%")
        .limit(20)
        .execute()
    )

    results = []
    for row in (res.data or []):
        enrolled = []
        for enr in (row.get("class_enrollments") or []):
            cls = enr.get("classes")
            if cls:
                enrolled.append({
                    "class_id": cls["id"],
                    "class_name": cls["name"]
                })

        results.append({
            "id": row["id"],
            "name": row["name"],
            "phone": row.get("phone", ""),
            "enrolled_classes": enrolled,
        })

    return success(results)


@router.get("/students")
async def get_students(
    request: Request,
    search: Optional[str] = None,
    class_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher),
):
    client = get_user_client(request.state.jwt_token)

    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    teacher_class_ids = [c["id"] for c in (classes_res.data or [])]
    filter_ids = [class_id] if class_id and class_id in teacher_class_ids else teacher_class_ids

    enr_res = (
        client.table("class_enrollments")
        .select("students(id, name, phone, deactivated_at), class_id, classes(name)")
        .in_("class_id", filter_ids)
        .execute()
    )

    # Group by student to support multiple classes
    students_map: dict[str, dict] = {}
    for row in (enr_res.data or []):
        s = row.get("students") or {}
        if not s:
            continue
        
        sid = s["id"]
        if search and search.lower() not in s.get("name", "").lower():
            continue
            
        cls = row.get("classes") or {}
        if sid not in students_map:
            students_map[sid] = {
                **s,
                "classes": []
            }
        
        students_map[sid]["classes"].append({
            "id": row["class_id"],
            "name": cls.get("name", "")
        })
        # Keep legacy fields for compatibility if needed, using the first class
        if "class_id" not in students_map[sid]:
            students_map[sid]["class_id"] = row["class_id"]
            students_map[sid]["class_name"] = cls.get("name", "")

    return success(list(students_map.values()))


@router.get("/study-plan")
async def get_study_plan(
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Returns the study plan (sequence of tasks) for a specific class.
    Since tasks are applied to students in 'task_completions', we find
    the set of unique tasks assigned to this class.
    """
    client = get_user_client(request.state.jwt_token)

    # 1. Verify access (Teacher must own the class or be admin)
    class_res = (
        client.table("classes")
        .select("id, name")
        .eq("id", class_id)
        .eq("teacher_id", token.user_id)
        .maybe_single()
        .execute()
    )
    if not class_res.data and token.role != "admin":
        return error("UNAUTHORIZED", "Class not found or access denied", 403)

    # 2. Get students in this class
    enr_res = (
        client.table("class_enrollments")
        .select("student_id")
        .eq("class_id", class_id)
        .execute()
    )
    student_ids = [r["student_id"] for r in (enr_res.data or [])]
    if not student_ids:
        return success([]) # No students yet, so no tasks assigned via 'apply'

    # 3. Get unique tasks from task_completions for these students
    # We join with study_plan_tasks to get the details
    res = (
        client.table("task_completions")
        .select("study_plan_tasks(id, title, description, task_type, day_number, order_index)")
        .in_("student_id", student_ids)
        .execute()
    )

    # De-duplicate tasks (since multiple students have the same tasks)
    tasks_map = {}
    for row in (res.data or []):
        t = row.get("study_plan_tasks")
        if t and t["id"] not in tasks_map:
            tasks_map[t["id"]] = t

    # Sort by day and order
    sorted_tasks = sorted(
        tasks_map.values(),
        key=lambda x: (x.get("day_number", 0), x.get("order_index", 0))
    )

    return success(sorted_tasks)


# ── Student Search (across tenant — for adding to class) ──────

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

    # 1. Verify the class exists in the tenant
    q = admin.table("classes").select("id, name, tenant_id, teacher_id").eq("id", body.class_id)
    if token.role != "admin":
        q = q.eq("teacher_id", token.user_id)
    
    class_check = q.maybe_single().execute()
    
    if not class_check.data:
        return error("NOT_FOUND", "Class not found or you are not authorized to manage it", 403)

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




# ── Remove Student from Teacher's Class ──────────────────────

@router.delete("/students/{student_id}/enroll/{class_id}")
async def remove_student_from_class(
    student_id: str,
    class_id: str,
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """Remove a student from the teacher's class."""
    admin = get_admin_client()

    # Verify class belongs to teacher
    class_check = (
        admin.table("classes").select("id")
        .eq("id", class_id)
        .eq("teacher_id", token.user_id)
        .maybe_single()
        .execute()
    )
    if not class_check.data:
        return error("UNAUTHORIZED", "Class not found or does not belong to you", 403)

    admin.table("class_enrollments").delete().eq("student_id", student_id).eq("class_id", class_id).execute()
    return success({"removed": True})


# ── Applicants (pending teacher registrations) ────────────────

@router.get("/applicants")
async def get_applicants(
    request: Request,
    token: TokenData = Depends(require_teacher),
):
    """
    Returns students who registered but are not yet enrolled in any class
    within this teacher's tenant. These are 'new applicants' waiting to be placed.
    """
    admin = get_admin_client()

    # Students in this tenant with no class enrollment
    all_students_res = (
        admin.table("students")
        .select("id, name, phone, created_at")
        .eq("tenant_id", token.tenant_id)
        .is_("deactivated_at", None)
        .order("created_at", desc=True)
        .execute()
    )

    all_student_ids = [s["id"] for s in (all_students_res.data or [])]
    if not all_student_ids:
        return success([])

    # Get all enrolled student IDs
    enrolled_res = (
        admin.table("class_enrollments")
        .select("student_id")
        .in_("student_id", all_student_ids)
        .execute()
    )
    enrolled_ids = {r["student_id"] for r in (enrolled_res.data or [])}

    # Filter to unenrolled students
    unenrolled = [
        s for s in (all_students_res.data or [])
        if s["id"] not in enrolled_ids
    ]

    return success(unenrolled)


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

    client.table("doubts").update({"status": "resolved"}).eq("id", doubt_id).execute()

    return success(resp_res.data[0] if resp_res.data else {}, status_code=201)


# ── Grades ────────────────────────────────────────────────────

class GradeEntry(BaseModel):
    student_id: str
    score: int
    remarks: Optional[str] = None


class GradesPayload(BaseModel):
    class_id: str
    month: str
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

    student_res = (
        client.table("students").select("id, name")
        .eq("id", student_id).single().execute()
    )
    if not student_res.data:
        return error("NOT_FOUND", "Student not found", 404)

    enr_res = (
        client.table("class_enrollments")
        .select("classes(id, name)")
        .eq("student_id", student_id)
        .limit(1).execute()
    )
    class_info = {}
    if enr_res.data:
        class_info = enr_res.data[0].get("classes") or {}

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

    grade_res = (
        client.table("grades")
        .select("score, remarks")
        .eq("student_id", student_id)
        .eq("month", month)
        .maybe_single()
        .execute()
    )

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

    admin.table("users").update(update_data).eq("id", token.user_id).eq("tenant_id", token.tenant_id).execute()

    return success({"message": "Profile completed successfully"})
