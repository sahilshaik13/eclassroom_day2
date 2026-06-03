"""Lightweight pings so Neon + Supabase stay reachable (avoid long-idle suspension)."""
from __future__ import annotations

import logging
from typing import Any

from app.core.neon_db import get_neon_pool, init_neon_pool
from app.db.supabase import get_admin_client

_logger = logging.getLogger(__name__)


async def ping_neon() -> bool:
    """Neon Postgres (DATABASE_URL / application_logs)."""
    pool = get_neon_pool()
    if pool is None:
        pool = await init_neon_pool()
    if pool is None:
        return False
    try:
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1")
        return val == 1
    except Exception:
        _logger.exception("[keepalive] Neon ping failed")
        return False


def ping_supabase() -> bool:
    """Primary app database (Supabase PostgREST)."""
    try:
        admin = get_admin_client()
        admin.table("tenants").select("id").limit(1).execute()
        return True
    except Exception:
        _logger.exception("[keepalive] Supabase ping failed")
        return False


async def run_database_keepalive() -> dict[str, Any]:
    neon_ok = await ping_neon()
    supabase_ok = ping_supabase()
    out = {
        "neon": neon_ok,
        "supabase": supabase_ok,
        "ok": neon_ok and supabase_ok,
    }
    if out["ok"]:
        _logger.info("[keepalive] database ping ok neon=%s supabase=%s", neon_ok, supabase_ok)
    else:
        _logger.warning("[keepalive] partial failure %s", out)
    return out
