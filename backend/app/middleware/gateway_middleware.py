"""API gateway middleware — maintenance mode, IP blocks, and Redis rate limits."""
from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.cors import cors_allow_headers
from app.services.api_gateway_service import evaluate_request, get_gateway_config

_logger = logging.getLogger(__name__)


class GatewayMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        try:
            error_code, rate_result = await evaluate_request(request)
        except Exception:
            _logger.exception("[gateway] evaluation failed — allowing request")
            return await call_next(request)

        if error_code == "MAINTENANCE":
            config = await get_gateway_config()
            return JSONResponse(
                status_code=503,
                headers=cors_allow_headers(request),
                content={
                    "success": False,
                    "error": {
                        "code": "MAINTENANCE",
                        "message": config.get(
                            "maintenance_message",
                            "The API is temporarily unavailable for maintenance.",
                        ),
                    },
                },
            )

        if error_code == "IP_BLOCKED":
            return JSONResponse(
                status_code=403,
                headers=cors_allow_headers(request),
                content={
                    "success": False,
                    "error": {
                        "code": "IP_BLOCKED",
                        "message": "Access denied from this IP address.",
                    },
                },
            )

        if error_code == "RATE_LIMITED" and rate_result is not None:
            headers = cors_allow_headers(request)
            config = await get_gateway_config()
            if config.get("rate_limit_headers", True):
                headers.update(
                    {
                        "Retry-After": str(rate_result.retry_after),
                        "X-RateLimit-Limit": str(rate_result.limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(rate_result.reset_at),
                        "X-RateLimit-Policy": rate_result.policy,
                    }
                )
            return JSONResponse(
                status_code=429,
                headers=headers,
                content={
                    "success": False,
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "Too many requests. Please try again later.",
                        "retry_after": rate_result.retry_after,
                        "policy": rate_result.policy,
                    },
                },
            )

        response = await call_next(request)

        if rate_result is not None:
            config = await get_gateway_config()
            if config.get("rate_limit_headers", True):
                response.headers["X-RateLimit-Limit"] = str(rate_result.limit)
                response.headers["X-RateLimit-Remaining"] = str(rate_result.remaining)
                response.headers["X-RateLimit-Reset"] = str(rate_result.reset_at)
                if rate_result.policy:
                    response.headers["X-RateLimit-Policy"] = rate_result.policy

        return response
