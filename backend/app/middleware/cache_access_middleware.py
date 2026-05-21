"""Track hot class access for cache re-warm jobs."""
from __future__ import annotations

import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core import cache_keys
from app.core.redis_client import get_redis

_CLASSROOM_PATH = re.compile(r"/classrooms/([0-9a-fA-F-]{36})")


class CacheAccessMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        redis = get_redis()
        if redis and request.method == "GET":
            match = _CLASSROOM_PATH.search(request.url.path)
            if match:
                class_id = match.group(1)
                try:
                    await redis.incr(cache_keys.class_access_counter(class_id))
                    await redis.expire(cache_keys.class_access_counter(class_id), 86400)
                except Exception:
                    pass
        return response
