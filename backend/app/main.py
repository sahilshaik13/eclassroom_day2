"""
ThinkTarteeb E-Classroom — FastAPI application entry point.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.v1.routes import auth, student, teacher, admin, public, superadmin, competition, progress_report
from app.db.supabase import get_admin_client
from app.middleware.audit_middleware import AuditLogMiddleware
from app.services.audit_log_service import rotate_audit_logs


limiter = Limiter(key_func=get_remote_address)
_logger = logging.getLogger(__name__)


async def _audit_rotate_loop() -> None:
    """Hourly rotation of audit rows (7d → archive; purge old archive)."""
    while True:
        try:
            admin = get_admin_client()
            out = rotate_audit_logs(admin)
            if out:
                _logger.info("[audit_log] rotate_audit_logs: %s", out)
        except Exception:
            _logger.exception("[audit_log] rotate_audit_logs failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        rotate_audit_logs(get_admin_client())
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

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(AuditLogMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5173",
        "https://eclassroom-day2-afok.vercel.app", # Your production frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global error handler ──────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if not settings.is_production:
        import traceback
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc),
                    "trace": traceback.format_exc(),
                },
            },
        )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"},
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

# ── Health check ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}

@app.get("/api/ping")
async def ping():
    return {"status": "pong"}