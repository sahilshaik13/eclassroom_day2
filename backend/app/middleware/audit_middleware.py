"""
Logs each HTTP request to `audit_log_recent` (best-effort, non-blocking for failures).

JWT claims are read without signature verification for logging only — never used for auth.
"""
from __future__ import annotations

import logging
import time
from typing import Callable, Optional, Tuple

import jwt as pyjwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.db.supabase import get_admin_client

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
            try:
                duration_ms = int((time.perf_counter() - started) * 1000)
                status = response.status_code if response else None
                auth = request.headers.get("authorization")
                uid, tid, role = _peek_auth(auth)
                client = request.client.host if request.client else None
                ua = request.headers.get("user-agent")

                admin = get_admin_client()
                from app.services.audit_log_service import insert_audit_event

                meta: dict = {}
                if request.url.query:
                    meta["query"] = str(request.url.query)[:512]

                insert_audit_event(
                    admin,
                    http_method=request.method,
                    path=path,
                    status_code=status,
                    duration_ms=duration_ms,
                    actor_user_id=uid,
                    tenant_id=tid,
                    actor_role=role,
                    client_ip=client,
                    user_agent=ua,
                    metadata=meta,
                )
            except Exception:
                logger.exception("[audit_middleware] failed to record request")
