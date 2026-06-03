"""ARQ worker settings — run: arq app.worker.settings.WorkerSettings"""
from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import settings
from app.core.neon_db import close_neon_pool, init_neon_pool
from app.worker import tasks


def build_redis_settings() -> RedisSettings:
    url = (settings.REDIS_URL or "").strip()
    if not url:
        raise RuntimeError(
            "REDIS_URL is not set. Add your cloud Redis URL to backend/.env and restart the worker."
        )
    if "127.0.0.1" in url or "localhost" in url:
        raise RuntimeError(
            "REDIS_URL points at localhost. Use your Redis Cloud URL in backend/.env."
        )
    return RedisSettings.from_dsn(url)


async def worker_startup(ctx: dict) -> None:
    await init_neon_pool()


async def worker_shutdown(ctx: dict) -> None:
    await close_neon_pool()


class WorkerSettings:
    on_startup = worker_startup
    on_shutdown = worker_shutdown
    functions = [
        tasks.process_study_plan_upload,
        tasks.poll_study_plan_import,
        tasks.apply_study_plan_import_job,
        tasks.refresh_materialized_views,
        tasks.rotate_audit_logs_job,
        tasks.database_keepalive_job,
        tasks.unlock_study_plan_days,
        tasks.rewarm_hot_caches,
    ]
    redis_settings = build_redis_settings()
    max_jobs = 10
    job_timeout = 600
    cron_jobs = [
        cron(tasks.refresh_materialized_views, hour={0, 6, 12, 18}, minute=5),
        cron(tasks.rewarm_hot_caches, minute={0, 30}),
        cron(tasks.unlock_study_plan_days, hour=0, minute=15),
        cron(tasks.rotate_audit_logs_job, hour=3, minute=0),
        # Daily DB keepalive (Neon + Supabase) — avoids inactive / autosuspend from no traffic
        cron(tasks.database_keepalive_job, hour=4, minute=30),
    ]
