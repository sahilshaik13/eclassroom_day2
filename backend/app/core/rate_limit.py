"""Shared slowapi limiter instance for route decorators."""
from pathlib import Path

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

_SLOWAPI_ENV = Path(__file__).resolve().parent.parent.parent / ".slowapi.env"
_limiter_kw: dict = {"key_func": get_remote_address}
if _SLOWAPI_ENV.is_file():
    _limiter_kw["config_filename"] = str(_SLOWAPI_ENV)
if settings.REDIS_URL:
    _limiter_kw["storage_uri"] = settings.REDIS_URL

limiter = Limiter(**_limiter_kw)
