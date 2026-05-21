"""Async connection pool for Neon Postgres (application logs)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import asyncpg

from app.core.config import settings

_logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None

_SCHEMA_PATH = Path(__file__).resolve().parent.parent.parent / "neon" / "migrations" / "001_application_logs.sql"


def _schema_statements() -> list[str]:
    """Split migration file into statements (asyncpg runs one per execute)."""
    raw = _SCHEMA_PATH.read_text(encoding="utf-8")
    statements: list[str] = []
    for block in raw.split(";"):
        lines = [
            ln
            for ln in block.strip().splitlines()
            if ln.strip() and not ln.strip().startswith("--")
        ]
        stmt = "\n".join(lines).strip()
        if stmt:
            statements.append(stmt)
    return statements


def get_log_database_url() -> str:
    return (settings.DATABASE_URL or "").strip()


async def init_neon_pool() -> Optional[asyncpg.Pool]:
    global _pool
    url = get_log_database_url()
    if not url:
        _logger.warning("DATABASE_URL not set — application logs disabled")
        return None
    try:
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=8, command_timeout=30)
        async with _pool.acquire() as conn:
            for stmt in _schema_statements():
                await conn.execute(stmt)
        _logger.info("Neon application_logs pool ready")
        return _pool
    except Exception:
        _logger.exception("Neon pool init failed")
        _pool = None
        return None


async def close_neon_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_neon_pool() -> Optional[asyncpg.Pool]:
    return _pool
