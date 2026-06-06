"""Broadcast database changes for real-time sync between portals.

Uses Redis pub/sub as a bridge between FastAPI and the frontend.
When Supabase Realtime is enabled, these events also flow through
Supabase's realtime system for direct database change notifications.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.core.redis_client import get_redis

_logger = logging.getLogger(__name__)

# Must match frontend doubtChatRealtime.channelName()
DOUBT_CHAT_CHANNEL_PREFIX = "doubt-chat"
DOUBT_CHAT_BROADCAST_EVENT = "message"


def doubt_chat_channel_topic(tenant_id: str, class_id: str) -> str:
    """Topic must match supabase-js: channel('doubt-chat:…') → realtime:doubt-chat:…"""
    name = f"{DOUBT_CHAT_CHANNEL_PREFIX}:{tenant_id}:{class_id}"
    return name if name.startswith("realtime:") else f"realtime:{name}"


async def _supabase_realtime_broadcast(
    topic: str,
    event: str,
    payload: dict,
) -> None:
    """Push to Supabase Realtime so subscribed browsers receive text chat instantly."""
    base = (settings.SUPABASE_URL or "").rstrip("/")
    key = (settings.SUPABASE_SERVICE_ROLE_KEY or "").strip()
    if not base or not key or not topic:
        return

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    body = {
        "messages": [
            {
                "topic": topic,
                "event": event,
                "payload": payload,
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post(
                f"{base}/realtime/v1/api/broadcast",
                headers=headers,
                json=body,
            )
            if res.status_code >= 400:
                _logger.warning(
                    "Supabase doubt-chat broadcast failed status=%s body=%s",
                    res.status_code,
                    (res.text or "")[:240],
                )
    except Exception:
        _logger.exception("Supabase doubt-chat broadcast request failed topic=%s", topic)


async def broadcast_submission_reviewed(
    tenant_id: str,
    class_id: str,
    student_id: str,
    submission_id: str,
    task_id: str,
    score: Optional[int],
    status: str = "reviewed",
) -> None:
    """Broadcast when a teacher reviews a submission.
    
    The student portal subscribes to this event and invalidates
    its React Query caches to show the updated grade immediately.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        student_id: The student who submitted the work
        submission_id: The submission that was reviewed
        task_id: The task that was submitted
        score: The grade given (0-100), or None if not graded
        status: The review status (default: "reviewed")
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "submission_reviewed",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "student_id": student_id,
            "submission_id": submission_id,
            "task_id": task_id,
            "score": score,
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast submission_reviewed to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast submission_reviewed to %s", channel)


async def broadcast_new_submission(
    tenant_id: str,
    class_id: str,
    student_id: str,
    submission_id: str,
    task_id: str,
) -> None:
    """Broadcast when a student submits work.
    
    The teacher dashboard subscribes to this event and invalidates
    its pending queue cache to show the new submission immediately.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        student_id: The student who submitted the work
        submission_id: The newly created submission ID
        task_id: The task that was submitted
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "submission_created",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "student_id": student_id,
            "submission_id": submission_id,
            "task_id": task_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast submission_created to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast submission_created to %s", channel)


async def broadcast_study_plan_changed(
    tenant_id: str,
    class_id: str,
    changed_by: str,
    change_type: str = "updated",
) -> None:
    """Broadcast when study plan is modified by teacher or admin.
    
    Both student and teacher portals subscribe to refresh their views.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        changed_by: The user ID who made the change
        change_type: Type of change (updated, deleted, created)
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "study_plan_changed",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "changed_by": changed_by,
            "change_type": change_type,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast study_plan_changed to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast study_plan_changed to %s", channel)


async def broadcast_doubt_created(
    tenant_id: str,
    class_id: str,
    student_id: str,
    doubt_id: str,
    message_text: Optional[str] = None,
) -> None:
    """Broadcast when a student asks a new doubt.
    
    The teacher dashboard subscribes to refresh its doubts list.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        student_id: The student who asked the doubt
        doubt_id: The newly created doubt ID
        message_text: Optional preview of the doubt message
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "doubt_created",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "student_id": student_id,
            "doubt_id": doubt_id,
            "message_preview": message_text[:100] if message_text else None,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast doubt_created to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast doubt_created to %s", channel)


async def broadcast_doubt_chat_message(
    tenant_id: str,
    class_id: str,
    payload: dict,
) -> None:
    """Fan-out doubt text chat via Supabase Realtime (instant) and Redis (legacy listeners)."""
    topic = doubt_chat_channel_topic(tenant_id, class_id)
    await _supabase_realtime_broadcast(topic, DOUBT_CHAT_BROADCAST_EVENT, payload)

    redis = await get_redis()
    if not redis:
        return

    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "doubt_chat_message",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": payload,
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast doubt_chat_message to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast doubt_chat_message to %s", channel)


async def broadcast_doubt_replied(
    tenant_id: str,
    class_id: str,
    student_id: str,
    doubt_id: str,
    reply_text: Optional[str] = None,
) -> None:
    """Broadcast when a teacher replies to a doubt.
    
    The student portal subscribes to show the reply notification.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        student_id: The student who asked the doubt (receiver of reply)
        doubt_id: The doubt that was replied to
        reply_text: Optional preview of the reply
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "doubt_replied",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "student_id": student_id,
            "doubt_id": doubt_id,
            "reply_preview": reply_text[:100] if reply_text else None,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast doubt_replied to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast doubt_replied to %s", channel)


# ============================================================================
# Competition Realtime Events
# ============================================================================

async def broadcast_competition_created(
    tenant_id: str,
    competition_id: str,
    competition_name: str,
    created_by: str,
) -> None:
    """Broadcast when a new competition/exam is created.
    
    Students and teachers see the new competition immediately.
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The new competition ID
        competition_name: Name of the competition
        created_by: User ID who created the competition
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competitions"
    message = {
        "event": "competition_created",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "competition_name": competition_name,
            "created_by": created_by,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_created to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_created to %s", channel)


async def broadcast_competition_exam_active_changed(
    tenant_id: str,
    competition_id: str,
    competition_name: str,
    is_exam_active: bool,
) -> None:
    """Broadcast when admin opens or closes the exam window."""
    redis = await get_redis()
    if not redis:
        return

    channel = f"tenant:{tenant_id}:competitions"
    message = {
        "event": "competition_exam_active_changed",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "competition_name": competition_name,
            "is_exam_active": is_exam_active,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_exam_active_changed to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_exam_active_changed to %s", channel)


async def broadcast_competition_status_changed(
    tenant_id: str,
    competition_id: str,
    competition_name: str,
    old_status: str,
    new_status: str,
) -> None:
    """Broadcast when competition status changes (draft -> active -> closed).
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The competition ID
        competition_name: Name of the competition
        old_status: Previous status
        new_status: New status
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competitions"
    message = {
        "event": "competition_status_changed",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "competition_name": competition_name,
            "old_status": old_status,
            "new_status": new_status,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_status_changed to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_status_changed to %s", channel)


async def broadcast_competition_registration(
    tenant_id: str,
    competition_id: str,
    student_id: str,
    registration_id: str,
    student_name: Optional[str] = None,
) -> None:
    """Broadcast when a student registers for a competition.
    
    Teachers see registration count update in real-time.
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The competition ID
        student_id: The student who registered
        registration_id: The registration record ID
        student_name: Optional student name for display
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competition:{competition_id}"
    message = {
        "event": "competition_registration",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "student_id": student_id,
            "student_name": student_name,
            "registration_id": registration_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_registration to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_registration to %s", channel)


async def broadcast_competition_submitted(
    tenant_id: str,
    competition_id: str,
    student_id: str,
    registration_id: str,
) -> None:
    """Broadcast when a student submits their competition answers.
    
    Teachers see submission count update immediately.
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The competition ID
        student_id: The student who submitted
        registration_id: The registration record ID
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competition:{competition_id}"
    message = {
        "event": "competition_submitted",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "student_id": student_id,
            "registration_id": registration_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_submitted to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_submitted to %s", channel)


async def broadcast_competition_score_entered(
    tenant_id: str,
    competition_id: str,
    student_id: str,
    registration_id: str,
    score: int,
    total: int,
    graded_by: str,
) -> None:
    """Broadcast when a grader enters a score.
    
    Students see their results immediately; leaderboard updates live.
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The competition ID
        student_id: The student being graded
        registration_id: The registration record ID
        score: The score achieved
        total: Total possible score
        graded_by: User ID of the grader
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competition:{competition_id}"
    message = {
        "event": "competition_score_entered",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "student_id": student_id,
            "registration_id": registration_id,
            "score": score,
            "total": total,
            "percentage": round((score / total) * 100, 2) if total > 0 else 0,
            "graded_by": graded_by,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_score_entered to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_score_entered to %s", channel)


async def broadcast_competition_grader_assigned(
    tenant_id: str,
    competition_id: str,
    teacher_id: str,
    teacher_name: Optional[str] = None,
) -> None:
    """Broadcast when a grader is assigned to a competition.
    
    Args:
        tenant_id: The tenant/organization ID
        competition_id: The competition ID
        teacher_id: The teacher assigned as grader
        teacher_name: Optional teacher name for display
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:competition:{competition_id}"
    message = {
        "event": "competition_grader_assigned",
        "tenant_id": tenant_id,
        "payload": {
            "competition_id": competition_id,
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast competition_grader_assigned to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast competition_grader_assigned to %s", channel)


async def broadcast_day_unlocked(
    tenant_id: str,
    class_id: str,
    day_id: str,
    day_number: int,
    unlocked_by: str,
) -> None:
    """Broadcast when a study plan day is unlocked.
    
    Students see the new day available immediately.
    
    Args:
        tenant_id: The tenant/organization ID
        class_id: The classroom ID
        day_id: The day that was unlocked
        day_number: The day number in the study plan
        unlocked_by: The user ID who unlocked the day
    """
    redis = await get_redis()
    if not redis:
        return
    
    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": "day_unlocked",
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "day_id": day_id,
            "day_number": day_number,
            "unlocked_by": unlocked_by,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast day_unlocked to %s", channel)
    except Exception:
        _logger.exception("Failed to broadcast day_unlocked to %s", channel)


async def broadcast_class_meeting_changed(
    tenant_id: str,
    class_id: str,
    meeting: dict,
    *,
    event: str = "meeting_created",
) -> None:
    """Notify portals when a class Google Meet is created or removed."""
    redis = await get_redis()
    if not redis:
        return

    channel = f"tenant:{tenant_id}:class:{class_id}"
    message = {
        "event": event,
        "tenant_id": tenant_id,
        "class_id": class_id,
        "payload": {
            "meeting": meeting,
            "timestamp": datetime.utcnow().isoformat(),
        },
    }
    try:
        await redis.publish(channel, json.dumps(message))
        _logger.debug("Broadcast %s to %s", event, channel)
    except Exception:
        _logger.exception("Failed to broadcast %s to %s", event, channel)
