from fastapi import APIRouter, Depends
from typing import Any, Optional
from datetime import datetime, date
from app.core import cache_keys, cache_ttl
from app.core.cache_service import cache_delete, get_or_set_cache
from app.core.cache_tags import set_with_tags, invalidate_by_tag
from app.core.deps import require_student, require_teacher, TokenData
from app.db.supabase import get_admin_client
from app.core.response import success, error
from app.services.study_plan_kpi_service import (
    ALL_KPI_BUCKETS,
    KPI_LABELS,
    is_day_topic_task,
    is_tracker_task,
    kpi_bucket_for_task,
    summarize_bucket_progress,
)

router = APIRouter(tags=["Progress Report"])


def _serialize_bucket_summary(summary: dict[str, dict[str, int]]) -> list[dict]:
    rows: list[dict] = []
    for bucket in ALL_KPI_BUCKETS:
        row = summary.get(bucket) or {}
        rows.append(
            {
                "bucket": bucket,
                "label": KPI_LABELS.get(bucket, bucket.title()),
                "assigned": row.get("assigned", 0),
                "submitted": row.get("submitted", 0),
                "reviewed": row.get("reviewed", 0),
                "progress_pct": row.get("progress_pct", 0),
            }
        )
    return rows


def _overall_from_bucket_summary(summary: dict[str, dict[str, int]]) -> int:
    values = [row.get("progress_pct", 0) for row in summary.values() if row.get("assigned", 0) > 0]
    return round(sum(values) / len(values)) if values else 0


def _parse_date(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).split("T")[0])
    except Exception:
        return None


def _fetch_submissions_for_tasks(
    admin: Any, student_id: str, task_ids: list[str], *, chunk_size: int = 100
) -> list[dict]:
    if not task_ids:
        return []
    from app.db.batch_in import chunked_in_fetch

    allowed = set(task_ids)
    rows = chunked_in_fetch(
        admin,
        "study_plan_submissions",
        "id, task_id, score, status, reviewed_at, created_at, updated_at, student_id",
        "task_id",
        task_ids,
        extra_eq=lambda q: q.eq("student_id", student_id),
        chunk_size=chunk_size,
        label="progress_report/submissions",
    )
    return [r for r in rows if r.get("task_id") in allowed]


def _load_plan_days(admin: Any, plan_records: list[dict]) -> list[dict]:
    or_parts = [f"plan_id.eq.{p['id']}" for p in plan_records]
    for p in plan_records:
        if p.get("template_id"):
            or_parts.append(f"template_id.eq.{p['template_id']}")
    or_parts = list(dict.fromkeys(or_parts))
    if not or_parts:
        return []
    days_res = (
        admin.table("study_plan_days")
        .select(
            "id, plan_id, template_id, day_number, scheduled_date, is_accessible, "
            "study_plan_periods(id, title, study_plan_tasks(id, title, task_type, config))"
        )
        .or_(",".join(or_parts))
        .execute()
    )
    return days_res.data or []


def _build_task_index(
    plan_records: list[dict], days: list[dict]
) -> tuple[dict[str, dict], dict[str, list[str]]]:
    """
    task_id -> {task, class_ids, scheduled_date}
    class_id -> list of task records for bucket summaries
    """
    task_index: dict[str, dict] = {}
    class_records: dict[str, list] = {}

    for day in days:
        sched_dt = _parse_date(day.get("scheduled_date"))
        matched_class_ids: list[str] = []
        p_id = day.get("plan_id")
        t_id = day.get("template_id")
        for plan_record in plan_records:
            if p_id and plan_record["id"] == p_id:
                matched_class_ids.append(plan_record.get("class_id"))
            elif t_id and plan_record.get("template_id") == t_id:
                matched_class_ids.append(plan_record.get("class_id"))
        matched_class_ids = list({c for c in matched_class_ids if c})

        for period in day.get("study_plan_periods") or []:
            for task in period.get("study_plan_tasks") or []:
                if is_tracker_task(task) or is_day_topic_task(task):
                    continue
                tid = str(task.get("id") or "")
                if not tid:
                    continue
                entry = {
                    "task": task,
                    "class_ids": matched_class_ids,
                    "scheduled_date": sched_dt,
                    "day": day,
                }
                task_index[tid] = entry
                for c_id in matched_class_ids:
                    class_records.setdefault(c_id, [])

    return task_index, class_records


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

    plan_records = plans_res.data or []
    if not plan_records:
        return _empty_report(student, classes, sel_month, sel_year), None

    days = _load_plan_days(admin, plan_records)
    task_index, class_records = _build_task_index(plan_records, days)
    task_ids = list(task_index.keys())

    if not task_ids:
        return _empty_report(student, classes, sel_month, sel_year), None

    submissions = _fetch_submissions_for_tasks(admin, student_id, task_ids)
    subs_by_task: dict[str, dict] = {}
    for sub in submissions:
        tid = str(sub.get("task_id") or "")
        if not tid:
            continue
        prev = subs_by_task.get(tid)
        if not prev:
            subs_by_task[tid] = sub
            continue
        prev_key = str(prev.get("reviewed_at") or prev.get("updated_at") or prev.get("created_at") or "")
        next_key = str(sub.get("reviewed_at") or sub.get("updated_at") or sub.get("created_at") or "")
        if next_key > prev_key:
            subs_by_task[tid] = sub

    overall_grid: dict[str, dict[int, list[int]]] = {}
    class_grids: dict[str, dict[str, dict[int, list[int]]]] = {}
    overall_records: list[dict] = []
    class_records: dict[str, list] = {c_id: [] for c_id in class_records}

    total_reviewed_count = 0
    total_score_sum = 0
    total_assigned = 0
    total_completed = 0
    total_month_tasks = 0
    today = date.today()

    # Scheduled curriculum in this month (for assignment stats)
    for tid, meta in task_index.items():
        sched_dt = meta.get("scheduled_date")
        if not sched_dt or sched_dt.month != sel_month or sched_dt.year != sel_year:
            continue
        task = meta["task"]
        total_month_tasks += 1
        if sched_dt <= today:
            total_assigned += 1

        my_sub = subs_by_task.get(tid)
        if my_sub:
            total_completed += 1
            if str(my_sub.get("status") or "").strip().lower() == "reviewed":
                try:
                    total_score_sum += int(my_sub.get("score") or 0)
                except Exception:
                    pass
                total_reviewed_count += 1

        overall_records.append({"task": task, "submission": my_sub})
        for c_id in meta.get("class_ids") or []:
            class_records.setdefault(c_id, []).append({"task": task, "submission": my_sub})

    # Grid marks: only tasks scheduled in the selected calendar month (curriculum month).
    # Column = day-of-month from scheduled_date (not review date), so October lessons
    # never appear when viewing May.
    for tid, my_sub in subs_by_task.items():
        if str(my_sub.get("status") or "").strip().lower() != "reviewed":
            continue

        meta = task_index.get(tid)
        if not meta:
            continue

        sched_dt = meta.get("scheduled_date")
        if not sched_dt or sched_dt.month != sel_month or sched_dt.year != sel_year:
            continue

        task = meta["task"]
        bucket = kpi_bucket_for_task(task)
        cal_day = sched_dt.day

        try:
            mark = int(my_sub.get("score") or 0)
        except Exception:
            mark = 0
        mark = max(0, min(100, mark))

        overall_grid.setdefault(bucket, {}).setdefault(cal_day, []).append(mark)
        for c_id in meta.get("class_ids") or []:
            class_grids.setdefault(c_id, {}).setdefault(bucket, {}).setdefault(cal_day, []).append(mark)

    # 6. Build the grid rows for the frontend table
    
    def process_grid(g, *, overall_mode: bool):
        processed = []
        for ttype in ALL_KPI_BUCKETS:
            days_data = {}
            all_marks: list[int] = []
            if ttype in g:
                for d_num, scores in g[ttype].items():
                    if not scores:
                        continue
                    normalized_scores = [max(0, min(100, int(s))) for s in scores]
                    # Class report: exact teacher mark for that class/day slot.
                    # Overall report: aggregate across classes as score/100 using same rule.
                    if overall_mode:
                        day_marks = round(sum(normalized_scores) / len(normalized_scores))
                    else:
                        day_marks = normalized_scores[-1]
                    days_data[d_num] = day_marks
                    all_marks.extend(normalized_scores)
            marks_count = len(all_marks)
            marks_sum = sum(all_marks)
            row_cumulative_100 = round(marks_sum / marks_count) if marks_count > 0 else None
            processed.append({
                "task_type": KPI_LABELS.get(ttype, ttype),
                "days": days_data,
                "row_marks_count": marks_count,
                "row_marks_sum": marks_sum if marks_count > 0 else None,
                "row_cumulative_100": row_cumulative_100,
            })
        return processed

    processed_overall_grid = process_grid(overall_grid, overall_mode=True)
    overall_cumulative_raw_400 = sum((row.get("row_cumulative_100") or 0) for row in processed_overall_grid)
    overall_cumulative_100 = round(overall_cumulative_raw_400 / 4)
    overall_bucket_summary = summarize_bucket_progress(overall_records)
    overall_pct = _overall_from_bucket_summary(overall_bucket_summary)

    class_reports = []
    for c in classes:
        c_id = c["id"]
        c_grid = class_grids.get(c_id, {})
        processed_c_grid = process_grid(c_grid, overall_mode=False)
        c_cumulative_raw_400 = sum((row.get("row_cumulative_100") or 0) for row in processed_c_grid)
        c_cumulative_100 = round(c_cumulative_raw_400 / 4)
        bucket_summary = summarize_bucket_progress(class_records.get(c_id, []))
        c_overall_pct = _overall_from_bucket_summary(bucket_summary)
        
        class_reports.append({
            "class_id": c_id,
            "class_name": c["name"],
            "grid": processed_c_grid,
            "overall_percentage": c_overall_pct,
            "total_cumulative_raw_400": c_cumulative_raw_400,
            "total_cumulative_100": c_cumulative_100,
            "bucket_summaries": _serialize_bucket_summary(bucket_summary),
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
        "average_review_score": round(total_score_sum / total_reviewed_count) if total_reviewed_count else 0,
        "total_cumulative_raw_400": overall_cumulative_raw_400,
        "total_cumulative_100": overall_cumulative_100,
        "grid": processed_overall_grid,
        "marks_formula": (
            "Each column is a calendar day in the selected month (from the study plan schedule). "
            "Cells show teacher marks for tasks scheduled on that day once reviewed. "
            "Row total = round(sum of marks / count) as x/100; overall = sum of 4 rows as y/400."
        ),
        "bucket_summaries": _serialize_bucket_summary(overall_bucket_summary),
        "class_reports": class_reports,
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
        "average_review_score": 0,
        "total_cumulative_raw_400": 0,
        "total_cumulative_100": 0,
        "grid": [
            {
                "task_type": KPI_LABELS.get(t, t),
                "days": {},
                "row_marks_count": 0,
                "row_marks_sum": None,
                "row_cumulative_100": None,
            }
            for t in ALL_KPI_BUCKETS
        ],
        "marks_formula": (
            "Each column is a calendar day in the selected month (from the study plan schedule). "
            "Cells show teacher marks for tasks scheduled on that day once reviewed. "
            "Row total = round(sum of marks / count) as x/100; overall = sum of 4 rows as y/400."
        ),
        "bucket_summaries": _serialize_bucket_summary({}),
        "class_reports": [],
    }


async def _cached_progress_report(
    *,
    tenant_id: str,
    student_id: str,
    class_id: Optional[str],
    month: Optional[int],
    year: Optional[int],
) -> tuple[Optional[dict], bool]:
    """Get cached progress report with tag-based invalidation support."""
    now = datetime.now()
    m = month or now.month
    y = year or now.year
    cache_key = cache_keys.progress_report(
        tenant_id, student_id, f"v6-scheduled-month:{y}-{m:02d}:{class_id or 'all'}"
    )

    # Try to get from cache first
    from app.core.redis_client import get_redis
    redis = await get_redis()
    cached = None
    if redis:
        try:
            raw = await redis.get(cache_key)
            if raw:
                import json
                cached = json.loads(raw)
        except Exception:
            pass

    if cached is not None:
        if not isinstance(cached, dict):
            return {"__cache_error__": "Invalid cached report payload"}, True
        if cached.get("__cache_error__"):
            return {"__cache_error__": cached["__cache_error__"]}, True
        return cached, True

    # Load from database
    try:
        report, err = await generate_detailed_report(student_id, class_id, month, year)
        if err:
            return {"__cache_error__": err}, False
        if not isinstance(report, dict):
            return {"__cache_error__": "Invalid report payload"}, False

        # Store with tags for efficient invalidation
        # Tags: student:{id} - allows invalidating all reports for a student
        await set_with_tags(
            key=cache_key,
            value=report,
            ttl=cache_ttl.STUDENT_REPORT,
            tags=[
                f"student:{student_id}",
                f"tenant:{tenant_id}",
            ],
        )
        return report, False
    except Exception as exc:
        return {"__cache_error__": f"Failed to build report: {exc}"}, False


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
    try:
        report, hit = await _cached_progress_report(
            tenant_id=str(token.tenant_id),
            student_id=student_id,
            class_id=class_id,
            month=month,
            year=year,
        )
        if not report or report.get("__cache_error__"):
            direct_report, direct_err = await generate_detailed_report(student_id, class_id, month, year)
            if direct_err:
                return error("ERROR", direct_err, 400)
            response = success(direct_report)
            response.headers["X-Cache"] = "MISS"
            return response
        response = success(report)
        response.headers["X-Cache"] = "HIT" if hit else "MISS"
        return response
    except Exception as exc:
        return error("ERROR", f"Failed to load report: {exc}", 500)


# ── Teacher: view any student's report ────────────────────────

@router.get("/teacher/students/{student_id}/report")
async def get_student_report_for_teacher(
    student_id: str,
    month: Optional[int] = None,
    year: Optional[int] = None,
    class_id: Optional[str] = None,
    token: TokenData = Depends(require_teacher)
):
    try:
        report, hit = await _cached_progress_report(
            tenant_id=str(token.tenant_id),
            student_id=student_id,
            class_id=class_id,
            month=month,
            year=year,
        )
        if not report or report.get("__cache_error__"):
            direct_report, direct_err = await generate_detailed_report(student_id, class_id, month, year)
            if direct_err:
                return error("ERROR", direct_err, 400)
            response = success(direct_report)
            response.headers["X-Cache"] = "MISS"
            return response
        response = success(report)
        response.headers["X-Cache"] = "HIT" if hit else "MISS"
        return response
    except Exception as exc:
        return error("ERROR", f"Failed to load report: {exc}", 500)
