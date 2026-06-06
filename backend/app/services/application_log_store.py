"""Application logs in Neon Postgres — HTTP requests, warnings, and errors."""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from asyncpg.exceptions import InterfaceError

from app.core import cache_keys
from app.core import cache_ttl
from app.core.cache_service import cache_delete, cache_get, cache_set, get_or_set_cache
from app.core.config import settings
from app.core.neon_db import get_neon_pool

_LOG_LIST_COLUMNS = """
    id, occurred_at, log_level, log_type, http_method, path, status_code,
    duration_ms, actor_user_id, tenant_id, actor_role, client_ip,
    user_agent, message, request_id, metadata
"""


logger = logging.getLogger(__name__)

_log_queue: Optional[asyncio.Queue] = None
_worker_task: Optional[asyncio.Task] = None
_shutting_down = False


def _safe_uuid(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError):
        return None


def is_shutting_down() -> bool:
    return _shutting_down


def _pool_unavailable(exc: BaseException) -> bool:
    if isinstance(exc, InterfaceError):
        msg = str(exc).lower()
        return "closing" in msg or "closed" in msg
    return False


def _level_from_status(status_code: Optional[int]) -> str:
    if status_code is None:
        return "info"
    if status_code >= 500:
        return "error"
    if status_code >= 400:
        return "warning"
    return "info"


def _row_to_dict(row: Any) -> dict[str, Any]:
    meta = row["metadata"]
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except json.JSONDecodeError:
            meta = {}
    return {
        "id": str(row["id"]),
        "occurred_at": row["occurred_at"].isoformat()
        if hasattr(row["occurred_at"], "isoformat")
        else str(row["occurred_at"]),
        "log_level": row["log_level"],
        "log_type": row["log_type"],
        "http_method": row["http_method"] or "",
        "path": row["path"] or "",
        "status_code": row["status_code"],
        "duration_ms": row["duration_ms"],
        "actor_user_id": str(row["actor_user_id"]) if row["actor_user_id"] else None,
        "tenant_id": str(row["tenant_id"]) if row["tenant_id"] else None,
        "actor_role": row["actor_role"],
        "client_ip": row["client_ip"],
        "user_agent": row["user_agent"],
        "message": row["message"],
        "request_id": row["request_id"],
        "metadata": meta or {},
    }


async def start_log_worker() -> None:
    global _log_queue, _worker_task, _shutting_down
    if get_neon_pool() is None:
        return
    _shutting_down = False
    _log_queue = asyncio.Queue(maxsize=20_000)
    _worker_task = asyncio.create_task(_drain_log_worker())


async def stop_log_worker() -> None:
    global _worker_task, _log_queue, _shutting_down
    _shutting_down = True
    if _worker_task and _log_queue is not None:
        try:
            await asyncio.wait_for(_log_queue.join(), timeout=2.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    _worker_task = None
    _log_queue = None


async def _drain_log_worker() -> None:
    assert _log_queue is not None
    while True:
        try:
            payload = await _log_queue.get()
        except asyncio.CancelledError:
            break
        try:
            row = await _insert_row(**payload)
            if row:
                await notify_audit_log_inserted(row)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            if not _pool_unavailable(exc):
                logger.exception("[application_log] worker insert failed")
        finally:
            _log_queue.task_done()


def schedule_application_log(_loop: asyncio.AbstractEventLoop, **payload: Any) -> None:
    """Enqueue from sync logging handlers without spawning orphan tasks."""
    if _shutting_down or get_neon_pool() is None or _log_queue is None:
        return
    try:
        _log_queue.put_nowait(payload)
    except asyncio.QueueFull:
        pass


async def enqueue_application_log(**payload: Any) -> None:
    if _shutting_down or get_neon_pool() is None:
        return
    if _log_queue is not None:
        try:
            _log_queue.put_nowait(payload)
            return
        except asyncio.QueueFull:
            logger.warning("[application_log] queue full, dropping log")
            return
    try:
        row = await _insert_row(**payload)
        if row:
            await notify_audit_log_inserted(row)
    except Exception as exc:
        if not _pool_unavailable(exc):
            logger.exception("[application_log] direct insert failed")


async def _insert_row(
    *,
    log_level: str = "info",
    log_type: str = "http_request",
    http_method: Optional[str] = None,
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    duration_ms: Optional[int] = None,
    actor_user_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    client_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    message: Optional[str] = None,
    request_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    pool = get_neon_pool()
    if not pool or _shutting_down:
        return None
    clean_meta = {k: v for k, v in (metadata or {}).items() if v is not None}
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                INSERT INTO application_logs (
                    log_level, log_type, http_method, path, status_code, duration_ms,
                    actor_user_id, tenant_id, actor_role, client_ip, user_agent,
                    message, request_id, metadata
                ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7::uuid, $8::uuid, $9, $10, $11,
                    $12, $13, $14::jsonb
                )
                RETURNING {_LOG_LIST_COLUMNS.strip()}
                """,
                log_level[:16],
                log_type[:32],
                (http_method[:16] if http_method else None),
                (path[:2048] if path else None),
                status_code,
                duration_ms,
                _safe_uuid(actor_user_id),
                _safe_uuid(tenant_id),
                (actor_role[:64] if actor_role else None),
                (client_ip[:128] if client_ip else None),
                (user_agent[:512] if user_agent else None),
                (message[:4000] if message else None),
                (request_id[:64] if request_id else None),
                json.dumps(clean_meta, default=str),
            )
    except InterfaceError:
        return None
    except Exception:
        if _shutting_down:
            return None
        raise
    if not row:
        return None
    return _row_to_dict(row)


async def notify_audit_log_inserted(entry: dict[str, Any]) -> None:
    """Bust list caches and push to super-admin SSE subscribers."""
    from app.services.audit_log_events import publish_audit_log_event

    await _purge_audit_log_list_cache(entry.get("tenant_id"))
    await publish_audit_log_event({"type": "log", "entry": entry})


async def _purge_audit_log_list_cache(tenant_id: Optional[str] = None) -> None:
    keys = [
        cache_keys.super_admin_audit_total(),
        cache_keys.super_admin_audit_total(tenant_id) if tenant_id else None,
        cache_keys.super_admin_audit_page(1, 50, None),
        cache_keys.super_admin_audit_page(1, 50, tenant_id) if tenant_id else None,
        cache_keys.super_admin_audit_page(1, 100, None),
    ]
    await cache_delete(*[k for k in keys if k])

    redis = None
    try:
        from app.core.redis_client import get_redis

        redis = get_redis()
    except Exception:
        redis = None

    if redis:
        prefix = cache_keys.key("platform", "super_admin", "audit_page")
        pattern = f"{prefix}*"
        try:
            batch: list[str] = []
            async for key in redis.scan_iter(match=pattern, count=100):
                batch.append(key)
                if len(batch) >= 100:
                    await cache_delete(*batch)
                    batch = []
            if batch:
                await cache_delete(*batch)
        except Exception:
            logger.exception("[application_log] audit page cache purge failed")


async def insert_http_request_log(
    *,
    http_method: str,
    path: str,
    status_code: Optional[int],
    duration_ms: Optional[int],
    actor_user_id: Optional[str],
    tenant_id: Optional[str],
    actor_role: Optional[str],
    client_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    level = _level_from_status(status_code)
    msg = f"{http_method} {path} → {status_code}"
    await enqueue_application_log(
        log_level=level,
        log_type="http_request",
        http_method=http_method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        actor_user_id=actor_user_id,
        tenant_id=tenant_id,
        actor_role=actor_role,
        client_ip=client_ip,
        user_agent=user_agent,
        message=msg,
        request_id=request_id,
        metadata=metadata,
    )


async def insert_app_event_log(
    *,
    log_level: str,
    message: str,
    log_type: str = "app_event",
    path: Optional[str] = None,
    http_method: Optional[str] = None,
    tenant_id: Optional[str] = None,
    actor_user_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    client_ip: Optional[str] = None,
    request_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    if _shutting_down:
        return
    if log_level not in ("info", "warning", "error"):
        log_level = "info"
    await enqueue_application_log(
        log_level=log_level,
        log_type=log_type,
        http_method=http_method,
        path=path,
        message=message[:4000],
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        client_ip=client_ip,
        request_id=request_id,
        metadata=metadata,
    )


async def _fetch_log_page(
    *,
    tenant_id: Optional[str],
    limit: int,
    offset: int,
) -> list[Any]:
    pool = get_neon_pool()
    assert pool is not None
    if tenant_id:
        list_sql = f"""
            SELECT {_LOG_LIST_COLUMNS}
            FROM application_logs
            WHERE tenant_id = $1::uuid
            ORDER BY occurred_at DESC
            LIMIT $2 OFFSET $3
        """
        list_args: tuple[Any, ...] = (tenant_id, limit, offset)
    else:
        list_sql = f"""
            SELECT {_LOG_LIST_COLUMNS}
            FROM application_logs
            ORDER BY occurred_at DESC
            LIMIT $1 OFFSET $2
        """
        list_args = (limit, offset)

    async with pool.acquire() as conn:
        return await conn.fetch(list_sql, *list_args)


async def _audit_total_cached(tenant_id: Optional[str]) -> int:
    cache_key = cache_keys.super_admin_audit_total(tenant_id)
    cached = await cache_get(cache_key)
    if cached is not None:
        return int(cached)

    pool = get_neon_pool()
    assert pool is not None
    async with pool.acquire() as conn:
        if tenant_id:
            total = await conn.fetchval(
                "SELECT count(*)::int FROM application_logs WHERE tenant_id = $1::uuid",
                tenant_id,
            )
        else:
            total = await conn.fetchval("SELECT count(*)::int FROM application_logs")

    total_int = int(total or 0)
    await cache_set(cache_key, total_int, cache_ttl.AUDIT_LOG_TOTAL)
    return total_int


async def list_application_logs(
    *,
    page: int = 1,
    limit: int = 100,
    tenant_id: Optional[str] = None,
) -> tuple[list[dict[str, Any]], int, bool]:
    pool = get_neon_pool()
    if not pool:
        raise RuntimeError("Application logs require DATABASE_URL (Neon Postgres)")

    page = max(1, page)
    limit = max(1, min(limit, 200))
    offset = (page - 1) * limit
    tid = _safe_uuid(tenant_id)

    async def _load_page() -> tuple[list[dict[str, Any]], int]:
        rows, total = await asyncio.gather(
            _fetch_log_page(tenant_id=tid, limit=limit, offset=offset),
            _audit_total_cached(tid),
        )
        return [_row_to_dict(r) for r in rows], total

    if page == 1:
        cache_key = cache_keys.super_admin_audit_page(page, limit, tid)
        payload, hit = await get_or_set_cache(
            cache_key,
            cache_ttl.AUDIT_LOG_PAGE,
            _load_page,
        )
        rows, total = payload
        return rows, total, hit

    rows, total = await _load_page()
    return rows, total, False


async def rotate_application_logs() -> dict[str, Any]:
    pool = get_neon_pool()
    if not pool:
        return {"skipped": True, "reason": "no_database_url"}

    days = settings.AUDIT_LOG_RETENTION_DAYS
    try:
        async with pool.acquire() as conn:
            tag = await conn.execute(
                "DELETE FROM application_logs WHERE occurred_at < now() - ($1::int * interval '1 day')",
                days,
            )
        removed = int(tag.split()[-1]) if tag and tag.split()[-1].isdigit() else 0
        await _purge_audit_log_list_cache()
        return {"removed": removed, "retention_days": days}
    except Exception:
        logger.exception("[application_log] rotate failed")
        return {"error": True}


async def purge_tenant_application_logs(tenant_id: str) -> int:
    pool = get_neon_pool()
    tid = _safe_uuid(tenant_id)
    if not pool or not tid:
        return 0
    try:
        tag = await pool.execute(
            "DELETE FROM application_logs WHERE tenant_id = $1::uuid",
            tid,
        )
        removed = int(tag.split()[-1]) if tag and tag.split()[-1].isdigit() else 0
        await _purge_audit_log_list_cache(tid)
        return removed
    except Exception:
        logger.exception("[application_log] purge tenant %s failed", tid)
        return 0
