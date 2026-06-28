import re
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent.parent
# override=True: backend/.env wins over stale machine env (e.g. old REDIS_URL=localhost)
load_dotenv(_BACKEND_DIR / ".env", override=True)


class Settings(BaseSettings):
    # ── Supabase ──────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str           # used to verify JWTs offline

    # ── App ───────────────────────────────────────────────────
    APP_ENV: str = "development"
    APP_NAME: str = "ThinkTarteeb E-Classroom"
    FRONTEND_URL: str = "http://localhost:5173"
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    # Optional regex for dynamic frontend hosts (e.g. Vercel preview URLs).
    # Keep this strict to trusted domains only.
    CORS_ORIGIN_REGEX: str = r"^https://([a-z0-9-]+\.)*vercel\.app$"

    # ── Session TTLs per role (minutes) ───────────────────────
    SESSION_STUDENT_TTL_MINUTES: int = 10080
    SESSION_TEACHER_TTL_MINUTES: int = 1440
    SESSION_ADMIN_TTL_MINUTES: int = 480

    # ── OTP / rate limiting ───────────────────────────────────
    OTP_MAX_ATTEMPTS: int = 3
    OTP_LOCKOUT_MINUTES: int = 15
    # Student login SMS OTP: set OTP=disable in .env for phone-only login (dev only).
    OTP: str = "enable"

    # ── Twilio fallback (optional) ────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_MESSAGING_SERVICE_SID: str = ""

    # ── SMTP (same credentials as Supabase Custom SMTP) ───────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "ThinkTarteeb E-Classroom"
    SMTP_USE_TLS: bool = True
    # Port 465 uses implicit SSL (SMTP_SSL). Port 587 uses STARTTLS when SMTP_USE_TLS=true.
    SMTP_USE_SSL: bool = False

    # ── NexusOCR (optional, admin study-plan import) ──────────
    NEXUSOCR_API_URL: str = "https://nexusocr-backend-637895872255.asia-south1.run.app"
    NEXUSOCR_API_KEY: str = ""
    NEXUSOCR_TIMEOUT_SECONDS: int = 180

    # ── Rate limiting ─────────────────────────────────────────
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_API: str = "100/minute"
    GATEWAY_ENABLED: bool = True

    # ── Redis (SSE import events, ARQ worker, cache) ──────────
    REDIS_URL: str = ""

    # ── Real-time Features (gradual rollout) ───────────────────
    USE_SUPABASE_REALTIME: bool = False  # Enable Supabase Realtime for live portal sync

    # ── Neon Postgres (super-admin application logs) ──────────
    DATABASE_URL: str = ""
    AUDIT_LOG_RETENTION_DAYS: int = 7
    AUDIT_LOG_MAX_ENTRIES: int = 500_000

    # ── Connection Pooling / Concurrency ───────────────────────
    # Database connection pool size (asyncpg)
    DB_POOL_MIN_SIZE: int = 2
    DB_POOL_MAX_SIZE: int = 10
    # HTTP client connection pool (httpx)
    HTTP_POOL_LIMIT: int = 100
    HTTP_POOL_LIMIT_PER_HOST: int = 20
    # Number of concurrent workers for parallel processing
    MAX_WORKER_THREADS: int = 10

    # ── Google Meet (Calendar API + OAuth) ────────────────────
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = ""
    GOOGLE_TOKEN_ENCRYPTION_KEY: str = ""

    # ── Sentry ────────────────────────────────────────────────
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.2

    @property
    def google_oauth_redirect_uri(self) -> str:
        explicit = (self.GOOGLE_OAUTH_REDIRECT_URI or "").strip()
        if explicit:
            return explicit.rstrip("/")
        return "http://localhost:8080/api/v1/meet/google/callback"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def student_otp_disabled(self) -> bool:
        return self.OTP.strip().lower() == "disable"

    @property
    def sentry_enabled(self) -> bool:
        return bool(self.SENTRY_DSN.strip())

    @property
    def cors_origins(self) -> List[str]:
        """Allowed browser origins (env list + common local dev ports in development)."""
        origins = {o.rstrip("/") for o in (self.CORS_ORIGINS or []) if o}
        if self.FRONTEND_URL:
            origins.add(self.FRONTEND_URL.rstrip("/"))
        if not self.is_production:
            for port in (5173, 5174, 5175, 3000):
                origins.add(f"http://localhost:{port}")
                origins.add(f"http://127.0.0.1:{port}")
        return sorted(origins)

    @property
    def cors_origin_regex(self) -> str | None:
        value = (self.CORS_ORIGIN_REGEX or "").strip()
        return value or None

    def is_origin_allowed(self, origin: str | None) -> bool:
        if not origin:
            return False
        normalized = origin.rstrip("/")
        if normalized in self.cors_origins:
            return True
        pattern = self.cors_origin_regex
        if not pattern:
            return False
        try:
            return re.match(pattern, normalized) is not None
        except re.error:
            return False

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
