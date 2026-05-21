"""Redis pub/sub for study-plan import status (SSE)."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.core.redis_client import get_redis

_logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "study_plan_import:"


def channel_for_class(class_id: str) -> str:
    return f"{CHANNEL_PREFIX}{class_id}"


async def publish_import_event(
    class_id: str,
    *,
    import_id: Optional[str] = None,
    ocr_status: Optional[str] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    redis = get_redis()
    if not redis or not class_id:
        return
    message: dict[str, Any] = {"class_id": class_id}
    if import_id:
        message["import_id"] = import_id
    if ocr_status:
        message["ocr_status"] = ocr_status
    if payload:
        message["import"] = payload
    try:
        await redis.publish(channel_for_class(class_id), json.dumps(message, default=str))
    except Exception:
        _logger.exception("publish_import_event failed for class %s", class_id)
