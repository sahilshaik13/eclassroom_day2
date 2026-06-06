"""Redis-backed loaders for classroom study plans (student / teacher / admin)."""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

from app.core import cache_keys, cache_ttl
from app.core.cache_service import cache_delete, cache_get, cache_set, get_or_set_cache
from app.core.cache_tags import set_with_tags, invalidate_by_tag, build_tags
from app.core.db_async import run_sync
from app.db.supabase import get_admin_client
from app.services.study_plan_kpi_service import (
    filter_student_visible_days,
    filter_submittable_tasks,
    kpi_bucket_for_task,
    summarize_bucket_progress,
)
from app.services.study_plan_pdf_import_service import build_import_payload

_logger = logging.getLogger(__name__)

_SENTINEL_NO_PLAN = {"__study_plan_none__": True}
_SENTINEL_NO_SOURCE = {"__study_plan_source_none__": True}
_RETRIABLE_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ReadError,
    httpx.ConnectError,
)


def _safe_data(result) -> Any:
    if result is None:
        return None
    return getattr(result, "data", None)


def _execute_with_retry(query_builder: Any, *, label: str, attempts: int = 3) -> Any:
    """Retry transient transport errors from PostgREST/httpx."""
    delay_seconds = 0.2
    for attempt in range(1, attempts + 1):
        try:
            return query_builder.execute()
        except _RETRIABLE_HTTP_ERRORS as exc:
            if attempt >= attempts:
                raise
            _logger.warning(
                "Supabase transient transport error on %s (attempt %s/%s): %s",
                label,
                attempt,
                attempts,
                exc,
            )
            time.sleep(delay_seconds * attempt)


def _sort_days_tree(days: list[dict]) -> None:
    for day in days:
        periods = day.get("periods") or []
        periods.sort(key=lambda x: x.get("order_index", 0))
        day["periods"] = periods
        for period in periods:
            tasks = period.get("tasks") or []
            tasks.sort(key=lambda x: x.get("order_index", 0))
            period["tasks"] = tasks


def _day_filter_clause(plan_id: str, template_id: Optional[str]) -> Optional[str]:
    parts: list[str] = []
    if plan_id and not str(plan_id).startswith("template::"):
        parts.append(f"plan_id.eq.{plan_id}")
    if template_id:
        parts.append(f"template_id.eq.{template_id}")
    if not parts:
        return None
    return ",".join(parts)


def load_classroom_study_plan(
    admin: Any,
    tenant_id: str,
    class_id: str,
    *,
    active_only: bool = False,
) -> Optional[dict]:
    """Plan + days/periods/tasks (no per-student submission data)."""
    q = (
        admin.table("study_plans")
        .select("*")
        .eq("class_id", class_id)
        .eq("tenant_id", tenant_id)
    )
    if active_only:
        q = q.eq("status", "active")
    plan_res = _execute_with_retry(
        q.order("created_at", desc=True).limit(1),
        label=f"study_plans active_only={active_only} class_id={class_id}",
    )
    rows = _safe_data(plan_res) or []
    plan = rows[0] if rows else None
    if not plan:
        return None

    plan_id = plan["id"]
    template_id = plan.get("template_id")
    filter_clause = _day_filter_clause(str(plan_id), template_id)
    if not filter_clause:
        plan["days"] = []
        return plan

    try:
        days_res = _execute_with_retry(
            admin.table("study_plan_days")
            .select("*, periods:study_plan_periods(*, tasks:study_plan_tasks(*))")
            .or_(filter_clause)
            .order("day_number"),
            label=f"study_plan_days plan_id={plan_id}",
        )
        days = _safe_data(days_res) or []
    except Exception:
        _logger.exception("study_plan_days load failed for class_id=%s plan_id=%s", class_id, plan_id)
        days = []
    _sort_days_tree(days)
    plan["days"] = days
    return plan


def load_student_study_plan(
    admin: Any,
    tenant_id: str,
    class_id: str,
    student_id: str,
) -> Optional[dict]:
    """Active plan with student-scoped submissions and bucket progress."""
    plan = load_classroom_study_plan(admin, tenant_id, class_id, active_only=True)
    if not plan:
        return None

    days = filter_student_visible_days(plan.get("days") or [])

    task_ids: list[str] = []
    for day in days:
        for period in day.get("periods") or []:
            for task in period.get("tasks") or []:
                if task.get("id"):
                    task_ids.append(str(task["id"]))

    submissions_by_task: dict[str, list] = {}
    if task_ids:
        from app.db.batch_in import chunked_in_fetch

        try:
            sub_rows = chunked_in_fetch(
                admin,
                "study_plan_submissions",
                "*",
                "task_id",
                task_ids,
                extra_eq=lambda q: q.eq("student_id", student_id),
                chunk_size=100,
                label=f"study_plan_submissions student_id={student_id}",
            )
        except Exception:
            _logger.exception(
                "study_plan_submissions load failed for student_id=%s class_id=%s",
                student_id,
                class_id,
            )
            sub_rows = []
        for sub in sub_rows:
            tid = str(sub.get("task_id") or "")
            if tid:
                submissions_by_task.setdefault(tid, []).append(sub)
        for tid, rows in submissions_by_task.items():
            rows.sort(
                key=lambda r: str(
                    r.get("reviewed_at") or r.get("updated_at") or r.get("created_at") or ""
                ),
                reverse=True,
            )

    plan_bucket_records: list[dict] = []
    for day in days:
        day["is_locked"] = False
        for period in day.get("periods") or []:
            for task in period.get("tasks") or []:
                tid = str(task.get("id") or "")
                task["study_plan_submissions"] = submissions_by_task.get(tid, [])
                task["kpi_bucket"] = kpi_bucket_for_task(task)
        filter_submittable_tasks(day)
        day_bucket_records: list[dict] = []
        for period in day.get("periods") or []:
            period_bucket_records: list[dict] = []
            for task in period.get("tasks") or []:
                submission = task["study_plan_submissions"][0] if task["study_plan_submissions"] else None
                record = {"task": task, "submission": submission}
                period_bucket_records.append(record)
                day_bucket_records.append(record)
                plan_bucket_records.append(record)
            period["bucket_progress"] = summarize_bucket_progress(period_bucket_records)
        day["bucket_progress"] = summarize_bucket_progress(day_bucket_records)

    plan["days"] = days
    plan["bucket_progress"] = summarize_bucket_progress(plan_bucket_records)
    return plan


def _get_editable_import_row(admin: Any, tenant_id: str, class_id: str) -> Optional[dict]:
    try:
        active_plan = _execute_with_retry(
            admin.table("study_plans")
            .select("id, source_import_id, status")
            .eq("tenant_id", tenant_id)
            .eq("class_id", class_id)
            .neq("status", "archived")
            .limit(1),
            label=f"study_plans source row class_id={class_id}",
        )
    except Exception:
        _logger.exception("study_plans source lookup failed for class_id=%s", class_id)
        return None
    rows = active_plan.data or []
    active = rows[0] if rows else None
    active_source_id = (
        str(active["source_import_id"]) if active and active.get("source_import_id") else None
    )

    try:
        result = _execute_with_retry(
            admin.table("study_plan_pdf_imports")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("class_id", class_id)
            .order("created_at", desc=True)
            .limit(25),
            label=f"study_plan_pdf_imports class_id={class_id}",
        )
    except Exception:
        _logger.exception("study_plan_pdf_imports lookup failed for class_id=%s", class_id)
        return None
    for row in result.data or []:
        status = str(row.get("ocr_status") or "")
        if status == "archived":
            continue
        if row.get("archived_plan_id") and not active:
            continue
        if status == "applied":
            if active_source_id and str(row.get("id")) == active_source_id:
                return row
            continue
        if status in {"pending", "uploading", "processing", "failed", "cancelled", "completed"}:
            return row
    return None


def load_study_plan_source(admin: Any, tenant_id: str, class_id: str) -> Optional[dict]:
    """PDF import metadata for a class (same rules as teacher/admin current import)."""
    import_row = _get_editable_import_row(admin, tenant_id, class_id)
    if not import_row:
        return None
    try:
        return build_import_payload(import_row, admin)
    except Exception:
        _logger.exception("build_import_payload failed class_id=%s", class_id)
        return None


async def get_cached_teacher_study_plan(tenant_id: str, class_id: str) -> tuple[Optional[dict], bool]:
    admin = get_admin_client()
    key = cache_keys.classroom_study_plan(tenant_id, class_id)

    cached = await cache_get(key)
    if cached is not None:
        if isinstance(cached, dict) and cached.get("__study_plan_none__"):
            return None, True
        return cached, True

    plan = await run_sync(
        lambda: load_classroom_study_plan(admin, tenant_id, class_id, active_only=False)
    )
    if plan is not None:
        await cache_set(key, plan, cache_ttl.STUDY_PLAN)
    else:
        await cache_set(key, _SENTINEL_NO_PLAN, cache_ttl.STUDY_PLAN)
    return plan, False


async def get_cached_active_study_plan(tenant_id: str, class_id: str) -> tuple[Optional[dict], bool]:
    admin = get_admin_client()
    key = cache_keys.classroom_study_plan_active(tenant_id, class_id)

    cached = await cache_get(key)
    if cached is not None:
        if isinstance(cached, dict) and cached.get("__study_plan_none__"):
            return None, True
        return cached, True

    plan = await run_sync(
        lambda: load_classroom_study_plan(admin, tenant_id, class_id, active_only=True)
    )
    if plan is not None:
        await cache_set(key, plan, cache_ttl.STUDY_PLAN)
    else:
        await cache_set(key, _SENTINEL_NO_PLAN, cache_ttl.STUDY_PLAN)
    return plan, False


async def get_cached_student_study_plan(
    tenant_id: str, class_id: str, student_id: str
) -> tuple[Optional[dict], bool]:
    admin = get_admin_client()
    key = cache_keys.classroom_study_plan_student(tenant_id, class_id, student_id)

    async def _load() -> Optional[dict]:
        return await run_sync(
            lambda: load_student_study_plan(admin, tenant_id, class_id, student_id)
        )

    return await get_or_set_cache(key, cache_ttl.STUDY_PLAN, _load)


async def get_cached_study_plan_source(tenant_id: str, class_id: str) -> tuple[Optional[dict], bool]:
    admin = get_admin_client()
    key = cache_keys.classroom_study_plan_source(tenant_id, class_id)

    cached = await cache_get(key)
    if cached is not None:
        if isinstance(cached, dict) and cached.get("__study_plan_source_none__"):
            return None, True
        return cached, True

    try:
        payload = await run_sync(lambda: load_study_plan_source(admin, tenant_id, class_id))
    except Exception:
        _logger.exception("load_study_plan_source failed class_id=%s", class_id)
        payload = None

    if payload is not None:
        await cache_set(key, payload, cache_ttl.STUDY_PLAN)
    else:
        await cache_set(key, _SENTINEL_NO_SOURCE, cache_ttl.STUDY_PLAN)
    return payload, False


def resolve_class_id_from_period_id(admin: Any, period_id: str) -> Optional[str]:
    """Map a study_plan_periods row to a classroom id."""
    period_res = (
        admin.table("study_plan_periods")
        .select("day_id")
        .eq("id", str(period_id))
        .limit(1)
        .execute()
    )
    rows = period_res.data if period_res else None
    if not rows:
        return None
    day_id = rows[0].get("day_id") if isinstance(rows, list) else rows.get("day_id")
    if not day_id:
        return None
    day_res = (
        admin.table("study_plan_days")
        .select("plan_id, template_id")
        .eq("id", str(day_id))
        .limit(1)
        .execute()
    )
    day_rows = day_res.data if day_res else None
    if not day_rows:
        return None
    day = day_rows[0] if isinstance(day_rows, list) else day_rows
    plan_id = day.get("plan_id")
    template_id = day.get("template_id")
    if plan_id:
        plan_row = (
            admin.table("study_plans")
            .select("class_id")
            .eq("id", str(plan_id))
            .limit(1)
            .execute()
        )
        plan_data = plan_row.data if plan_row else None
        if plan_data:
            row0 = plan_data[0] if isinstance(plan_data, list) else plan_data
            if row0 and row0.get("class_id"):
                return str(row0["class_id"])
    if template_id:
        tpl_row = (
            admin.table("study_plans")
            .select("class_id")
            .eq("template_id", str(template_id))
            .not_.is_("class_id", "null")
            .limit(1)
            .execute()
        )
        tpl_data = tpl_row.data if tpl_row else None
        if tpl_data and tpl_data[0].get("class_id"):
            return str(tpl_data[0]["class_id"])
    return None


def resolve_class_id_from_task(admin: Any, task: dict) -> Optional[str]:
    """Map a study_plan_tasks row (with nested period/day) to a classroom id."""
    period = task.get("study_plan_periods") or {}
    if isinstance(period, list):
        period = period[0] if period else {}
    day = period.get("study_plan_days") or {}
    if isinstance(day, list):
        day = day[0] if day else {}

    plan_id = day.get("plan_id")
    template_id = day.get("template_id")
    if plan_id:
        row = (
            admin.table("study_plans")
            .select("class_id")
            .eq("id", str(plan_id))
            .maybe_single()
            .execute()
        )
        data = row.data if row else None
        if data and data.get("class_id"):
            return str(data["class_id"])
    if template_id:
        row = (
            admin.table("study_plans")
            .select("class_id")
            .eq("template_id", str(template_id))
            .not_.is_("class_id", "null")
            .limit(1)
            .execute()
        )
        rows = row.data if row else None
        if rows and rows[0].get("class_id"):
            return str(rows[0]["class_id"])
    return None


async def _purge_enrolled_student_study_plan_caches(tenant_id: str, class_id: str) -> None:
    """Drop per-student study plan bundles (not covered by class-level keys alone)."""
    keys: list[str] = []
    try:
        admin = get_admin_client()
        enr = (
            admin.table("class_enrollments")
            .select("student_id, classes(teacher_id)")
            .eq("class_id", class_id)
            .execute()
        )
        for row in enr.data or []:
            sid = row.get("student_id")
            if sid:
                keys.append(
                    cache_keys.classroom_study_plan_student(tenant_id, class_id, str(sid))
                )
                cls = row.get("classes") or {}
                teacher_id = cls.get("teacher_id")
                if teacher_id:
                    keys.append(
                        cache_keys.teacher_student_overview(
                            tenant_id, str(teacher_id), str(sid)
                        )
                    )
    except Exception:
        _logger.exception(
            "enrollment lookup failed for student study-plan cache purge class_id=%s",
            class_id,
        )

    if keys:
        await cache_delete(*keys)

    redis = None
    try:
        from app.core.redis_client import get_redis

        redis = get_redis()
    except Exception:
        redis = None

    if redis:
        prefix = cache_keys.tenant_prefix(tenant_id)
        pattern = f"{prefix}:classroom:{class_id}:study_plan:student:*"
        try:
            batch: list[str] = []
            async for key in redis.scan_iter(match=pattern, count=100):
                batch.append(key)
                if len(batch) >= 100:
                    await redis.delete(*batch)
                    batch = []
            if batch:
                await redis.delete(*batch)
        except Exception:
            _logger.exception("purge student study-plan caches scan %s", pattern)


async def invalidate_study_plan_caches(tenant_id: str, class_id: str) -> None:
    """Drop all study-plan Redis keys for a classroom.

    Uses O(1) tag-based invalidation as primary method, with pattern-based
    fallback for backward compatibility during migration.
    """
    # Delete direct keys
    keys = [
        cache_keys.classroom_study_plan(tenant_id, class_id),
        cache_keys.classroom_study_plan_active(tenant_id, class_id),
        cache_keys.classroom_study_plan_source(tenant_id, class_id),
        cache_keys.import_current(tenant_id, class_id),
    ]
    await cache_delete(*keys)
    await _purge_enrolled_student_study_plan_caches(tenant_id, class_id)

    # Primary: O(1) tag-based invalidation
    tag = f"class:{class_id}"
    await invalidate_by_tag(tag)


async def invalidate_student_study_plan_cache(
    tenant_id: str, class_id: str, student_id: str
) -> None:
    await cache_delete(cache_keys.classroom_study_plan_student(tenant_id, class_id, student_id))


async def invalidate_student_progress_report_caches(tenant_id: str, student_id: str) -> None:
    """Drop all cached progress reports for a student across months/class filters.

    Uses O(1) tag-based invalidation as primary method.
    """
    # Primary: O(1) tag-based invalidation
    tag = f"student:{student_id}"
    deleted = await invalidate_by_tag(tag)

    # Fallback: pattern-based scanning if no tags found (migration period)
    if deleted == 0:
        redis = None
        try:
            from app.core.redis_client import get_redis
            redis = get_redis()
        except Exception:
            redis = None

        if redis:
            pattern = f"{cache_keys.tenant_prefix(tenant_id)}:report:{student_id}:*"
            try:
                batch: list[str] = []
                async for key in redis.scan_iter(match=pattern, count=100):
                    batch.append(key)
                    if len(batch) >= 100:
                        await redis.delete(*batch)
                        batch = []
                if batch:
                    await redis.delete(*batch)
            except Exception:
                _logger.exception("invalidate_student_progress_report_caches scan %s", pattern)


async def invalidate_study_plan_by_plan_id(plan_id: str) -> None:
    if not plan_id or str(plan_id).startswith("template::"):
        return
    try:
        admin = get_admin_client()
        row = (
            admin.table("study_plans")
            .select("tenant_id, class_id, template_id")
            .eq("id", plan_id)
            .maybe_single()
            .execute()
        )
        data = row.data if row else None
        if not data:
            return
        tenant_id = str(data.get("tenant_id") or "")
        class_id = data.get("class_id")
        if tenant_id and class_id:
            await invalidate_study_plan_caches(tenant_id, str(class_id))
        template_id = data.get("template_id")
        if tenant_id and template_id:
            await invalidate_study_plan_for_template(tenant_id, str(template_id))
    except Exception:
        _logger.exception("invalidate_study_plan_by_plan_id failed plan_id=%s", plan_id)


async def invalidate_study_plan_for_template(tenant_id: str, template_id: str) -> None:
    if not template_id:
        return
    try:
        admin = get_admin_client()
        res = (
            admin.table("study_plans")
            .select("class_id")
            .eq("tenant_id", tenant_id)
            .eq("template_id", template_id)
            .not_.is_("class_id", "null")
            .execute()
        )
        seen: set[str] = set()
        for row in res.data or []:
            cid = row.get("class_id")
            if cid and str(cid) not in seen:
                seen.add(str(cid))
                await invalidate_study_plan_caches(tenant_id, str(cid))
    except Exception:
        _logger.exception("invalidate_study_plan_for_template failed template_id=%s", template_id)
