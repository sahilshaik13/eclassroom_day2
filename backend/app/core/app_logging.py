"""Capture Python warnings/errors into Neon application_logs."""
from __future__ import annotations

import logging
from typing import Any, Optional

from starlette.requests import Request

from app.services import application_log_store


class NeonApplicationLogHandler(logging.Handler):
    """Persist WARNING/ERROR log records to Neon (non-blocking queue)."""

    def emit(self, record: logging.LogRecord) -> None:
        if record.levelno < logging.WARNING:
            return
        level = "warning" if record.levelno < logging.ERROR else "error"
        message = record.getMessage()
        meta: dict[str, Any] = {
            "logger": record.name,
            "module": record.module,
            "funcName": record.funcName,
            "lineno": record.lineno,
        }
        if record.exc_info:
            import traceback

            meta["exc_info"] = "".join(traceback.format_exception(*record.exc_info))[:8000]

        try:
            import asyncio

            loop = asyncio.get_running_loop()
            if application_log_store.is_shutting_down():
                return
            application_log_store.schedule_application_log(
                loop,
                log_level=level,
                log_type="app_event",
                message=message,
                metadata=meta,
            )
        except RuntimeError:
            pass


def attach_neon_log_handler() -> None:
    from app.core.neon_db import get_log_database_url

    if not get_log_database_url():
        return
    handler = NeonApplicationLogHandler()
    handler.setLevel(logging.WARNING)
    logging.getLogger().addHandler(handler)


async def log_unhandled_exception(request: Request, exc: Exception, request_id: str) -> None:
    import traceback

    token = getattr(request.state, "token_data", None)
    await application_log_store.insert_app_event_log(
        log_level="error",
        log_type="unhandled_error",
        http_method=request.method,
        path=str(request.url.path),
        message=str(exc)[:4000],
        request_id=request_id,
        tenant_id=getattr(token, "tenant_id", None),
        actor_user_id=getattr(token, "user_id", None),
        actor_role=getattr(token, "role", None),
        client_ip=request.client.host if request.client else None,
        metadata={"trace": traceback.format_exc()[:12000]},
    )
