from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, date
from app.core.deps import require_student, require_teacher, TokenData
from app.db.supabase import get_admin_client
from app.core.response import success, error

router = APIRouter(tags=["Progress Report"])

# Human-readable labels for task types
TASK_TYPE_LABELS = {
    "mcq": "MCQ's",
    "recite": "Recite",
    "review": "Review",
    "memorise": "Memorise",
    "read": "Read",
    "listen": "Listen",
    "written": "Written Work",
    "reflection": "Reflection",
}

ALL_TASK_TYPES = ["memorise", "review", "recite", "mcq"]


async def generate_detailed_report(
    student_id: str,
    class_id: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """
    Generates a monthly performance report for a student.
    Uses the same top-down query as StudentProgressPage:
      study_plan_days → periods → tasks → submissions
    This avoids the complex/broken bottom-up join from submissions.
    """
    admin = get_admin_client()
    now = datetime.now()
    sel_month = month or now.month
    sel_year = year or now.year

    # 1. Get student record
    student_res = admin.table("students").select("id, name, tenant_id").eq("id", student_id).limit(1).execute()
    if not student_res.data:
        return None, "Student record not found"
    student = student_res.data[0]

    # 2. Get enrolled classes
    enrollments_res = admin.table("class_enrollments").select("classes(id, name)").eq("student_id", student_id).execute()
    classes = [e["classes"] for e in (enrollments_res.data or []) if e.get("classes")]

    # 3. Determine which study plans to query (ACTIVE only)
    if class_id:
        plans_res = (
            admin.table("study_plans")
            .select("id, template_id, class_id")
            .eq("class_id", class_id)
            .eq("status", "active")
            .execute()
        )
    else:
        # All ACTIVE plans for classes this student is enrolled in
        class_ids = [c["id"] for c in classes] if classes else []
        if not class_ids:
            return _empty_report(student, classes, sel_month, sel_year), None
        plans_res = (
            admin.table("study_plans")
            .select("id, template_id, class_id")
            .in_("class_id", class_ids)
            .eq("status", "active")
            .execute()
        )

    plan_ids = [p["id"] for p in (plans_res.data or [])]
    if not plan_ids:
        return _empty_report(student, classes, sel_month, sel_year), None

    # Build OR filter: match days either by plan_id OR template_id (same as student.py)
    plan_records = plans_res.data or []
    or_parts = [f"plan_id.eq.{p['id']}" for p in plan_records]
    for p in plan_records:
        if p.get("template_id"):
            or_parts.append(f"template_id.eq.{p['template_id']}")
    # deduplicate
    or_parts = list(dict.fromkeys(or_parts))
    or_filter = ",".join(or_parts)

    # 4. TOP-DOWN fetch: days → periods → tasks → submissions
    #    This is exactly the same query that StudentProgressPage uses and it works.
    days_res = (
        admin.table("study_plan_days")
        .select("id, plan_id, template_id, day_number, scheduled_date, is_accessible, study_plan_periods(id, title, study_plan_tasks(id, title, task_type, study_plan_submissions(id, score, status, student_id)))")
        .or_(or_filter)
        .execute()
    )
    days = days_res.data or []

    # 5. Build the score grid, filtering by month/year
    # We will build separate grids per class and an overall grid
    overall_grid = {}  # { task_type: { day_of_month: [scores] } }
    class_grids = {}   # { class_id: { task_type: { day_of_month: [scores] } } }
    
    total_reviewed_count = 0
    total_score_sum = 0
    total_assigned = 0
    total_completed = 0
    total_month_tasks = 0

    today = date.today()

    for day in days:
        sched_date_str = day.get("scheduled_date")
        if not sched_date_str:
            continue

        try:
            sched_dt = date.fromisoformat(sched_date_str.split("T")[0])
        except Exception:
            continue

        if sched_dt.month != sel_month or sched_dt.year != sel_year:
            continue

        # ── Only count tasks the student can actually see ──
        # A day is "available" if the teacher has unlocked it AND the date has arrived.
        is_accessible = day.get("is_accessible", False)
        date_arrived = sched_dt <= today
        day_is_available = is_accessible and date_arrived

        cal_day = sched_dt.day

        for period in (day.get("study_plan_periods") or []):
            for task in (period.get("study_plan_tasks") or []):
                ttype = task.get("task_type", "memorise")

                total_month_tasks += 1

                # Assigned = accessible + date arrived (visible to student)
                if day_is_available:
                    total_assigned += 1

                # Find this student's submission for this task
                all_subs = task.get("study_plan_submissions") or []
                my_sub = next((s for s in all_subs if s.get("student_id") == student_id), None)

                if my_sub:
                    # Completed = any submission exists
                    total_completed += 1
                    score = my_sub.get("score")
                    status = my_sub.get("status", "")

                    # Evaluated = teacher has reviewed it (status == 'reviewed' only)
                    # MCQ auto-scores are NOT counted until teacher approves
                    if status == "reviewed":
                        val = score if score is not None else 0
                        total_reviewed_count += 1
                        total_score_sum += val
                        
                        # Add to overall grid
                        if ttype not in overall_grid:
                            overall_grid[ttype] = {}
                        if cal_day not in overall_grid[ttype]:
                            overall_grid[ttype][cal_day] = []
                        overall_grid[ttype][cal_day].append(val)
                        
                        # Add to specific class grid(s)
                        p_id = day.get("plan_id")
                        t_id = day.get("template_id")
                        
                        matched_class_ids = []
                        for p in plan_records:
                            if p_id and p["id"] == p_id:
                                matched_class_ids.append(p.get("class_id"))
                            elif t_id and p.get("template_id") == t_id:
                                matched_class_ids.append(p.get("class_id"))
                                
                        matched_class_ids = list(set(filter(None, matched_class_ids)))
                        
                        for c_id in matched_class_ids:
                            if c_id not in class_grids:
                                class_grids[c_id] = {}
                            if ttype not in class_grids[c_id]:
                                class_grids[c_id][ttype] = {}
                            if cal_day not in class_grids[c_id][ttype]:
                                class_grids[c_id][ttype][cal_day] = []
                            class_grids[c_id][ttype][cal_day].append(val)

    # 6. Build the grid rows for the frontend table
    
    def process_grid(g):
        processed = []
        for ttype in ALL_TASK_TYPES:
            days_data = {}
            type_scores = []
            if ttype in g:
                for d_num, scores in g[ttype].items():
                    avg = round(sum(scores) / len(scores))
                    days_data[d_num] = avg
                    type_scores.append(avg)
            processed.append({
                "task_type": TASK_TYPE_LABELS.get(ttype, ttype),
                "days": days_data,
                "type_average": round(sum(type_scores) / len(type_scores)) if type_scores else None,
            })
        return processed

    processed_overall_grid = process_grid(overall_grid)
    valid_overall_averages = [r["type_average"] for r in processed_overall_grid if r["type_average"] is not None]
    overall_pct = round(sum(valid_overall_averages) / len(valid_overall_averages)) if valid_overall_averages else 0

    class_reports = []
    for c in classes:
        c_id = c["id"]
        c_grid = class_grids.get(c_id, {})
        processed_c_grid = process_grid(c_grid)
        
        valid_c_averages = [r["type_average"] for r in processed_c_grid if r["type_average"] is not None]
        c_overall_pct = round(sum(valid_c_averages) / len(valid_c_averages)) if valid_c_averages else 0
        
        class_reports.append({
            "class_id": c_id,
            "class_name": c["name"],
            "grid": processed_c_grid,
            "overall_percentage": c_overall_pct
        })

    return {
        "student_name": student["name"],
        "enrolled_classes": classes,
        "selected_class_id": class_id,
        "selected_month": sel_month,
        "selected_year": sel_year,
        "overall_percentage": overall_pct,
        "total_assigned": total_assigned,
        "total_month_tasks": total_month_tasks,
        "total_completed": total_completed,
        "total_reviewed": total_reviewed_count,
        "grid": processed_overall_grid,
        "class_reports": class_reports
    }, None


def _empty_report(student, classes, sel_month, sel_year):
    return {
        "student_name": student["name"],
        "enrolled_classes": classes,
        "selected_class_id": None,
        "selected_month": sel_month,
        "selected_year": sel_year,
        "overall_percentage": 0,
        "total_assigned": 0,
        "total_month_tasks": 0,
        "total_completed": 0,
        "total_reviewed": 0,
        "grid": [{"task_type": TASK_TYPE_LABELS.get(t, t), "days": {}, "type_average": None} for t in ALL_TASK_TYPES],
        "class_reports": [],
    }


# ── Student: view own report ───────────────────────────────────

@router.get("/student/progress-report")
async def get_student_self_report(
    month: Optional[int] = None,
    year: Optional[int] = None,
    class_id: Optional[str] = None,
    token: TokenData = Depends(require_student)
):
    admin = get_admin_client()
    student_res = admin.table("students").select("id").eq("user_id", token.user_id).limit(1).execute()
    if not student_res.data:
        return error("NOT_FOUND", "Student record not found", 404)

    student_id = student_res.data[0]["id"]
    report, err = await generate_detailed_report(student_id, class_id, month, year)
    if err:
        return error("ERROR", err, 400)
    return success(report)


# ── Teacher: view any student's report ────────────────────────

@router.get("/teacher/students/{student_id}/report")
async def get_student_report_for_teacher(
    student_id: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
    class_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher)
):
    report, err = await generate_detailed_report(student_id, class_id, month, year)
    if err:
        return error("ERROR", err, 400)
    return success(report)
