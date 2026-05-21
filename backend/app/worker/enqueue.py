"""Enqueue ARQ jobs from the API process."""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings
from app.worker import tasks

_logger = logging.getLogger(__name__)

_arq_pool: Any = None


async def init_arq_pool() -> None:
    global _arq_pool
    if not (settings.REDIS_URL or "").strip():
        return
    try:
        _arq_pool = await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))
        _logger.info("ARQ pool ready")
    except Exception:
        _logger.exception("ARQ pool init failed")
        _arq_pool = None


async def close_arq_pool() -> None:
    global _arq_pool
    if _arq_pool is not None:
        await _arq_pool.close()
        _arq_pool = None


async def enqueue_study_plan_upload(import_id: str) -> None:
    if _arq_pool:
        await _arq_pool.enqueue_job("process_study_plan_upload", import_id)
        return
    _logger.warning("ARQ pool unavailable — running OCR upload inline")
    asyncio.create_task(tasks.process_study_plan_upload({"redis": None}, import_id))


async def enqueue_study_plan_apply(
    import_id: str,
    tenant_id: str,
    user_id: str,
    payload: dict,
) -> None:
    if _arq_pool:
        await _arq_pool.enqueue_job(
            "apply_study_plan_import_job",
            import_id,
            tenant_id,
            user_id,
            payload,
        )
        return
    _logger.warning("ARQ pool unavailable — running study plan apply inline")
    asyncio.create_task(
        tasks.apply_study_plan_import_job(
            {"redis": None},
            import_id,
            tenant_id,
            user_id,
            payload,
        )
    )
