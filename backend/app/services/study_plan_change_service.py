from __future__ import annotations

from typing import Any, Optional

from app.db.supabase import get_admin_client
from app.db.supabase_execute import execute_with_retry, first_row_from_response

_CLASS_EMBED = "classes(id, name, teacher_id, tenant_id, users!classes_teacher_id_fkey(name))"
_PLAN_EMBED = f"study_plans(*, {_CLASS_EMBED})"
_DAY_EMBED = f"study_plan_days(*, {_PLAN_EMBED})"
_PERIOD_EMBED = f"study_plan_periods(*, {_DAY_EMBED})"
_TASK_CONTEXT_SELECT = f"*, {_PERIOD_EMBED}"


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def _task_snapshot(task: dict) -> dict[str, Any]:
    config = task.get("config") if isinstance(task.get("config"), dict) else {}
    return _json_safe(
        {
            "title": task.get("title"),
            "description": task.get("description"),
            "task_type": task.get("task_type"),
            "required": task.get("required"),
            "order_index": task.get("order_index"),
            "kpi_bucket": config.get("kpi_bucket"),
        }
    )


def _period_snapshot(period: dict) -> dict[str, Any]:
    return _json_safe(
        {
            "title": period.get("title"),
            "duration_minutes": period.get("duration_minutes"),
            "order_index": period.get("order_index"),
        }
    )


def _day_snapshot(day: dict) -> dict[str, Any]:
    return _json_safe(
        {
            "day_number": day.get("day_number"),
            "scheduled_date": day.get("scheduled_date"),
            "is_accessible": day.get("is_accessible"),
        }
    )


def snapshot_for_entity(entity_type: str, row: dict) -> dict[str, Any]:
    if entity_type == "task":
        return _task_snapshot(row)
    if entity_type == "period":
        return _period_snapshot(row)
    if entity_type == "day":
        return _day_snapshot(row)
    return {}


def _first_embed(row: dict, key: str) -> dict:
    val = row.get(key)
    if isinstance(val, list):
        return val[0] if val else {}
    return val if isinstance(val, dict) else {}


def _meta_from_day_row(day: dict, *, entity_row: dict) -> Optional[dict[str, Any]]:
    plan = _first_embed(day, "study_plans")
    if not plan:
        return None
    cls = _first_embed(plan, "classes")
    if not cls:
        return None
    teacher = _first_embed(cls, "users")
    return {
        "class_id": cls.get("id"),
        "class_name": cls.get("name") or "",
        "tenant_id": cls.get("tenant_id"),
        "teacher_user_id": cls.get("teacher_id"),
        "teacher_name": teacher.get("name") or "",
        "plan_id": plan.get("id"),
        "plan_day_number": day.get("day_number"),
        "scheduled_date": day.get("scheduled_date"),
        "entity_row": entity_row,
    }


def _context_from_task_id(admin, task_id: str) -> Optional[dict[str, Any]]:
    res = execute_with_retry(
        admin.table("study_plan_tasks")
        .select(_TASK_CONTEXT_SELECT)
        .eq("id", task_id)
        .limit(1),
        label="change_context/task",
    )
    task = first_row_from_response(res)
    if not task:
        return None
    period = _first_embed(task, "study_plan_periods")
    if not period:
        return None
    day = _first_embed(period, "study_plan_days")
    if not day:
        return None
    ctx = _meta_from_day_row(day, entity_row=task)
    return ctx


def _context_from_period_id(admin, period_id: str) -> Optional[dict[str, Any]]:
    res = execute_with_retry(
        admin.table("study_plan_periods")
        .select(f"*, {_DAY_EMBED}")
        .eq("id", period_id)
        .limit(1),
        label="change_context/period",
    )
    period = first_row_from_response(res)
    if not period:
        return None
    day = _first_embed(period, "study_plan_days")
    if not day:
        return None
    return _meta_from_day_row(day, entity_row=period)


def _context_from_day_id(admin, day_id: str) -> Optional[dict[str, Any]]:
    res = execute_with_retry(
        admin.table("study_plan_days")
        .select(f"*, {_PLAN_EMBED}")
        .eq("id", day_id)
        .limit(1),
        label="change_context/day",
    )
    day = first_row_from_response(res)
    if not day:
        return None
    return _meta_from_day_row(day, entity_row=day)


def user_display_name(admin, user_id: str) -> str:
    if not user_id:
        return ""
    res = execute_with_retry(
        admin.table("users").select("name").eq("id", user_id).limit(1),
        label="change_context/user_name",
    )
    row = first_row_from_response(res)
    return (row or {}).get("name") or ""


def _teacher_name(admin, user_id: str) -> str:
    return user_display_name(admin, user_id)


def actor_display_name(admin, user_id: str, role: str) -> str:
    name = user_display_name(admin, user_id)
    if role == "admin":
        return f"{name} (Admin)" if name else "Admin"
    if role == "teacher":
        return name or "Teacher"
    return name or role


def _resolve_context(entity_type: str, entity_id: str) -> Optional[dict[str, Any]]:
    admin = get_admin_client()
    if entity_type == "task":
        return _context_from_task_id(admin, entity_id)
    if entity_type == "period":
        return _context_from_period_id(admin, entity_id)
    if entity_type == "day":
        return _context_from_day_id(admin, entity_id)
    return None


def record_teacher_study_plan_change(
    *,
    entity_type: str,
    entity_id: str,
    change_type: str,
    previous_details: dict[str, Any],
    new_details: dict[str, Any],
    teacher_user_id: str,
    teacher_name: Optional[str] = None,
) -> None:
    if previous_details == new_details:
        return

    admin = get_admin_client()
    ctx = _resolve_context(entity_type, entity_id)
    if not ctx or not ctx.get("plan_id") or not ctx.get("class_id"):
        return

    display_teacher = teacher_name or ctx.get("teacher_name") or _teacher_name(admin, teacher_user_id) or ""

    execute_with_retry(
        admin.table("study_plan_teacher_changes").insert(
            {
                "tenant_id": ctx["tenant_id"],
                "plan_id": ctx["plan_id"],
                "class_id": ctx["class_id"],
                "teacher_user_id": teacher_user_id,
                "teacher_name": display_teacher,
                "class_name": ctx.get("class_name") or "",
                "entity_type": entity_type,
                "entity_id": entity_id,
                "change_type": change_type,
                "plan_day_number": ctx.get("plan_day_number"),
                "scheduled_date": ctx.get("scheduled_date"),
                "previous_details": previous_details,
                "new_details": new_details,
            }
        ),
        label="change_context/insert",
    )


def list_teacher_changes(
    tenant_id: str,
    *,
    class_id: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    admin = get_admin_client()
    q = (
        admin.table("study_plan_teacher_changes")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(limit)
    )
    if class_id:
        q = q.eq("class_id", class_id)
    res = execute_with_retry(q, label="change_context/list")
    return res.data or []
