"""
FastAPI dependencies for JWT verification and role-based access control.

Two JWT types are handled:

1. Real Supabase JWTs (teacher / admin)
   - Signed ES256 (new Supabase) or HS256 (older / self-hosted)
   - Verified via JWKS or SUPABASE_JWT_SECRET
   - RLS enforced via set_session()

2. Custom student JWTs (OTP flow)
   - Signed HS256 with SUPABASE_JWT_SECRET by our AuthService
   - Same verification path as HS256 fallback
   - RLS enforced via postgrest.auth(token) — no set_session()
   - Identified by app_metadata.provider == "sms"

JWT payload structure:
  {
    "sub":        "<user uuid>",
    "email":      "...",
    "role":       "authenticated",
    "app_metadata": {
      "role":       "student|teacher|admin",
      "tenant_id":  "<uuid>",
      "provider":   "sms"              ← only on student custom JWTs
    },
    "exp": ...
  }
"""
from typing import Optional, List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt as pyjwt
from jwt import PyJWKClient, PyJWKClientError
import base64

from app.core.config import settings


bearer_scheme = HTTPBearer(auto_error=False)

# ── JWKS client for ES256 ────────────────────────────────────
_jwks_client: Optional[PyJWKClient] = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)
    return _jwks_client


def _get_hs256_key() -> bytes:
    return settings.SUPABASE_JWT_SECRET.encode()


class TokenData:
    """Parsed, validated JWT payload."""
    def __init__(self, payload: dict):
        self.user_id:   str           = payload["sub"]
        self.tenant_id: str           = payload.get("app_metadata", {}).get("tenant_id", "")
        self.role:      str           = payload.get("app_metadata", {}).get("role", "")
        self.email:     Optional[str] = payload.get("email")
        self.raw:       dict          = payload
        self.raw_token: str           = ""  # Populated by dependency

        # True when this is a custom student JWT (not issued by Supabase GoTrue)
        self.is_custom_jwt: bool = (
            payload.get("app_metadata", {}).get("provider") == "sms"
        )

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
    Verify JWT signature.
    Tries ES256 (Supabase JWKS) first, falls back to HS256.
    Custom student JWTs are always HS256 and go through the fallback path.
    """
    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.exceptions.DecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": f"Malformed token: {e}"},
        )

    alg = header.get("alg", "")

    if alg == "ES256":
        try:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            return pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
        except (pyjwt.exceptions.PyJWTError, PyJWKClientError) as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": f"Token invalid: {e}"},
            )
    else:
        # HS256 — covers both real Supabase HS256 JWTs and custom student JWTs
        try:
            return pyjwt.decode(
                token,
                _get_hs256_key(),
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except pyjwt.exceptions.PyJWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_CREDENTIALS", "message": f"Token invalid: {e}"},
            )


from app.db.supabase import get_admin_client

# ── Dependency: any authenticated user ───────────────────────
async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> TokenData:
    token = _extract_token(request, credentials)
    payload = _verify_token(token)
    data = TokenData(payload)
    data.raw_token = token

    # Check if the tenant is suspended (block mutations only to allow read-only access)
    if (
        data.tenant_id
        and data.role not in ("super_admin", "platform_admin")
        and request.method in ("POST", "PUT", "PATCH", "DELETE")
    ):
        admin = get_admin_client()
        tenant_res = (
            admin.table("tenants")
            .select("is_active")
            .eq("id", data.tenant_id)
            .maybe_single()
            .execute()
        )
        is_active = True
        if tenant_res and tenant_res.data:
            is_active = bool(tenant_res.data.get("is_active", True))
        if not is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "TENANT_SUSPENDED",
                    "message": "Your organization account has been suspended by the platform administrator.",
                },
            )

    request.state.jwt_token = token
    request.state.token_data = data
    return data


# ── Role guards ───────────────────────────────────────────────
async def require_student(
    token: TokenData = Depends(get_current_user),
) -> TokenData:
    if token.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Student access required"},
        )
    return token


async def require_teacher(
    token: TokenData = Depends(get_current_user),
) -> TokenData:
    if token.role not in ("teacher", "admin", "platform_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Teacher access required"},
        )
    return token


async def require_admin(
    token: TokenData = Depends(get_current_user),
) -> TokenData:
    if token.role not in ("admin", "platform_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Admin access required"},
        )
    return token


async def require_super_admin(
    token: TokenData = Depends(get_current_user),
) -> TokenData:
    if token.role not in ("super_admin", "platform_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "UNAUTHORIZED", "message": "Platform level access required"},
        )
    return token


class RequireRole:
    """Dependency factory for role-based access control."""
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    async def __call__(
        self, token: TokenData = Depends(get_current_user)
    ) -> TokenData:
        if token.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "UNAUTHORIZED",
                    "message": f"Access denied. One of these roles required: {self.allowed_roles}",
                },
            )
        return token


class RequireActiveTenant:
    """Dependency that ensures the tenant is active."""
    async def __call__(
        self, token: TokenData = Depends(get_current_user)
    ) -> TokenData:
        if not token.tenant_id or token.role in ("super_admin", "platform_admin"):
            return token

        admin = get_admin_client()
        res = (
            admin.table("tenants")
            .select("is_active")
            .eq("id", token.tenant_id)
            .maybe_single()
            .execute()
        )
        if res and res.data and not res.data.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "TENANT_SUSPENDED",
                    "message": "Your organization account has been suspended.",
                },
            )
        return token