"""
Logs each HTTP request to Redis audit storage (all status codes, best-effort).

JWT claims are read without signature verification for logging only — never used for auth.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Optional, Tuple

import jwt as pyjwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

_SKIP_EXACT = frozenset(
    {
        "/health",
        "/api/ping",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/favicon.ico",
    }
)
_SKIP_PREFIXES = ("/docs/", "/redoc/")


def _should_skip_audit(path: str) -> bool:
    if path in _SKIP_EXACT:
        return True
    return any(path.startswith(p) for p in _SKIP_PREFIXES)


def _peek_auth(authorization: Optional[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if not authorization or not authorization.startswith("Bearer "):
        return None, None, None
    token = authorization[7:].strip()
    if not token:
        return None, None, None
    try:
        payload = pyjwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_exp": False,
            },
            algorithms=["HS256", "ES256", "RS256"],
        )
    except Exception:
        return None, None, None
    sub = payload.get("sub")
    app_meta = payload.get("app_metadata") or {}
    tenant_id = app_meta.get("tenant_id")
    role = app_meta.get("role")
    uid = str(sub) if sub else None
    tid = str(tenant_id) if tenant_id else None
    r = str(role) if role else None
    return uid, tid, r


async def _persist_audit(
    *,
    http_method: str,
    path: str,
    status_code: Optional[int],
    duration_ms: int,
    actor_user_id: Optional[str],
    tenant_id: Optional[str],
    actor_role: Optional[str],
    client_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
    metadata: dict,
) -> None:
    from app.services.audit_log_service import record_audit_event

    try:
        await record_audit_event(
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
    except Exception:
        logger.exception("[audit_middleware] failed to record request")


class AuditLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if _should_skip_audit(path):
            return await call_next(request)

        started = time.perf_counter()
        response: Optional[Response] = None
        try:
            response = await call_next(request)
            return response
        finally:
            duration_ms = int((time.perf_counter() - started) * 1000)
            status = response.status_code if response else None
            uid, tid, role = _peek_auth(request.headers.get("authorization"))
            client = request.client.host if request.client else None
            ua = request.headers.get("user-agent")
            meta: dict = {}
            if request.url.query:
                meta["query"] = str(request.url.query)[:512]

            request_id = getattr(request.state, "request_id", None)
            asyncio.create_task(
                _persist_audit(
                    http_method=request.method,
                    path=path,
                    status_code=status,
                    duration_ms=duration_ms,
                    actor_user_id=uid,
                    tenant_id=tid,
                    actor_role=role,
                    client_ip=client,
                    user_agent=ua,
                    request_id=request_id,
                    metadata=meta,
                )
            )
