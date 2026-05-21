"""
ThinkTarteeb E-Classroom — FastAPI application entry point.
"""
import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.cors import cors_allow_headers
from app.core.logging_config import configure_logging
from app.core.app_logging import attach_neon_log_handler, log_unhandled_exception
from app.core.neon_db import close_neon_pool, init_neon_pool
from app.core.redis_client import close_redis, init_redis
from app.core.http_client import close_http_client
from app.services import application_log_store
from app.api.v1.routes import auth, student, teacher, admin, public, superadmin, competition, progress_report, meet
from app.middleware.audit_middleware import AuditLogMiddleware
from app.middleware.cache_access_middleware import CacheAccessMiddleware
from app.middleware.structured_logging_middleware import StructuredLoggingMiddleware
from app.services.audit_log_service import rotate_audit_logs
from app.worker.enqueue import close_arq_pool, init_arq_pool

configure_logging()

# slowapi always loads a dotenv file via Starlette Config (cp1252 on Windows).
# Use ASCII-only placeholder so UTF-8 decorative comments in backend/.env do not break startup.
_SLOWAPI_ENV = Path(__file__).resolve().parent.parent / ".slowapi.env"
_limiter_kw: dict = {
    "key_func": get_remote_address,
    "config_filename": str(_SLOWAPI_ENV),
}
if settings.REDIS_URL:
    _limiter_kw["storage_uri"] = settings.REDIS_URL
limiter = Limiter(**_limiter_kw)
_logger = logging.getLogger(__name__)

if settings.sentry_enabled:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.APP_ENV,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        integrations=[StarletteIntegration(), FastApiIntegration()],
    )


_SHUTDOWN_TIMEOUT_SEC = 5.0


async def _shutdown_step(name: str, coro) -> None:
    """Run a lifespan teardown step without blocking reload forever."""
    try:
        await asyncio.wait_for(coro, timeout=_SHUTDOWN_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        _logger.warning("[lifespan] %s shutdown timed out after %ss", name, _SHUTDOWN_TIMEOUT_SEC)
    except Exception:
        _logger.exception("[lifespan] %s shutdown failed", name)


async def _audit_rotate_loop() -> None:
    """Hourly trim of application log entries past retention window."""
    while True:
        try:
            out = await rotate_audit_logs()
            if out and not out.get("skipped"):
                _logger.info("[audit_log] rotate: %s", out)
        except Exception:
            _logger.exception("[audit_log] rotate failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_neon_pool()
    await start_log_worker_safe()
    attach_neon_log_handler()
    await init_redis()
    await init_arq_pool()
    try:
        await rotate_audit_logs()
    except Exception:
        _logger.exception("[audit_log] initial rotate failed")
    rotate_task = asyncio.create_task(_audit_rotate_loop())
    try:
        yield
    finally:
        rotate_task.cancel()
        try:
            await rotate_task
        except asyncio.CancelledError:
            pass
        await _shutdown_step("log_worker", application_log_store.stop_log_worker())
        await _shutdown_step("arq_pool", close_arq_pool())
        await _shutdown_step("redis", close_redis())
        await _shutdown_step("neon_pool", close_neon_pool())


async def start_log_worker_safe() -> None:
    try:
        await application_log_store.start_log_worker()
    except Exception:
        _logger.exception("[application_log] worker start failed")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="E-Classroom SaaS for Islamic Centers — API",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)

# ── Rate limiter ──────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore

# ── Middleware (last added = outermost) ─────────────────────────
app.add_middleware(CacheAccessMiddleware)
app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(AuditLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global error handler ──────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    _logger.exception("Unhandled error request_id=%s path=%s", request_id, request.url.path)
    asyncio.create_task(log_unhandled_exception(request, exc, request_id))
    if settings.sentry_enabled:
        import sentry_sdk

        sentry_sdk.capture_exception(exc)
    if not settings.is_production:
        import traceback
        return JSONResponse(
            status_code=500,
            headers=cors_allow_headers(request),
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "request_id": request_id,
                    "trace": traceback.format_exc(),
                },
            },
        )
    return JSONResponse(
        status_code=500,
        headers=cors_allow_headers(request),
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "request_id": request_id,
            },
        },
    )

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/v1")
app.include_router(student.router,    prefix="/api/v1")
app.include_router(progress_report.router, prefix="/api/v1")
app.include_router(teacher.router,    prefix="/api/v1")
app.include_router(public.router,     prefix="/api/v1")
app.include_router(admin.router,      prefix="/api/v1")
app.include_router(superadmin.router, prefix="/api/v1")
app.include_router(competition.router, prefix="/api/v1")
app.include_router(meet.router, prefix="/api/v1")

# ── Health check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}

@app.get("/api/ping")
async def ping():
    return {"status": "pong"}