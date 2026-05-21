"""CORS helpers — ensure error responses still include allow-origin when the browser sent one."""
from __future__ import annotations

from starlette.requests import Request

from app.core.config import settings


def cors_allow_headers(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    if not origin:
        return {}
    normalized = origin.rstrip("/")
    if not settings.is_origin_allowed(normalized):
        return {}
    return {
        "Access-Control-Allow-Origin": normalized,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }
