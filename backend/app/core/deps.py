"""
FastAPI dependencies for JWT verification and role-based access control.

Supabase issues the JWT at login. FastAPI verifies it offline using the
SUPABASE_JWT_SECRET — no network call needed on every request.

The JWT payload Supabase puts in the token:
  {
    "sub":        "<user uuid>",
    "email":      "...",
    "role":       "authenticated",          ← Supabase default
    "app_metadata": {
      "role":      "student|teacher|admin", ← our custom claim
      "tenant_id": "<uuid>"
    },
    "exp": ...,
    ...
  }

We read role and tenant_id from app_metadata (set via Supabase admin API
when the user is created / invited).
"""
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt                        # PyJWT (not python-jose)
from jwt import PyJWKClient, PyJWKClientError
import base64

from app.core.config import settings


bearer_scheme = HTTPBearer(auto_error=False)

# ── JWKS client for ES256 verification ────────────────────────
# Supabase signs JWTs with ES256 and publishes the public key at
# {SUPABASE_URL}/auth/v1/.well-known/jwks.json.
_jwks_client: Optional[PyJWKClient] = None

def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


# Fallback for HS256 (older Supabase or self-hosted instances)
def _get_hs256_key() -> bytes:
    raw = settings.SUPABASE_JWT_SECRET
    try:
        return base64.b64decode(raw)
    except Exception:
        return raw.encode()


class TokenData:
    """Parsed, validated JWT payload."""
    def __init__(self, payload: dict):
        self.user_id: str   = payload["sub"]
        self.tenant_id: str = payload.get("app_metadata", {}).get("tenant_id", "")
        self.role: str      = payload.get("app_metadata", {}).get("role", "")
        # Supabase MFA sets aal="aal2" in the JWT after a successful TOTP challenge.
        aal = payload.get("aal", "")
        app_meta_flag = payload.get("app_metadata", {}).get("mfa_verified", False)
        self.mfa_verified: bool = (aal == "aal2") or bool(app_meta_flag)
        self.email: Optional[str] = payload.get("email")
        self.raw: dict      = payload

    def raw_token_for_supabase(self, original_token: str) -> str:
        return original_token


def _extract_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> str:
    token = None
    if credentials:
        token = credentials.credentials
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token


def _verify_token(token: str) -> dict:
    """
    Verify Supabase JWT.
    Tries ES256 (via JWKS) first, falls back to HS256 (via JWT secret).
    """
    # Peek at the header to pick the right algorithm
    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.exceptions.DecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": f"Malformed token: {e}"},
        )

    alg = header.get("alg", "")

    if alg == "ES256":
        # Verify with Supabase's public JWKS
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
            return payload
        except (pyjwt.exceptions.PyJWTError, PyJWKClientError) as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": f"Token invalid: {e}"},
            )
    else:
        # HS256 fallback (older Supabase / self-hosted)
        try:
            payload = pyjwt.decode(
                token,
                _get_hs256_key(),
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except pyjwt.exceptions.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": f"Token invalid: {e}"},
            )


# ── Dependency: any authenticated user ───────────────────────
async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> TokenData:
    token = _extract_token(request, credentials)
    payload = _verify_token(token)
    data = TokenData(payload)
    request.state.jwt_token = token
    request.state.token_data = data
    return data



# ── Role guards ───────────────────────────────────────────────
async def require_student(token: TokenData = Depends(get_current_user)) -> TokenData:
    if token.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Student access required"},
        )
    return token


async def require_teacher(token: TokenData = Depends(get_current_user)) -> TokenData:
    if token.role not in ("teacher", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Teacher access required"},
        )
    return token


async def require_admin(token: TokenData = Depends(get_current_user)) -> TokenData:
    if token.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Admin access required"},
        )
    if not token.mfa_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "MFA_REQUIRED", "message": "Admin must complete TOTP MFA before accessing this resource"},
        )
    return token
