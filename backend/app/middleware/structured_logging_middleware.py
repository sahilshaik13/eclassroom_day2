from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = structlog.get_logger("http")


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            token = getattr(request.state, "token_data", None)
            logger.info(
                "request",
                request_id=request_id,
                path=request.url.path,
                method=request.method,
                status_code=status_code,
                duration_ms=duration_ms,
                tenant_id=getattr(token, "tenant_id", None),
                actor_id=getattr(token, "user_id", None),
            )
