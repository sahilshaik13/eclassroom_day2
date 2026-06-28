"""API gateway configuration, rate limiting, and traffic stats (Redis-backed)."""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request

from app.core.config import settings
from app.core.redis_client import get_redis

_logger = logging.getLogger(__name__)

CONFIG_KEY = "gateway:config"
BLOCKED_IPS_KEY = "gateway:blocked_ips"
STATS_REQUESTS_KEY = "gateway:stats:requests"
STATS_BLOCKED_KEY = "gateway:stats:blocked"
STATS_RATE_LIMITED_KEY = "gateway:stats:rate_limited"
RATE_LIMIT_PREFIX = "gw:rl"

_LIMIT_RE = re.compile(r"^(\d+)\s*/\s*(second|minute|hour|day)s?$", re.I)

DEFAULT_POLICIES: dict[str, dict[str, Any]] = {
    "global": {"limit": "300/minute", "enabled": True},
    "auth": {"limit": settings.RATE_LIMIT_AUTH, "enabled": True},
    "public": {"limit": "60/minute", "enabled": True},
    "api": {"limit": settings.RATE_LIMIT_API, "enabled": True},
    "admin": {"limit": "200/minute", "enabled": True},
    "super_admin": {"limit": "300/minute", "enabled": True},
    "translate": {"limit": "30/minute", "enabled": True},
    "sse": {"limit": "20/minute", "enabled": True},
}

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": True,
    "maintenance_mode": False,
    "maintenance_message": "The API is temporarily unavailable for maintenance.",
    "trust_proxy": True,
    "rate_limit_headers": True,
    "policies": DEFAULT_POLICIES,
}


@dataclass
class RateLimitResult:
    allowed: bool
    policy: str
    limit: int
    remaining: int
    reset_at: int
    retry_after: int = 0


def parse_limit(limit_str: str) -> tuple[int, int]:
    """Parse '100/minute' into (max_requests, window_seconds)."""
    match = _LIMIT_RE.match((limit_str or "").strip())
    if not match:
        return 100, 60
    count = int(match.group(1))
    unit = match.group(2).lower()
    windows = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}
    return count, windows.get(unit, 60)


def classify_route(path: str) -> str:
    """Map request path to a gateway policy bucket."""
    if path in ("/health", "/api/ping", "/docs", "/redoc", "/openapi.json"):
        return "exempt"
    if path.startswith("/api/v1/super-admin/gateway"):
        return "exempt"
    if path.startswith("/api/v1/auth"):
        return "auth"
    if path.startswith("/api/v1/public"):
        return "public"
    if path.startswith("/api/v1/translate"):
        return "translate"
    if path.startswith("/api/v1/super-admin"):
        return "super_admin"
    if path.startswith("/api/v1/admin"):
        return "admin"
    if path.endswith("/events") or path.endswith("/stream"):
        return "sse"
    if path.startswith("/api/v1/"):
        return "api"
    return "exempt"


def get_client_ip(request: Request, trust_proxy: bool = True) -> str:
    if trust_proxy:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


def _today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def get_gateway_config() -> dict[str, Any]:
    redis = get_redis()
    if redis is None:
        return dict(DEFAULT_CONFIG)
    try:
        raw = await redis.get(CONFIG_KEY)
        if not raw:
            return dict(DEFAULT_CONFIG)
        stored = json.loads(raw)
        merged = dict(DEFAULT_CONFIG)
        merged.update({k: v for k, v in stored.items() if k != "policies"})
        policies = dict(DEFAULT_POLICIES)
        policies.update((stored.get("policies") or {}))
        merged["policies"] = policies
        return merged
    except Exception:
        _logger.exception("[gateway] failed to load config")
        return dict(DEFAULT_CONFIG)


async def save_gateway_config(config: dict[str, Any]) -> dict[str, Any]:
    redis = get_redis()
    current = await get_gateway_config()
    policies = dict(current.get("policies") or DEFAULT_POLICIES)
    if "policies" in config and isinstance(config["policies"], dict):
        for key, value in config["policies"].items():
            if key in DEFAULT_POLICIES and isinstance(value, dict):
                policies[key] = {**policies.get(key, {}), **value}
    merged = {
        "enabled": config.get("enabled", current.get("enabled", True)),
        "maintenance_mode": config.get("maintenance_mode", current.get("maintenance_mode", False)),
        "maintenance_message": config.get(
            "maintenance_message",
            current.get("maintenance_message", DEFAULT_CONFIG["maintenance_message"]),
        ),
        "trust_proxy": config.get("trust_proxy", current.get("trust_proxy", True)),
        "rate_limit_headers": config.get(
            "rate_limit_headers",
            current.get("rate_limit_headers", True),
        ),
        "policies": policies,
    }
    if redis is not None:
        await redis.set(CONFIG_KEY, json.dumps(merged))
    return merged


async def list_blocked_ips() -> list[str]:
    redis = get_redis()
    if redis is None:
        return []
    return sorted(await redis.smembers(BLOCKED_IPS_KEY))


async def block_ip(ip: str) -> None:
    redis = get_redis()
    if redis is None:
        raise RuntimeError("Redis is not configured")
    await redis.sadd(BLOCKED_IPS_KEY, ip.strip())


async def unblock_ip(ip: str) -> None:
    redis = get_redis()
    if redis is None:
        raise RuntimeError("Redis is not configured")
    await redis.srem(BLOCKED_IPS_KEY, ip.strip())


async def is_ip_blocked(ip: str) -> bool:
    redis = get_redis()
    if redis is None:
        return False
    return bool(await redis.sismember(BLOCKED_IPS_KEY, ip))


async def increment_stat(bucket: str, policy: str = "all") -> None:
    redis = get_redis()
    if redis is None:
        return
    day = _today_key()
    await redis.hincrby(f"{bucket}:{day}", policy, 1)
    await redis.expire(f"{bucket}:{day}", 86400 * 8)


async def check_rate_limit(
    *,
    policy: str,
    identifier: str,
    limit_str: str,
) -> RateLimitResult:
    max_requests, window = parse_limit(limit_str)
    now = int(time.time())
    window_start = now - (now % window)
    reset_at = window_start + window
    key = f"{RATE_LIMIT_PREFIX}:{policy}:{identifier}:{window_start}"

    redis = get_redis()
    if redis is None:
        return RateLimitResult(
            allowed=True,
            policy=policy,
            limit=max_requests,
            remaining=max_requests,
            reset_at=reset_at,
        )

    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, window + 1)

    remaining = max(0, max_requests - count)
    allowed = count <= max_requests
    retry_after = max(0, reset_at - now) if not allowed else 0
    return RateLimitResult(
        allowed=allowed,
        policy=policy,
        limit=max_requests,
        remaining=remaining,
        reset_at=reset_at,
        retry_after=retry_after,
    )


async def evaluate_request(request: Request) -> tuple[Optional[str], Optional[RateLimitResult]]:
    """
    Returns (error_code, rate_limit_result).
    error_code: 'MAINTENANCE' | 'IP_BLOCKED' | 'RATE_LIMITED' | None
    """
    if not settings.GATEWAY_ENABLED:
        return None, None

    config = await get_gateway_config()
    if not config.get("enabled", True):
        return None, None

    path = request.url.path
    policy_name = classify_route(path)
    if policy_name == "exempt":
        return None, None

    trust_proxy = bool(config.get("trust_proxy", True))
    client_ip = get_client_ip(request, trust_proxy)

    if await is_ip_blocked(client_ip):
        await increment_stat(STATS_BLOCKED_KEY, policy_name)
        return "IP_BLOCKED", None

    if config.get("maintenance_mode") and policy_name != "super_admin":
        return "MAINTENANCE", None

    policies = config.get("policies") or DEFAULT_POLICIES
    global_policy = policies.get("global") or DEFAULT_POLICIES["global"]
    route_policy = policies.get(policy_name) or DEFAULT_POLICIES.get(policy_name, DEFAULT_POLICIES["api"])

    checks: list[tuple[str, str]] = []
    if global_policy.get("enabled", True):
        checks.append(("global", str(global_policy.get("limit", "300/minute"))))
    if route_policy.get("enabled", True):
        checks.append((policy_name, str(route_policy.get("limit", "100/minute"))))

    last_result: Optional[RateLimitResult] = None
    for name, limit_str in checks:
        result = await check_rate_limit(
            policy=name,
            identifier=client_ip,
            limit_str=limit_str,
        )
        last_result = result
        if not result.allowed:
            await increment_stat(STATS_RATE_LIMITED_KEY, name)
            return "RATE_LIMITED", result

    await increment_stat(STATS_REQUESTS_KEY, policy_name)
    return None, last_result


async def get_gateway_stats() -> dict[str, Any]:
    redis = get_redis()
    day = _today_key()
    if redis is None:
        return {
            "date": day,
            "requests": {},
            "rate_limited": {},
            "blocked": {},
            "blocked_ips": [],
            "redis_available": False,
        }

    requests = await redis.hgetall(f"{STATS_REQUESTS_KEY}:{day}") or {}
    rate_limited = await redis.hgetall(f"{STATS_RATE_LIMITED_KEY}:{day}") or {}
    blocked = await redis.hgetall(f"{STATS_BLOCKED_KEY}:{day}") or {}
    blocked_ips = await list_blocked_ips()

    return {
        "date": day,
        "requests": {k: int(v) for k, v in requests.items()},
        "rate_limited": {k: int(v) for k, v in rate_limited.items()},
        "blocked": {k: int(v) for k, v in blocked.items()},
        "blocked_ips": blocked_ips,
        "redis_available": True,
    }


# ── OTP lockout ──────────────────────────────────────────────────────────────

def _otp_attempts_key(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    return f"otp:attempts:{digits}"


def _otp_lockout_key(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    return f"otp:lockout:{digits}"


async def check_otp_lockout(phone: str) -> Optional[int]:
    """Return remaining lockout seconds if locked, else None."""
    redis = get_redis()
    if redis is None:
        return None
    ttl = await redis.ttl(_otp_lockout_key(phone))
    return ttl if ttl and ttl > 0 else None


async def record_failed_otp_attempt(phone: str) -> Optional[int]:
    """Increment failed OTP attempts; return lockout seconds if now locked."""
    redis = get_redis()
    if redis is None:
        return None
    key = _otp_attempts_key(phone)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, settings.OTP_LOCKOUT_MINUTES * 60)
    if count >= settings.OTP_MAX_ATTEMPTS:
        lock_key = _otp_lockout_key(phone)
        await redis.setex(lock_key, settings.OTP_LOCKOUT_MINUTES * 60, "1")
        await redis.delete(key)
        return settings.OTP_LOCKOUT_MINUTES * 60
    return None


async def clear_otp_attempts(phone: str) -> None:
    redis = get_redis()
    if redis is None:
        return
    await redis.delete(_otp_attempts_key(phone), _otp_lockout_key(phone))
