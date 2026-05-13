"""
Write API audit events to `audit_log_recent` and trigger rotation into `audit_log_archive`.

Rotation is implemented in SQL (`rotate_audit_logs`) and invoked periodically from the
app lifespan and optionally via pg_cron.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from supabase import Client

logger = logging.getLogger(__name__)


def _safe_uuid(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError):
        return None


def _is_missing_actor_fk_violation(exc: Exception) -> bool:
    blob = " ".join(
        str(part)
        for part in (
            getattr(exc, "code", ""),
            getattr(exc, "details", ""),
            getattr(exc, "message", ""),
            exc,
        )
        if part
    )
    return "23503" in blob and "audit_log_recent_actor_user_id_fkey" in blob


def insert_audit_event(
    admin: Client,
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
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    actor_uuid = _safe_uuid(actor_user_id)
    clean_metadata = {k: v for k, v in (metadata or {}).items() if v is not None}
    row = {
        "http_method": http_method[:16],
        "path": path[:2048],
        "status_code": status_code,
        "duration_ms": duration_ms,
        "actor_user_id": actor_uuid,
        "tenant_id": _safe_uuid(tenant_id),
        "actor_role": (actor_role[:64] if actor_role else None),
        "client_ip": (client_ip[:128] if client_ip else None),
        "user_agent": (user_agent[:512] if user_agent else None),
        "metadata": clean_metadata,
    }
    try:
        admin.table("audit_log_recent").insert(row).execute()
    except Exception as exc:
        if actor_uuid and _is_missing_actor_fk_violation(exc):
            fallback_metadata = dict(clean_metadata)
            fallback_metadata.setdefault("unresolved_actor_user_id", actor_uuid)
            fallback_row = {
                **row,
                "actor_user_id": None,
                "metadata": fallback_metadata,
            }
            try:
                admin.table("audit_log_recent").insert(fallback_row).execute()
                logger.warning(
                    "[audit_log] actor_user_id missing in users; recorded path=%s without FK link",
                    path,
                )
                return
            except Exception:
                logger.exception("[audit_log] fallback insert failed path=%s", path)
                return
        logger.exception("[audit_log] insert failed path=%s", path)


def rotate_audit_logs(admin: Client) -> dict[str, Any]:
    """Move rows older than 7 days to archive; purge archive older than 37 days."""
    try:
        res = admin.rpc("rotate_audit_logs").execute()
        raw = getattr(res, "data", None)
        return raw if isinstance(raw, dict) else {}
    except Exception:
        logger.exception("[audit_log] rotate_audit_logs RPC failed")
        return {}
