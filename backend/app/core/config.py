from pydantic_settings import BaseSettings
from typing import List


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
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    # ── Session TTLs per role (minutes) ───────────────────────
    SESSION_STUDENT_TTL_MINUTES: int = 10080
    SESSION_TEACHER_TTL_MINUTES: int = 1440
    SESSION_ADMIN_TTL_MINUTES: int = 480

    # ── OTP / rate limiting ───────────────────────────────────
    OTP_MAX_ATTEMPTS: int = 3
    OTP_LOCKOUT_MINUTES: int = 15

    # ── Twilio fallback (optional) ────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    TWILIO_MESSAGING_SERVICE_SID: str = ""

    # ── Rate limiting ─────────────────────────────────────────
    RATE_LIMIT_AUTH: str = "10/minute"
    RATE_LIMIT_API: str = "100/minute"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
