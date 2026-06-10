"""
Application logs for super-admin — stored in Neon Postgres (DATABASE_URL).

Includes HTTP requests (all status codes), Python warnings/errors, and unhandled exceptions.
"""
from __future__ import annotations

from typing import Any, Optional

from app.services import application_log_store


async def record_audit_event(
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
    await application_log_store.insert_http_request_log(
        http_method=http_method,
        path=path,
        status_code=status_code,
        duration_ms=duration_ms,
        actor_user_id=actor_user_id,
        tenant_id=tenant_id,
        actor_role=actor_role,
        client_ip=client_ip,
        user_agent=user_agent,
        request_id=request_id,
        metadata=metadata,
    )


async def list_audit_events(
    *,
    page: int = 1,
    limit: int = 100,
    tenant_id: Optional[str] = None,
    before_id: Optional[int] = None,
) -> tuple[list[dict[str, Any]], int, bool]:
    """
    Returns (rows, total, cache_hit).

    `before_id` enables keyset pagination: rows are ordered by id DESC,
    and the query uses `WHERE id < $before_id` so it stays
    O(limit) regardless of how deep the user has scrolled. Legacy
    OFFSET mode (via `page`) is retained for shallow pages but the
    frontend should migrate to keyset for pagination beyond page 1.
    """
    return await application_log_store.list_application_logs(
        page=page,
        limit=limit,
        tenant_id=tenant_id,
        before_id=before_id,
    )


async def rotate_audit_logs() -> dict[str, Any]:
    return await application_log_store.rotate_application_logs()


async def purge_tenant_audit_logs(tenant_id: str) -> int:
    return await application_log_store.purge_tenant_application_logs(tenant_id)
