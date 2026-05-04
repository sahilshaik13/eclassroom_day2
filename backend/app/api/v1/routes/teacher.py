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
GET  /api/v1/teacher/submissions/pending    ← NEW: get all submitted tasks needing review
"""
from datetime import date, timedelta, datetime
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from app.schemas import study_plan as sp

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
    if token.role in ("admin", "platform_admin"):
        res = (
            client.table("classes")
            .select("*, class_enrollments(count)")
            .eq("tenant_id", token.tenant_id)
            .order("name")
            .execute()
        )
    else:
        res = (
            client.table("classes")
            .select("*, class_enrollments(count)")
            .eq("teacher_id", token.user_id)
            .order("name")
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

    q = client.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    classes_res = q.execute()
    teacher_class_ids = [c["id"] for c in (classes_res.data or [])]
    filter_ids = [class_id] if class_id and (class_id in teacher_class_ids or token.role in ("admin", "platform_admin")) else teacher_class_ids

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
                "classes": [],
                "progress": {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
            }
        
        students_map[sid]["classes"].append({
            "id": row["class_id"],
            "name": cls.get("name", "")
        })
        # Keep legacy fields for compatibility
        if "class_id" not in students_map[sid]:
            students_map[sid]["class_id"] = row["class_id"]
            students_map[sid]["class_name"] = cls.get("name", "")

    # 3. If a specific class is selected, attach its progress metrics
    if class_id and students_map:
        # Get the study plan for this class to get its plan_id (Admin client for robustness)
        admin = get_admin_client()
        plan_res = admin.table("study_plans").select("id").eq("class_id", class_id).maybe_single().execute()
        if plan_res and plan_res.data:
            plan_id = plan_res.data["id"]
            # Fetch all tasks in the plan first (Using full table names for relationships)
            tasks_res = admin.table("study_plan_tasks").select("id, study_plan_periods!inner(study_plan_days!inner(plan_id))").eq("study_plan_periods.study_plan_days.plan_id", plan_id).execute()
            plan_task_ids = [t["id"] for t in (tasks_res.data or [])]
            total_tasks_in_plan = len(plan_task_ids)
            
            if plan_task_ids:
                subs_res = (
                    admin.table("study_plan_submissions")
                    .select("student_id, status, score")
                    .in_("task_id", plan_task_ids)
                    .in_("student_id", list(students_map.keys()))
                    .execute()
                )
                
                # Aggregate for each student
                for sid in students_map:
                    s_subs = [s for s in (subs_res.data or []) if s["student_id"] == sid]
                    completed = len([s for s in s_subs if s["status"] in ("submitted", "reviewed")])
                    reviewed_subs = [s for s in s_subs if s["status"] == "reviewed"]
                    reviewed_count = len(reviewed_subs)
                    
                    scores = [s["score"] for s in reviewed_subs if s.get("score") is not None]
                    avg_score = round(sum(scores) / len(scores)) if scores else 0
                    
                    students_map[sid]["progress"] = {
                        "total": total_tasks_in_plan,
                        "completed": completed,
                        "reviewed": reviewed_count,
                        "pct": round((completed / total_tasks_in_plan) * 100) if total_tasks_in_plan > 0 else 0,
                        "average_score": avg_score
                    }


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
    q = client.table("classes").select("id, name, tenant_id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()

    if not class_res.data:
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


# ── Study Plan Management ─────────────────────────────────────

@router.get("/classrooms/{class_id}/study-plan")
async def get_classroom_study_plan(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    
    # Verify class belongs to teacher (or admin)
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # Fetch active plan for this classroom
    plan_res = admin.table("study_plans").select("*").eq("class_id", class_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not plan_res.data:
        return success(None)

    plan = plan_res.data
    
    # 2. Fetch days with nested periods and tasks
    try:
        plan_id = plan["id"]
        template_id = plan.get("template_id")

        q = admin.table("study_plan_days").select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))")
        
        filter_clause = f"plan_id.eq.{plan_id}"
        if template_id:
            filter_clause += f",template_id.eq.{template_id}"
            
        days_res = (
            q.or_(filter_clause)
            .order("day_number")
            .execute()
        )
        days = days_res.data or []
        # Sort periods and tasks manually
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


async def touch_plan(plan_id: str):
    """Sets updated_at = now() for a study plan to mark it as dirty."""
    from datetime import datetime
    admin = get_admin_client()
    now = datetime.utcnow().isoformat()
    admin.table("study_plans").update({"updated_at": now}).eq("id", plan_id).execute()

async def touch_plan_by_day(day_id: str):
    admin = get_admin_client()
    res = admin.table("study_plan_days").select("plan_id").eq("id", day_id).maybe_single().execute()
    if res.data: await touch_plan(res.data["plan_id"])

async def touch_plan_by_period(period_id: str):
    admin = get_admin_client()
    res = admin.table("study_plan_periods").select("day_id").eq("id", period_id).maybe_single().execute()
    if res.data: await touch_plan_by_day(res.data["day_id"])

async def touch_plan_by_task(task_id: str):
    admin = get_admin_client()
    res = admin.table("study_plan_tasks").select("period_id").eq("id", task_id).maybe_single().execute()
    if res.data: await touch_plan_by_period(res.data["period_id"])


@router.post("/classrooms/{class_id}/publish")
async def publish_study_plan(
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Sets the classroom study plan to 'active' status, 
    making it visible to students.
    """
    admin = get_admin_client()
    
    # Verify ownership/assignment (or admin)
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
        
    class_res = q.eq("id", class_id).maybe_single().execute()
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # Update status AND record publication time
    from datetime import datetime
    now = datetime.utcnow().isoformat()
    
    res = admin.table("study_plans").update({
        "status": "active",
        "published_at": now,
        "updated_at": now # Reset updated_at to match published_at on success
    }).eq("class_id", class_id).execute()
    
    if not res.data:
        return error("NOT_FOUND", "No study plan found for this classroom", 404)
        
    return success({"status": "active", "message": "Study plan published to students"})




@router.get("/study-plans/{plan_id}/submissions")
async def get_plan_submissions(
    plan_id: str,
    task_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    query = admin.table("study_plan_submissions").select("*, student:students(name, phone), task:study_plan_tasks(title, task_type)")
    
    if task_id:
        query = query.eq("task_id", task_id)
    else:
        # Filter by tasks belonging to this plan
        # This requires a join or a subquery which PostgREST doesn't do easily for filtering across tables
        # So we'll fetch task_ids first
        tasks = admin.table("study_plan_tasks").select("id").eq("period_id.day_id.plan_id", plan_id).execute()
        task_ids = [t["id"] for t in (tasks.data or [])]
        if not task_ids: return success([])
        query = query.in_("task_id", task_ids)

    res = query.order("created_at", desc=True).execute()
    return success(res.data or [])

async def get_student_overall_progress(admin, student_id, plan_id, template_id=None):
    """Calculates completion % and average score across the whole plan using pre-calculated metrics."""
    res = (
        admin.table("student_progress_metrics")
        .select("total_tasks, completed_tasks, reviewed_tasks, average_score")
        .eq("student_id", student_id)
        .eq("plan_id", plan_id)
        .execute()
    )
    metrics = res.data or []
    if not metrics:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}

    total = sum([m["total_tasks"] for m in metrics])
    completed = sum([m["completed_tasks"] for m in metrics])
    reviewed = sum([m["reviewed_tasks"] for m in metrics])
    
    # Weighted average for score
    total_score = sum([m["average_score"] * m["reviewed_tasks"] for m in metrics])
    
    return {
        "total": total,
        "completed": completed,
        "reviewed": reviewed,
        "pct": round((completed / total) * 100) if total > 0 else 0,
        "average_score": round(total_score / reviewed) if reviewed > 0 else 0
    }


async def get_student_day_progress(admin, student_id, day_id):
    """Calculates completion % and average score for a student for a specific day using metrics table."""
    # First get plan_id and day_number
    day_res = admin.table("study_plan_days").select("plan_id, day_number").eq("id", day_id).maybe_single().execute()
    if not day_res.data:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
    
    plan_id = day_res.data["plan_id"]
    day_number = day_res.data["day_number"]

    res = (
        admin.table("student_progress_metrics")
        .select("total_tasks, completed_tasks, reviewed_tasks, average_score")
        .eq("student_id", student_id)
        .eq("plan_id", plan_id)
        .eq("day_number", day_number)
        .maybe_single()
        .execute()
    )
    m = res.data
    if not m:
        return {"total": 0, "completed": 0, "reviewed": 0, "pct": 0, "average_score": 0}
    
    return {
        "total": m["total_tasks"],
        "completed": m["completed_tasks"],
        "reviewed": m["reviewed_tasks"],
        "pct": round((m["completed_tasks"] / m["total_tasks"]) * 100) if m["total_tasks"] > 0 else 0,
        "average_score": m["average_score"]
    }


@router.get("/submissions/{submission_id}")
async def get_single_submission(
    submission_id: str,
    token: TokenData = Depends(require_teacher)
):
    """Returns full details for a single submission."""
    admin = get_admin_client()
    res = (
        admin.table("study_plan_submissions")
        .select("*, student:students(id, name, phone), task:study_plan_tasks(id, title, task_type, period:study_plan_periods(id, day:study_plan_days(id, plan_id, template_id)))")
        .eq("id", submission_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        return error("NOT_FOUND", "Submission not found", 404)
    
    submission = res.data
    
    # Calculate day progress
    task = submission.get("task") or {}
    period = task.get("period") or {}
    day = period.get("day") or {}
    day_id = day.get("id")
    
    day_progress = {"total": 0, "completed": 0, "reviewed": 0, "pct": 0}
    if day_id:
        day_progress = await get_student_day_progress(admin, submission["student_id"], day_id)
    
    submission["day_progress"] = day_progress
    return success(submission)


@router.get("/students/{student_id}/study-plan/period/{period_id}/submissions")
async def get_period_submissions(
    student_id: str,
    period_id: str,
    token: TokenData = Depends(require_teacher)
):
    """Returns all submissions by a student for all tasks in a specific period."""
    admin = get_admin_client()
    
    # 1. Get period and tasks
    period_res = admin.table("study_plan_periods").select("title").eq("id", period_id).maybe_single().execute()
    period_title = period_res.data["title"] if period_res.data else "Period"

    tasks_res = admin.table("study_plan_tasks").select("id, title, task_type").eq("period_id", period_id).execute()
    tasks = tasks_res.data or []
    if not tasks:
        return success([])
    
    task_ids = [t["id"] for t in tasks]
    
    # 2. Get submissions for these tasks
    subs_res = (
        admin.table("study_plan_submissions")
        .select("*, student:students(id, name, phone), task:study_plan_tasks(id, title, task_type)")
        .eq("student_id", student_id)
        .in_("task_id", task_ids)
        .execute()
    )
    
    submissions = subs_res.data or []
    
    day_progress = {"total": 0, "completed": 0, "reviewed": 0, "pct": 0}
    if submissions:
        # Get day_id from the first task's period
        first_task_id = task_ids[0]
        task_info = admin.table("study_plan_tasks").select("period:study_plan_periods(day_id)").eq("id", first_task_id).maybe_single().execute()
        if task_info.data:
            p = task_info.data.get("period") or {}
            day_id = p.get("day_id")
            if day_id:
                day_progress = await get_student_day_progress(admin, student_id, day_id)

    for sub in submissions:
        sub["period_title"] = period_title
        sub["day_progress"] = day_progress
        
    return success(submissions)


@router.get("/submissions/pending")
async def get_pending_submissions(
    request: Request,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns all submissions from students in teacher's classes 
    that have status 'submitted' (Under Review).
    """
    client = get_user_client(request.state.jwt_token)
    
    # 1. Get teacher's classes
    classes_res = (
        client.table("classes").select("id")
        .eq("teacher_id", token.user_id).execute()
    )
    class_ids = [c["id"] for c in (classes_res.data or [])]
    if not class_ids:
        return success([])

    # 2. Get students in those classes
    enrollments_res = (
        client.table("class_enrollments")
        .select("student_id")
        .in_("class_id", class_ids)
        .execute()
    )
    student_ids = list({r["student_id"] for r in (enrollments_res.data or [])})
    if not student_ids:
        return success([])

    # 3. Fetch submissions with status 'submitted'
    res = (
        client.table("study_plan_submissions")
        .select("*, student:students(name, phone), task:study_plan_tasks(title, task_type)")
        .in_("student_id", student_ids)
        .eq("status", "submitted")
        .order("created_at", desc=True)
        .execute()
    )
    
    # Flatten for frontend
    flat_data = []
    for sub in (res.data or []):
        flat_data.append({
            "id": sub["id"],
            "student_id": sub["student_id"],
            "student_name": sub.get("student", {}).get("name") if sub.get("student") else "Unknown",
            "task_id": sub["task_id"],
            "task_title": sub.get("task", {}).get("title") if sub.get("task") else "Unknown Task",
            "task_type": sub.get("task", {}).get("task_type") if sub.get("task") else "unknown",
            "status": sub["status"],
            "score": sub.get("score"),
            "feedback": sub.get("feedback"),
            "submitted_at": sub.get("created_at"),
            "audio_url": sub.get("audio_url"),
            "content": sub.get("content")
        })
        
    return success(flat_data)


@router.patch("/submissions/{submission_id}/review")
async def review_submission(
    submission_id: str,
    body: sp.SubmissionReview,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    
    update_data = {
        "status": body.status.value,
        "feedback": body.feedback,
        "score": body.score,
        "reviewed_by": str(token.user_id),
        "reviewed_at": datetime.utcnow().isoformat()
    }
    
    # If there's a response override (for MCQs), update the content
    if body.responses_override is not None:
        sub_res = admin.table("study_plan_submissions").select("content").eq("id", submission_id).maybe_single().execute()
        if sub_res.data:
            content = sub_res.data["content"] or {}
            content["responses"] = body.responses_override
            update_data["content"] = content

    res = admin.table("study_plan_submissions").update(update_data).eq("id", submission_id).execute()
    return success(res.data[0] if res.data else {})


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


class TeacherDayCreate(sp.TeacherDayCreate): pass
class TeacherDayUpdate(sp.TeacherDayUpdate): pass
class TeacherPeriodCreate(sp.TeacherPeriodCreate): pass
class TeacherPeriodUpdate(sp.TeacherPeriodUpdate): pass
class TeacherTaskCreate(sp.TeacherTaskCreate): pass
class TeacherTaskUpdate(sp.TeacherTaskUpdate): pass


# ── Teacher Plan Editing ──────────────────────────────────────

@router.post("/study-plans/days")
async def create_classroom_day(
    body: TeacherDayCreate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    
    # Touch parent plan to mark as dirty
    admin.table("study_plans").update({"updated_at": "now()"}).eq("id", body.plan_id).execute()

    # 1. Fetch the plan to see if it's template-linked
    plan_res = admin.table("study_plans").select("template_id").eq("id", body.plan_id).maybe_single().execute()
    plan_data = plan_res.data if plan_res.data else {}
    
    # 2. Determine target (template vs instance)
    # If linked to a template, we add the day to the template to keep them in sync
    target_field = "template_id" if plan_data.get("template_id") else "plan_id"
    target_id = plan_data.get("template_id") if plan_data.get("template_id") else str(body.plan_id)

    res = admin.table("study_plan_days").insert({
        target_field: target_id,
        "day_number": body.day_number,
        "scheduled_date": body.scheduled_date.isoformat() if body.scheduled_date else None
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/days/{day_id}")
async def update_classroom_day(
    day_id: str,
    body: TeacherDayUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    update_data = {}
    if body.day_number is not None: update_data["day_number"] = body.day_number
    
    # Handle date conversion carefully to avoid 422
    if "scheduled_date" in body.dict(exclude_unset=True):
        update_data["scheduled_date"] = body.scheduled_date.isoformat() if body.scheduled_date else None
    
    if body.is_accessible is not None:
        update_data["is_accessible"] = body.is_accessible
    
    await touch_plan_by_day(day_id)
    res = admin.table("study_plan_days").update(update_data).eq("id", day_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/study-plans/days/{day_id}")
async def delete_classroom_day(
    day_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_day(day_id)
    admin = get_admin_client()
    admin.table("study_plan_days").delete().eq("id", day_id).execute()
    return success({"deleted": True})

@router.post("/study-plans/periods")
async def create_classroom_period(
    body: TeacherPeriodCreate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    # Touch parent plan
    day_res = admin.table("study_plan_days").select("plan_id").eq("id", body.day_id).maybe_single().execute()
    if day_res.data:
        admin.table("study_plans").update({"updated_at": "now()"}).eq("id", day_res.data["plan_id"]).execute()

    admin = get_admin_client()
    res = admin.table("study_plan_periods").insert({
        "day_id": str(body.day_id),
        "title": body.title,
        "duration_minutes": body.duration_minutes,
        "order_index": body.order_index
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/periods/{period_id}")
async def update_classroom_period(
    period_id: str,
    body: TeacherPeriodUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    await touch_plan_by_period(period_id)
    res = admin.table("study_plan_periods").update(update_data).eq("id", period_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/study-plans/periods/{period_id}")
async def delete_classroom_period(
    period_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_period(period_id)
    admin = get_admin_client()
    admin.table("study_plan_periods").delete().eq("id", period_id).execute()
    return success({"deleted": True})

@router.post("/study-plans/tasks")
async def create_classroom_task(
    body: TeacherTaskCreate,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_period(str(body.period_id))
    admin = get_admin_client()
    res = admin.table("study_plan_tasks").insert({
        "period_id": str(body.period_id),
        "tenant_id": str(token.tenant_id),
        "title": body.title,
        "description": body.description,
        "task_type": body.task_type.value,
        "required": body.required,
        "order_index": body.order_index,
        "config": body.config
    }).execute()
    return success(res.data[0] if res.data else {}, status_code=201)

@router.patch("/study-plans/tasks/{task_id}")
async def update_classroom_task(
    task_id: str,
    body: TeacherTaskUpdate,
    token: TokenData = Depends(require_teacher)
):
    admin = get_admin_client()
    update_data = {k: v for k, v in body.dict().items() if v is not None}
    if "task_type" in update_data and update_data["task_type"]:
        update_data["task_type"] = update_data["task_type"].value
    
    await touch_plan_by_task(task_id)
    res = admin.table("study_plan_tasks").update(update_data).eq("id", task_id).execute()
    return success(res.data[0] if res.data else {})

@router.delete("/study-plans/tasks/{task_id}")
async def delete_classroom_task(
    task_id: str,
    token: TokenData = Depends(require_teacher)
):
    await touch_plan_by_task(task_id)
    admin = get_admin_client()
    admin.table("study_plan_tasks").delete().eq("id", task_id).execute()
    return success({"deleted": True})


@router.get("/students/{student_id}/study-plan/{class_id}/progress")
async def get_student_study_plan_progress(
    student_id: str,
    class_id: str,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns the full study plan structure for a student in a class,
    including their submission status and scores for every task.
    """
    admin = get_admin_client()
    
    # 1. Verify class belongs to teacher/tenant
    q = admin.table("classes").select("id")
    if token.role not in ("admin", "platform_admin"):
        q = q.eq("teacher_id", token.user_id)
    else:
        q = q.eq("tenant_id", token.tenant_id)
    
    class_res = q.eq("id", class_id).maybe_single().execute()
    if not class_res.data:
        return error("FORBIDDEN", "Class not found or access denied", 403)

    # 2. Get the active plan for this classroom
    plan_res = admin.table("study_plans").select("*").eq("class_id", class_id).maybe_single().execute()
    if not plan_res.data:
        return error("NOT_FOUND", "No study plan assigned to this classroom", 404)
    
    plan = plan_res.data
    plan_id = plan["id"]
    template_id = plan.get("template_id")

    # 3. Fetch days, periods, tasks
    # We fetch days that belong to EITHER the specific plan OR the template it's linked to.
    # This ensures sync even if some days were added to the template and some to the plan.
    q = admin.table("study_plan_days").select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))")
    
    if template_id:
        days_res = q.or_(f"plan_id.eq.{plan_id},template_id.eq.{template_id}").order("day_number").execute()
    else:
        days_res = q.eq("plan_id", plan_id).order("day_number").execute()
    days = days_res.data or []

    # 4. Fetch all submissions by this student for these tasks
    # We'll get task_ids first to filter submissions
    task_ids = []
    for d in days:
        for p in d.get("periods", []):
            for t in p.get("tasks", []):
                task_ids.append(t["id"])
    
    submissions = []
    if task_ids:
        subs_res = (
            admin.table("study_plan_submissions")
            .select("*")
            .eq("student_id", student_id)
            .in_("task_id", task_ids)
            .execute()
        )
        submissions = subs_res.data or []

    # 5. Map submissions to tasks
    subs_map = {s["task_id"]: s for s in submissions}
    
    for d in days:
        day_tasks_count = 0
        day_completed_count = 0
        day_reviewed_count = 0
        day_total_score = 0
        
        for p in d.get("periods", []):
            period_tasks_count = 0
            period_completed_count = 0
            period_reviewed_count = 0
            period_total_score = 0
            
            p["tasks"].sort(key=lambda x: x.get("order_index", 0))
            for t in p["tasks"]:
                period_tasks_count += 1
                day_tasks_count += 1
                sub = subs_map.get(t["id"])
                t["submission"] = sub
                if sub:
                    period_completed_count += 1
                    day_completed_count += 1
                    if sub["status"] == "reviewed":
                        period_reviewed_count += 1
                        day_reviewed_count += 1
                        score = sub.get("score", 0)
                        period_total_score += score
                        day_total_score += score
            
            p["progress"] = {
                "total": period_tasks_count,
                "completed": period_completed_count,
                "reviewed": period_reviewed_count,
                "pct": round((period_completed_count / period_tasks_count) * 100) if period_tasks_count > 0 else 0,
                "average_score": round(period_total_score / period_reviewed_count) if period_reviewed_count > 0 else 0,
                "is_fully_corrected": period_reviewed_count == period_tasks_count and period_tasks_count > 0
            }
        
        d["periods"].sort(key=lambda x: x.get("order_index", 0))
        d["progress"] = {
            "total": day_tasks_count,
            "completed": day_completed_count,
            "reviewed": day_reviewed_count,
            "pct": round((day_completed_count / day_tasks_count) * 100) if day_tasks_count > 0 else 0,
            "average_score": round(day_total_score / day_reviewed_count) if day_reviewed_count > 0 else 0,
            "is_fully_corrected": day_reviewed_count == day_tasks_count and day_tasks_count > 0
        }

    # Calculate overall progress
    overall_progress = await get_student_overall_progress(admin, student_id, plan_id, template_id)

    return success({
        "plan": plan,
        "days": days,
        "overall_progress": overall_progress
    })


@router.get("/students/{student_id}/report")
async def get_student_report_for_teacher(
    student_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    token: TokenData = Depends(require_teacher)
):
    """
    Returns a detailed progress report for a specific student.
    Used by teachers to view and export student performance.
    """
    admin = get_admin_client()
    
    # 1. Verify student belongs to teacher's organization
    student_check = admin.table("students").select("id, name, tenant_id").eq("id", student_id).eq("tenant_id", token.tenant_id).maybe_single().execute()
    if not student_check.data:
        return error("NOT_FOUND", "Student not found in your organization", 404)
    
    # 2. Fetch submissions in date range
    query = admin.table("study_plan_submissions").select("*, task:study_plan_tasks(title, task_type)").eq("student_id", student_id).eq("status", "reviewed")
    
    if start_date:
        query = query.gte("created_at", start_date)
    if end_date:
        query = query.lte("created_at", end_date)
        
    res = query.order("created_at", desc=True).execute()
    submissions = res.data or []
    
    # 3. Calculate stats
    total_tasks = len(submissions)
    total_possible_pct = total_tasks * 100
    total_scored_pct = sum([s.get("score", 0) for s in submissions])
    
    overall_pct = round((total_scored_pct / total_possible_pct) * 100) if total_possible_pct > 0 else 0
    
    report_items = []
    for s in submissions:
        report_items.append({
            "task_title": s.get("task", {}).get("title"),
            "task_type": s.get("task", {}).get("task_type"),
            "score": s.get("score", 0),
            "feedback": s.get("feedback"),
            "date": s.get("created_at")
        })
        
    return success({
        "student_name": student_check.data["name"],
        "overall_percentage": overall_pct,
        "total_tasks": total_tasks,
        "report_items": report_items
    })
