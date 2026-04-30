"""
ThinkTarteeb E-Classroom — FastAPI application entry point.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.v1.routes import auth, student, teacher, admin, public, superadmin, competition


limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


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
# Relaxed CORS for development/deployment testing
# We use a custom middleware to ensure headers are added even for exception responses
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    # Get origin from request
    origin = request.headers.get("origin", "*")
    
    # Handle preflight OPTIONS requests
    if request.method == "OPTIONS":
        response = JSONResponse(content="OK", status_code=204)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With, Tenant-ID"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response
    
    # Regular request
    try:
        response = await call_next(request)
    except Exception as e:
        # Fallback for unhandled exceptions that don't reach the exception handler
        response = JSONResponse(
            status_code=500,
            content={"success": False, "error": {"message": str(e)}}
        )
    
    # Add CORS headers to all responses (including errors)
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With, Tenant-ID"
    
    return response

# Standard CORSMiddleware as a backup (though custom middleware above handles most cases)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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