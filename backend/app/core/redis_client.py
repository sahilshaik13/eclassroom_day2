"""Shared async Redis client for cache, pub/sub, and ARQ."""
from __future__ import annotations

import logging
from typing import Optional

import redis.asyncio as aioredis

from app.core.config import settings

_logger = logging.getLogger(__name__)

_redis: Optional[aioredis.Redis] = None


async def init_redis() -> Optional[aioredis.Redis]:
    global _redis
    url = (settings.REDIS_URL or "").strip()
    if not url:
        _logger.warning("REDIS_URL not set — SSE import events and ARQ enqueue disabled")
        return None
    try:
        _redis = aioredis.from_url(url, decode_responses=True)
        await _redis.ping()
        _logger.info("Redis connected")
        return _redis
    except Exception:
        _logger.exception("Redis connection failed")
        _redis = None
        return None


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.close()
        _redis = None


def get_redis() -> Optional[aioredis.Redis]:
    return _redis
