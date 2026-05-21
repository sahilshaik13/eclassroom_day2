from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from app.core.cache_service import cache_delete, invalidate_class_caches
from app.core import cache_keys
from app.db.supabase import get_admin_client
from app.services.import_events import publish_import_event
from app.services.study_plan_kpi_service import build_column_bucket_map, normalize_kpi_bucket
from app.db.supabase_execute import execute_with_retry
from app.services.study_plan_pdf_import_service import build_import_payload, build_plan_rows

_TASK_UPSERT_CHUNK = 80


def _insert_plan_tree_bulk(admin: Any, tenant_id: str, plan_id: str, plan_days: list[dict]) -> None:
    """Insert days, periods, and tasks in three batched round-trips."""
    if not plan_days:
        return

    day_payload = [
        {
            "plan_id": plan_id,
            "day_number": day["day_number"],
            "scheduled_date": day.get("scheduled_date"),
            "is_accessible": day.get("is_accessible", True),
        }
        for day in plan_days
    ]
    day_res = execute_with_retry(
        admin.table("study_plan_days").insert(day_payload),
        label="apply_import/days_bulk",
    )
    inserted_days = day_res.data or []
    if len(inserted_days) != len(plan_days):
        raise RuntimeError("Failed to create all study plan days")
    day_id_by_number = {int(d["day_number"]): str(d["id"]) for d in inserted_days}

    period_payload: list[dict] = []
    period_keys: list[tuple[int, int]] = []
    for day in plan_days:
        day_id = day_id_by_number[int(day["day_number"])]
        for period in day.get("periods") or []:
            period_payload.append(
                {
                    "day_id": day_id,
                    "title": period["title"],
                    "duration_minutes": period["duration_minutes"],
                    "order_index": period["order_index"],
                }
            )
            period_keys.append((int(day["day_number"]), int(period["order_index"])))

    if not period_payload:
        return

    period_res = execute_with_retry(
        admin.table("study_plan_periods").insert(period_payload),
        label="apply_import/periods_bulk",
    )
    inserted_periods = period_res.data or []
    if len(inserted_periods) != len(period_payload):
        raise RuntimeError("Failed to create all study plan periods")
    period_id_by_key = {
        period_keys[i]: str(inserted_periods[i]["id"]) for i in range(len(period_keys))
    }

    task_payload: list[dict] = []
    for day in plan_days:
        for period in day.get("periods") or []:
            period_id = period_id_by_key[(int(day["day_number"]), int(period["order_index"]))]
            for task in period.get("tasks") or []:
                task_payload.append(
                    {
                        "period_id": period_id,
                        "tenant_id": tenant_id,
                        "title": task["title"],
                        "description": task.get("description"),
                        "task_type": task["task_type"],
                        "required": task.get("required", True),
                        "order_index": task["order_index"],
                        "config": task.get("config") or {},
                    }
                )

    for i in range(0, len(task_payload), _TASK_UPSERT_CHUNK):
        chunk = task_payload[i : i + _TASK_UPSERT_CHUNK]
        execute_with_retry(
            admin.table("study_plan_tasks").insert(chunk),
            label=f"apply_import/tasks_bulk:{i // _TASK_UPSERT_CHUNK}",
        )


def _verify_admin_classroom(admin: Any, tenant_id: str, class_id: str) -> Optional[dict]:
    result = (
        admin.table("classes")
        .select("id, name, teacher_id")
        .eq("id", class_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


def _get_import_by_id(admin: Any, tenant_id: str, import_id: str) -> Optional[dict]:
    result = (
        admin.table("study_plan_pdf_imports")
        .select("*")
        .eq("id", import_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return result.data if result else None


def _archive_class_imports(
    admin: Any,
    tenant_id: str,
    class_id: str,
    *,
    archived_plan_id: Optional[str] = None,
    exclude_import_id: Optional[str] = None,
) -> None:
    update_data: dict[str, Any] = {
        "ocr_status": "archived",
        "applied_plan_id": None,
        "ocr_job_id": None,
        "parse_message": "Study plan removed from class and moved to archive",
    }
    if archived_plan_id:
        update_data["archived_plan_id"] = archived_plan_id
    query = (
        admin.table("study_plan_pdf_imports")
        .update(update_data)
        .eq("tenant_id", tenant_id)
        .eq("class_id", class_id)
        .neq("ocr_status", "archived")
    )
    if exclude_import_id:
        query = query.neq("id", exclude_import_id)
    query.execute()


def _project_rows(selected_columns: list[str], rows: list[dict]) -> list[dict]:
    projected: list[dict] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        projected.append({column: row.get(column, "") for column in selected_columns})
    return projected


def _parse_optional_date(value: Any) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except Exception:
        return None


async def apply_import_to_classroom(
    *,
    import_id: str,
    tenant_id: str,
    user_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, tenant_id, import_id)
    if not import_row:
        raise ValueError("Study-plan import not found")

    classroom = _verify_admin_classroom(admin, tenant_id, str(import_row["class_id"]))
    if not classroom:
        raise ValueError("Class not found")

    selected_columns = [str(column).strip() for column in (payload.get("selected_columns") or []) if str(column).strip()]
    if not selected_columns:
        raise ValueError("Select at least one column before applying")

    source_rows = import_row.get("filtered_rows") or import_row.get("extracted_rows") or []
    rows = payload.get("rows") or []
    selected_row_indexes = payload.get("selected_row_indexes") or []
    if rows:
        chosen_rows = rows
    elif selected_row_indexes:
        chosen_rows = [
            source_rows[index]
            for index in selected_row_indexes
            if isinstance(index, int) and 0 <= index < len(source_rows)
        ]
    else:
        chosen_rows = []

    projected_rows = _project_rows(selected_columns, chosen_rows)
    column_bucket_map = build_column_bucket_map(
        selected_columns,
        projected_rows,
        payload.get("column_bucket_map") or import_row.get("column_bucket_map") or {},
    )
    plan_days = build_plan_rows(
        selected_columns,
        projected_rows,
        column_bucket_map=column_bucket_map,
        start_date=_parse_optional_date(payload.get("start_date")),
        end_date=_parse_optional_date(payload.get("end_date")),
    )
    if not plan_days:
        raise ValueError("No usable study-plan rows were provided")

    archived_plan_id: Optional[str] = None
    archive_record_id: Optional[str] = None
    existing_plan_res = (
        admin.table("study_plans")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("class_id", import_row["class_id"])
        .maybe_single()
        .execute()
    )
    existing_plan = existing_plan_res.data if existing_plan_res else None
    if existing_plan:
        archived_plan_id = existing_plan["id"]

        # Build full archive snapshot before archiving
        archive_snapshot = _build_archive_snapshot(
            admin, tenant_id, archived_plan_id, str(import_row["class_id"])
        )

        # Insert into study_plan_archives table for permanent record
        archive_res = admin.table("study_plan_archives").insert(
            {
                "tenant_id": tenant_id,
                "class_id": import_row["class_id"],
                "original_plan_id": archived_plan_id,
                "original_plan_name": existing_plan.get("name", ""),
                "original_plan_created_at": existing_plan.get("created_at"),
                "original_source_import_id": existing_plan.get("source_import_id"),
                "triggered_by_import_id": import_id,
                "archived_by_user_id": user_id,
                "plan_snapshot": archive_snapshot.get("plan", {}),
                "days_snapshot": archive_snapshot.get("days", []),
                "submissions_summary": archive_snapshot.get("submissions_by_task", {}),
                "enrolled_students": archive_snapshot.get("enrolled_students", []),
                "total_days": archive_snapshot.get("summary", {}).get("total_days", 0),
                "total_tasks": archive_snapshot.get("summary", {}).get("total_tasks", 0),
                "total_submissions": archive_snapshot.get("summary", {}).get("total_submissions", 0),
                "total_reviewed": archive_snapshot.get("summary", {}).get("total_reviewed", 0),
                "enrolled_student_count": archive_snapshot.get("summary", {}).get("enrolled_students_count", 0),
                "archived_at": datetime.utcnow().isoformat(),
                "can_restore": False,  # Future feature
            }
        ).execute()
        archive_record_id = archive_res.data[0]["id"] if archive_res.data else None

        # Soft-delete the existing plan
        admin.table("study_plans").update(
            {
                "status": "archived",
                "archived_at": datetime.utcnow().isoformat(),
                "archived_class_id": import_row["class_id"],
                "class_id": None,
            }
        ).eq("id", archived_plan_id).execute()

        _archive_class_imports(
            admin,
            tenant_id,
            str(import_row["class_id"]),
            archived_plan_id=archived_plan_id,
            exclude_import_id=import_id,
        )

    plan_name = (str(payload.get("name") or "")).strip() or f"{classroom['name']} Study Plan"
    description = (str(payload.get("description") or "")).strip() or (
        f"Imported from {import_row.get('original_filename') or 'PDF study plan'}"
    )
    plan_res = (
        admin.table("study_plans")
        .insert(
            {
                "tenant_id": tenant_id,
                "class_id": import_row["class_id"],
                "name": plan_name,
                "description": description,
                "status": "active",
                "created_by": user_id,
                "source_import_id": import_id,
            }
        )
        .execute()
    )
    if not plan_res.data:
        raise RuntimeError("Failed to create study plan")
    plan = plan_res.data[0]

    _insert_plan_tree_bulk(admin, tenant_id, str(plan["id"]), plan_days)

    updated = (
        admin.table("study_plan_pdf_imports")
        .update(
            {
                "ocr_status": "applied",
                "selected_columns": selected_columns,
                "filtered_rows": projected_rows,
                "applied_rows": projected_rows,
                "column_bucket_map": column_bucket_map,
                "applied_plan_id": plan["id"],
                "archived_plan_id": archived_plan_id,
                "created_archive_id": archive_record_id,  # Reference to full archive record
                "parse_message": f"Applied to {classroom['name']}",
            }
        )
        .eq("id", import_id)
        .execute()
    )
    saved_import = updated.data[0] if updated.data else import_row
    import_payload = build_import_payload(saved_import, admin)
    await publish_import_event(
        str(classroom["id"]),
        import_id=import_id,
        ocr_status="applied",
        payload=import_payload,
    )
    await invalidate_class_caches(tenant_id, str(classroom["id"]))
    await cache_delete(cache_keys.admin_stats(tenant_id))
    return {
        "plan_id": plan["id"],
        "import": import_payload,
        "day_count": len(plan_days),
        "archive_record_id": archive_record_id,
    }


def _build_archive_snapshot(
    admin: Any, tenant_id: str, plan_id: str, class_id: str
) -> dict:
    """Build a full snapshot of an existing plan for archival."""
    # Get plan details
    plan_res = admin.table("study_plans").select("*").eq("id", plan_id).single().execute()
    plan = plan_res.data if plan_res else {}

    # Get all days with full hierarchy
    days_res = (
        admin.table("study_plan_days")
        .select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))")
        .eq("plan_id", plan_id)
        .execute()
    )
    days = days_res.data or []

    # Get all task IDs for submission lookup
    task_ids = []
    for day in days:
        for period in day.get("periods") or []:
            for task in period.get("tasks") or []:
                task_ids.append(task["id"])

    # Get submissions with student info
    submissions_by_task: dict[str, list] = {}
    if task_ids:
        subs_res = (
            admin.table("study_plan_submissions")
            .select("*, students(id, name)")
            .in_("task_id", task_ids)
            .execute()
        )
        for sub in subs_res.data or []:
            tid = sub.get("task_id")
            if tid:
                submissions_by_task.setdefault(tid, []).append({
                    "id": sub.get("id"),
                    "student_id": sub.get("student_id"),
                    "student_name": sub.get("students", {}).get("name") if isinstance(sub.get("students"), dict) else None,
                    "status": sub.get("status"),
                    "score": sub.get("score"),
                    "feedback": sub.get("feedback"),
                    "created_at": sub.get("created_at"),
                    "reviewed_at": sub.get("reviewed_at"),
                    "audio_url": sub.get("audio_url"),
                })

    # Get enrolled students
    enrollments_res = (
        admin.table("class_enrollments")
        .select("students(id, name, phone)")
        .eq("class_id", class_id)
        .execute()
    )
    students = []
    for e in enrollments_res.data or []:
        s = e.get("students") if isinstance(e.get("students"), dict) else {}
        if s:
            students.append({
                "id": s.get("id"),
                "name": s.get("name"),
                "phone": s.get("phone"),
            })

    reviewed_count = sum(
        1 for subs in submissions_by_task.values()
        for s in subs if s.get("status") == "reviewed"
    )

    return {
        "plan": plan,
        "days": days,
        "submissions_by_task": submissions_by_task,
        "enrolled_students": students,
        "summary": {
            "total_days": len(days),
            "total_tasks": len(task_ids),
            "total_submissions": sum(len(subs) for subs in submissions_by_task.values()),
            "total_reviewed": reviewed_count,
            "enrolled_students_count": len(students),
        },
    }


async def apply_import_kpi_mapping(
    *,
    import_id: str,
    tenant_id: str,
    selected_columns: list[str],
    column_bucket_map: dict[str, Any],
) -> dict[str, Any]:
    admin = get_admin_client()
    import_row = _get_import_by_id(admin, tenant_id, import_id)
    if not import_row:
        raise ValueError("Study-plan import not found")

    selected = [str(column).strip() for column in selected_columns if str(column).strip()]
    if not selected:
        raise ValueError("Select at least one column")

    source_rows = import_row.get("filtered_rows") or import_row.get("extracted_rows") or []
    normalized_map = build_column_bucket_map(
        selected,
        source_rows,
        column_bucket_map or import_row.get("column_bucket_map") or {},
    )
    updated = (
        admin.table("study_plan_pdf_imports")
        .update(
            {
                "selected_columns": selected,
                "column_bucket_map": normalized_map,
                "parse_message": "KPI mapping updated",
            }
        )
        .eq("id", import_id)
        .execute()
    )
    saved_import = updated.data[0] if updated.data else import_row

    updated_tasks = 0
    plan_id = saved_import.get("applied_plan_id")
    if plan_id:
        days_res = (
            admin.table("study_plan_days")
            .select("id, periods:study_plan_periods(id, tasks:study_plan_tasks(id, config))")
            .eq("plan_id", plan_id)
            .execute()
        )
        task_updates: list[dict] = []
        for day in days_res.data or []:
            for period in day.get("periods") or []:
                for task in period.get("tasks") or []:
                    config = task.get("config") if isinstance(task.get("config"), dict) else {}
                    if config.get("role") in {"tracker", "day_topic"}:
                        continue
                    source_column = str(config.get("source_column") or "").strip()
                    if not source_column:
                        continue
                    bucket = normalize_kpi_bucket(normalized_map.get(source_column))
                    if not bucket:
                        continue
                    if normalize_kpi_bucket(config.get("kpi_bucket")) == bucket:
                        continue
                    config["kpi_bucket"] = bucket
                    task_updates.append({"id": task["id"], "config": config})
        for i in range(0, len(task_updates), _TASK_UPSERT_CHUNK):
            chunk = task_updates[i : i + _TASK_UPSERT_CHUNK]
            execute_with_retry(
                admin.table("study_plan_tasks").upsert(chunk),
                label=f"apply_kpi/tasks_upsert:{i // _TASK_UPSERT_CHUNK}",
            )
            updated_tasks += len(chunk)

    payload = build_import_payload(saved_import, admin)
    class_id = str(saved_import.get("class_id") or "")
    if class_id:
        await publish_import_event(
            class_id,
            import_id=import_id,
            ocr_status=str(saved_import.get("ocr_status") or ""),
            payload=payload,
        )
        await invalidate_class_caches(tenant_id, class_id)
    return {"import": payload, "updated_tasks": updated_tasks}
