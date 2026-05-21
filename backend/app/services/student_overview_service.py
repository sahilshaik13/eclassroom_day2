"""Teacher/admin student profile helpers (attendance day task breakdown)."""
from __future__ import annotations

import copy
import logging
from typing import Any

from app.db.batch_in import chunked_in_fetch
from app.services.study_plan_cache_service import load_classroom_study_plan
from app.services.study_plan_kpi_service import filter_submittable_tasks

_logger = logging.getLogger(__name__)


def task_display_title(task: dict) -> str:
    """Human-readable label (column + value) for teacher attendance task list."""
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    column = str(config.get("source_column") or "").strip()
    value = str(config.get("source_value") or "").strip()
    title = str(task.get("title") or "").strip()
    if column and value:
        if ":" in title:
            return title
        return f"{column}: {value}"
    if title:
        return title
    return "Task"


def build_task_status_by_date(
    admin: Any,
    tenant_id: str,
    student_id: str,
    class_ids: list[str],
) -> dict[str, dict]:
    """
    Map scheduled_date (YYYY-MM-DD) → submittable tasks + submission flags for one student.
    Uses the same study-plan loader as the classroom plan UI (reliable nested fetch).
    """
    if not class_ids:
        return {}

    task_status_by_date: dict[str, dict] = {}
    all_task_ids: list[str] = []

    for class_id in class_ids:
        try:
            plan = load_classroom_study_plan(
                admin,
                tenant_id,
                str(class_id),
                active_only=True,
            )
        except Exception:
            _logger.exception(
                "load_classroom_study_plan failed class_id=%s student_id=%s",
                class_id,
                student_id,
            )
            continue
        if not plan:
            continue

        for day in plan.get("days") or []:
            scheduled = str(day.get("scheduled_date") or "")[:10]
            if not scheduled:
                continue

            day_copy = copy.deepcopy(day)
            filter_submittable_tasks(day_copy)

            bucket = task_status_by_date.get(scheduled) or {
                "day_number": day_copy.get("day_number"),
                "tasks": [],
            }
            seen = {
                str(t.get("task_id"))
                for t in bucket["tasks"]
                if t.get("task_id")
            }

            for period in day_copy.get("periods") or []:
                for task in period.get("tasks") or []:
                    task_id = str(task.get("id") or "")
                    if not task_id or task_id in seen:
                        continue
                    seen.add(task_id)
                    all_task_ids.append(task_id)
                    bucket["tasks"].append(
                        {
                            "task_id": task_id,
                            "title": task_display_title(task),
                            "submitted": False,
                        }
                    )

            total = len(bucket["tasks"])
            bucket["total_count"] = total
            bucket["submitted_count"] = len(
                [t for t in bucket["tasks"] if t.get("submitted")]
            )
            task_status_by_date[scheduled] = bucket

    if not all_task_ids:
        return task_status_by_date

    submitted_task_ids: set[str] = set()
    try:
        sub_rows = chunked_in_fetch(
            admin,
            "study_plan_submissions",
            "task_id",
            "task_id",
            list(dict.fromkeys(all_task_ids)),
            extra_eq=lambda q: q.eq("student_id", student_id),
            chunk_size=100,
            label=f"overview_submissions student_id={student_id}",
        )
        submitted_task_ids = {
            str(row.get("task_id"))
            for row in sub_rows
            if row.get("task_id")
        }
    except Exception:
        _logger.exception(
            "study_plan_submissions load failed for overview student_id=%s",
            student_id,
        )

    for bucket in task_status_by_date.values():
        for task in bucket.get("tasks") or []:
            tid = str(task.get("task_id") or "")
            task["submitted"] = tid in submitted_task_ids
        bucket["submitted_count"] = len(
            [t for t in bucket.get("tasks") or [] if t.get("submitted")]
        )
        bucket["total_count"] = len(bucket.get("tasks") or [])

    return task_status_by_date


def enrolled_class_ids_for_student(
    admin: Any,
    student_id: str,
    allowed_class_ids: list[str],
) -> list[str]:
    """Classes the student is enrolled in that the teacher/admin may view."""
    if not allowed_class_ids:
        return []
    try:
        enr_res = (
            admin.table("class_enrollments")
            .select("class_id")
            .eq("student_id", student_id)
            .in_("class_id", allowed_class_ids)
            .execute()
        )
        return [
            str(row["class_id"])
            for row in (enr_res.data or [])
            if row.get("class_id")
        ]
    except Exception:
        _logger.exception(
            "enrollment lookup failed student_id=%s", student_id
        )
        return []
