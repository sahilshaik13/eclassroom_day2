"""Slim ARQ worker for dev - OCR + essential cron only.

ARQ's CLI only reads attributes on this class's __dict__, not inherited ones.
Re-declare redis_settings (and other Worker kwargs) so cloud REDIS_URL is used.
"""
from arq.cron import cron

from app.worker import tasks
from app.worker.settings import WorkerSettings, build_redis_settings


class LocalWorkerSettings(WorkerSettings):
    # Required on this class (ARQ get_kwargs ignores parent-class attributes):
    redis_settings = build_redis_settings()
    functions = WorkerSettings.functions
    on_startup = WorkerSettings.on_startup
    on_shutdown = WorkerSettings.on_shutdown
    max_jobs = WorkerSettings.max_jobs
    job_timeout = WorkerSettings.job_timeout

    cron_jobs = [
        cron(tasks.refresh_materialized_views, hour={0, 6, 12, 18}, minute=5),
        cron(tasks.unlock_study_plan_days, hour=0, minute=15),
    ]
