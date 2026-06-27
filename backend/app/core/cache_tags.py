"""Tag-based cache invalidation - O(1) instead of O(n) scanning.

This module provides an alternative to pattern-based cache invalidation
which requires scanning all Redis keys. Instead, we maintain indexes
of tags to keys, allowing O(1) invalidation by tag.

Usage:
    # Store with tags
    await set_with_tags(
        key="tenant:123:class:456:plan",
        value=plan_data,
        ttl=300,
        tags=["tenant:123", "class:456"]
    )

    # Invalidate by tag (O(1) lookup)
    await invalidate_by_tag("class:456")
"""

import json
import logging
from typing import Any, Optional

from app.core.redis_client import get_redis

_logger = logging.getLogger(__name__)

# Prefix for tag index keys in Redis
_TAG_PREFIX = "tagidx:"


async def set_with_tags(
    key: str,
    value: Any,
    ttl: int,
    tags: list[str],
) -> None:
    """Store a value with metadata tags for targeted invalidation.

    Args:
        key: The cache key
        value: The value to cache (will be JSON serialized)
        ttl: Time-to-live in seconds
        tags: List of tags to associate with this key (e.g., ["tenant:123", "class:456"])
    """
    redis = get_redis()
    if not redis:
        return

    pipe = redis.pipeline()

    # Store the value
    pipe.setex(key, ttl, json.dumps(value, default=str))

    # Add to tag indexes (use Redis Sets for O(1) add/remove)
    tag_ttl = ttl + 60  # Tags outlive data slightly
    for tag in tags:
        tag_key = f"{_TAG_PREFIX}{tag}"
        pipe.sadd(tag_key, key)
        pipe.expire(tag_key, tag_ttl)

    await pipe.execute()


async def invalidate_by_tag(tag: str) -> int:
    """Invalidate all keys associated with a tag. O(1) lookup.

    Args:
        tag: The tag to invalidate (e.g., "class:456")

    Returns:
        Number of keys deleted
    """
    redis = get_redis()
    if not redis:
        return 0

    tag_key = f"{_TAG_PREFIX}{tag}"

    # Get all keys for this tag (O(1) for set members)
    keys = await redis.smembers(tag_key)
    if not keys:
        return 0

    # Convert bytes to strings if needed
    key_list = [k.decode() if isinstance(k, bytes) else k for k in keys]

    # Delete all keys and the tag index
    pipe = redis.pipeline()
    for key in key_list:
        pipe.delete(key)
    pipe.delete(tag_key)

    await pipe.execute()

    _logger.debug("Invalidated %d keys for tag %s", len(key_list), tag)
    return len(key_list)


async def invalidate_by_tags(tags: list[str]) -> int:
    """Invalidate keys associated with any of the provided tags.

    Args:
        tags: List of tags to invalidate

    Returns:
        Total number of keys deleted
    """
    total = 0
    for tag in tags:
        total += await invalidate_by_tag(tag)
    return total


async def get_keys_by_tag(tag: str) -> list[str]:
    """Get all keys associated with a tag (for debugging).

    Args:
        tag: The tag to look up

    Returns:
        List of keys associated with the tag
    """
    redis = get_redis()
    if not redis:
        return []

    tag_key = f"{_TAG_PREFIX}{tag}"
    keys = await redis.smembers(tag_key)
    return [k.decode() if isinstance(k, bytes) else k for k in keys]


async def remove_from_tag(tag: str, key: str) -> None:
    """Remove a specific key from a tag index.

    Args:
        tag: The tag index
        key: The key to remove
    """
    redis = get_redis()
    if not redis:
        return

    tag_key = f"{_TAG_PREFIX}{tag}"
    await redis.srem(tag_key, key)


def build_tags(
    tenant_id: Optional[str] = None,
    class_id: Optional[str] = None,
    student_id: Optional[str] = None,
    plan_id: Optional[str] = None,
) -> list[str]:
    """Build standard tag list from entity IDs.

    Args:
        tenant_id: Optional tenant ID
        class_id: Optional class ID
        student_id: Optional student ID
        plan_id: Optional plan ID

    Returns:
        List of tags for use with set_with_tags
    """
    tags = []
    if tenant_id:
        tags.append(f"tenant:{tenant_id}")
    if class_id:
        tags.append(f"class:{class_id}")
    if student_id:
        tags.append(f"student:{student_id}")
    if plan_id:
        tags.append(f"plan:{plan_id}")
    return tags
