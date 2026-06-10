"""Redis response cache + invalidation helpers."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import date
from functools import wraps
from typing import Any, Awaitable, Callable, Optional, TypeVar

from app.core import cache_keys
from app.core.redis_client import get_redis
from app.core.cache_tags import invalidate_by_tag, build_tags as _build_cache_tags

_logger = logging.getLogger(__name__)
T = TypeVar("T")

# In-flight factory tasks keyed by cache key. Concurrent requests for the
# same missing key share one factory invocation (request coalescing) instead
# of all hitting the DB / Supabase in parallel. Especially valuable for the
# study-plan endpoint where 20 students opening the same class within ~200ms
# would otherwise fan out 20 identical queries.
_in_flight: dict[str, asyncio.Future] = {}

# Cache metrics for performance monitoring
_cache_metrics = {
    "gets": {"hits": 0, "misses": 0, "errors": 0},
    "sets": {"success": 0, "errors": 0},
    "invalidations": {"count": 0, "keys_deleted": 0, "scan_duration_ms": 0},
}


async def cache_get(key: str) -> Optional[Any]:
    redis = get_redis()
    if not redis:
        _cache_metrics["gets"]["misses"] += 1
        return None
    try:
        raw = await redis.get(key)
        if raw is None:
            _cache_metrics["gets"]["misses"] += 1
            return None
        _cache_metrics["gets"]["hits"] += 1
        return json.loads(raw)
    except Exception:
        _cache_metrics["gets"]["errors"] += 1
        _logger.exception("cache_get failed for %s", key)
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    redis = get_redis()
    if not redis:
        return
    try:
        await redis.set(key, json.dumps(value, default=str), ex=ttl_seconds)
        _cache_metrics["sets"]["success"] += 1
    except Exception:
        _cache_metrics["sets"]["errors"] += 1
        _logger.exception("cache_set failed for %s", key)


async def cache_delete(*keys: str) -> None:
    redis = get_redis()
    if not redis or not keys:
        return
    try:
        await redis.delete(*keys)
    except Exception:
        _logger.exception("cache_delete failed")


async def acquire_upload_lock(class_id: str, ttl_seconds: int = 30) -> bool:
    redis = get_redis()
    if not redis:
        return True
    key = cache_keys.upload_lock(class_id)
    try:
        return bool(await redis.set(key, "1", nx=True, ex=ttl_seconds))
    except Exception:
        _logger.exception("acquire_upload_lock failed")
        return True


async def release_upload_lock(class_id: str) -> None:
    await cache_delete(cache_keys.upload_lock(class_id))


async def invalidate_class_caches(tenant_id: str, class_id: str) -> None:
    """Invalidate all caches for a class using tag-based O(1) lookup.

    Falls back to pattern-based scanning if tag-based returns 0 keys
    (for backward compatibility during migration).
    """
    # Primary: O(1) tag-based invalidation
    tag = f"class:{class_id}"
    keys_deleted = await invalidate_by_tag(tag)

    # Fallback: pattern-based scanning if no tags found (migration period)
    if keys_deleted == 0:
        redis = get_redis()
        if redis:
            pattern = f"{cache_keys.tenant_prefix(tenant_id)}:*:{class_id}:*"
            start_time = time.time()
            scan_keys = 0
            try:
                batch: list[str] = []
                async for key in redis.scan_iter(match=pattern, count=100):
                    batch.append(key)
                    if len(batch) >= 100:
                        await redis.delete(*batch)
                        scan_keys += len(batch)
                        batch = []
                if batch:
                    await redis.delete(*batch)
                    scan_keys += len(batch)
                duration_ms = (time.time() - start_time) * 1000
                _cache_metrics["invalidations"]["count"] += 1
                _cache_metrics["invalidations"]["keys_deleted"] += scan_keys
                _cache_metrics["invalidations"]["scan_duration_ms"] += duration_ms
                if duration_ms > 100:  # Log slow invalidations
                    _logger.warning(
                        "Slow cache invalidation: pattern=%s keys=%s duration=%.2fms",
                        pattern, scan_keys, duration_ms
                    )
            except Exception:
                _logger.exception("invalidate_class_caches pattern %s", pattern)

    # Always invalidate related caches
    from app.services.study_plan_cache_service import invalidate_study_plan_caches
    await invalidate_study_plan_caches(tenant_id, class_id)
    await cache_delete(cache_keys.class_progress_hash(tenant_id, class_id))

    # Invalidate teacher caches
    try:
        from app.db.supabase import get_admin_client

        row = (
            get_admin_client()
            .table("classes")
            .select("teacher_id")
            .eq("id", class_id)
            .maybe_single()
            .execute()
        )
        teacher_id = (row.data or {}).get("teacher_id") if row else None
        if teacher_id:
            await invalidate_teacher_caches(tenant_id, str(teacher_id))
    except Exception:
        _logger.exception("invalidate_class_caches teacher lookup failed class=%s", class_id)


async def invalidate_student_caches(tenant_id: str, student_id: str) -> None:
    await cache_delete(
        cache_keys.today_tasks(tenant_id, student_id),
        cache_keys.student_doubts(tenant_id, student_id),
    )


async def invalidate_public_tenant(slug: str) -> None:
    if slug:
        await cache_delete(cache_keys.public_tenant(slug.strip().lower()))


async def invalidate_teacher_pulse(tenant_id: str, teacher_id: str) -> None:
    await invalidate_teacher_caches(tenant_id, teacher_id)


async def invalidate_teacher_caches(tenant_id: str, teacher_id: str) -> None:
    """Teacher dashboard, pulse, and bundled BFF cache."""
    await cache_delete(
        cache_keys.teacher_pulse(tenant_id, teacher_id),
        cache_keys.teacher_dashboard(tenant_id, teacher_id),
    )


async def get_or_set_cache(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> tuple[T, bool]:
    """Return (value, cache_hit). Skips Redis if unavailable."""
    cached = await cache_get(key)
    if cached is not None:
        return cached, True
    value = await factory()
    await cache_set(key, value, ttl_seconds)
    return value, False


async def coalesced_get_or_set(
    key: str,
    ttl_seconds: int,
    factory: Callable[[], Awaitable[T]],
) -> tuple[T, bool]:
    """
    Same as get_or_set_cache but with request coalescing: when N coroutines
    ask for the same missing key at the same time, only one factory runs and
    the rest await the same Future. Eliminates thundering-herd on hot keys
    like the per-class study plan when 20 students open the same class.

    Race-free exception handling: the in-flight Future is the single
    source of truth. The first caller awaits the factory directly and
    sets the result/exception on the Future; all subsequent callers
    await the Future and receive the same outcome. No orphan tasks,
    no "future exception was never retrieved" warnings.
    """
    cached = await cache_get(key)
    if cached is not None:
        return cached, True

    existing = _in_flight.get(key)
    if existing is not None and not existing.done():
        value = await existing
        return value, False

    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()
    _in_flight[key] = fut

    try:
        value = await factory()
        # Schedule the cache write without blocking the hot path.
        try:
            loop.create_task(cache_set(key, value, ttl_seconds))
        except RuntimeError:
            await cache_set(key, value, ttl_seconds)
        if not fut.done():
            fut.set_result(value)
        return value, False
    except Exception as exc:
        if not fut.done():
            fut.set_exception(exc)
        raise
    finally:
        # If no one awaited the future (no other waiters), the future
        # still holds the exception. Call .exception() to mark it
        # retrieved so asyncio doesn't warn. The first caller already
        # has the value/exception from the direct return/raise above.
        _in_flight.pop(key, None)
        if fut.done() and not fut.cancelled():
            try:
                # This marks the future as "retrieved" internally.
                fut.exception()
            except (asyncio.CancelledError, asyncio.InvalidStateError):
                pass


async def invalidate_caches_for_student_activity(tenant_id: str, student_id: str) -> None:
    """Student task list + enrolled teachers' dashboards."""
    day = date.today().isoformat()
    await cache_delete(cache_keys.student_tasks_today(tenant_id, student_id, day))
    await invalidate_student_caches(tenant_id, student_id)

    try:
        from app.db.supabase import get_admin_client

        admin = get_admin_client()
        enr = (
            admin.table("class_enrollments")
            .select("classes(teacher_id)")
            .eq("student_id", student_id)
            .execute()
        )
        teacher_ids: set[str] = set()
        for row in enr.data or []:
            cls = row.get("classes") or {}
            tid = cls.get("teacher_id")
            if tid:
                teacher_ids.add(str(tid))
        keys_to_delete: list[str] = []
        for teacher_id in teacher_ids:
            keys_to_delete.append(
                cache_keys.teacher_student_overview(tenant_id, teacher_id, student_id)
            )
            keys_to_delete.extend(
                [
                    cache_keys.teacher_pulse(tenant_id, teacher_id),
                    cache_keys.teacher_dashboard(tenant_id, teacher_id),
                ]
            )
        if keys_to_delete:
            await cache_delete(*keys_to_delete)
        from app.services.study_plan_cache_service import (
            invalidate_student_progress_report_caches,
        )

        await invalidate_student_progress_report_caches(tenant_id, student_id)
    except Exception:
        _logger.exception(
            "invalidate_caches_for_student_activity teachers failed student=%s",
            student_id,
        )


def cached_response(key_fn: Callable[..., str], ttl_seconds: int):
    """Decorator for async route handlers returning JSONResponse via success()."""

    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            from fastapi.responses import JSONResponse
            from app.core.response import success

            cache_key = key_fn(*args, **kwargs)
            hit = await cache_get(cache_key)
            if hit is not None:
                response = JSONResponse(content=hit)
                response.headers["X-Cache"] = "HIT"
                return response

            result = await fn(*args, **kwargs)
            if isinstance(result, JSONResponse):
                try:
                    body = json.loads(result.body.decode())
                    if body.get("success"):
                        await cache_set(cache_key, body, ttl_seconds)
                except Exception:
                    pass
                result.headers["X-Cache"] = "MISS"
            return result

        return wrapper

    return decorator


def get_cache_metrics() -> dict:
    """Return current cache metrics for monitoring."""
    total_gets = _cache_metrics["gets"]["hits"] + _cache_metrics["gets"]["misses"]
    hit_rate = (
        (_cache_metrics["gets"]["hits"] / total_gets * 100) if total_gets > 0 else 0
    )
    return {
        "hit_rate_percent": round(hit_rate, 2),
        **_cache_metrics,
    }


def reset_cache_metrics() -> None:
    """Reset cache metrics counters."""
    _cache_metrics["gets"] = {"hits": 0, "misses": 0, "errors": 0}
    _cache_metrics["sets"] = {"success": 0, "errors": 0}
    _cache_metrics["invalidations"] = {"count": 0, "keys_deleted": 0, "scan_duration_ms": 0}
