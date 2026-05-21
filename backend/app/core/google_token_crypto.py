"""Encrypt/decrypt Google refresh tokens at rest."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    key = (settings.GOOGLE_TOKEN_ENCRYPTION_KEY or "").strip()
    if key:
        return Fernet(key.encode() if isinstance(key, str) else key)
    digest = hashlib.sha256(settings.SUPABASE_JWT_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_refresh_token(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_refresh_token(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Invalid encrypted token") from exc
