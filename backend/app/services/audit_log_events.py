"""Redis pub/sub for super-admin application log stream (SSE)."""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.redis_client import get_redis

_logger = logging.getLogger(__name__)

CHANNEL = "super_admin:audit_logs"


async def publish_audit_log_event(payload: dict[str, Any]) -> None:
    redis = get_redis()
    if not redis:
        return
    try:
        await redis.publish(CHANNEL, json.dumps(payload, default=str))
    except Exception:
        _logger.exception("publish_audit_log_event failed")
