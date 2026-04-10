"""
Auth routes — thin layer that delegates to AuthService.

POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/verify
POST /api/v1/auth/login
POST /api/v1/auth/mfa/enroll
GET  /api/v1/auth/mfa/factors
POST /api/v1/auth/mfa/verify
POST /api/v1/auth/logout
"""
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from app.core.deps import get_current_user, TokenData
from app.core.response import success, error
from app.core.config import settings
from app.services.auth_service import AuthService, AuthError


router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request schemas ────────────────────────────────────────────────────────────

class OTPSendRequest(BaseModel):
    phone: str
    tenant_id: UUID


class OTPVerifyRequest(BaseModel):
    phone: str
    token: str
    tenant_id: UUID


class SetPasswordRequest(BaseModel):
    new_password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MFAVerifyRequest(BaseModel):
    factor_id: str
    code: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/otp/send")
async def send_otp(body: OTPSendRequest):
    try:
        result = await AuthService.send_otp(body.phone, body.tenant_id)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/otp/verify")
async def verify_otp(body: OTPVerifyRequest):
    try:
        result = await AuthService.verify_otp(body.phone, body.token, body.tenant_id)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/login")
async def login(body: LoginRequest):
    try:
        result = await AuthService.login_with_password(body.email, body.password)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/set-password")
async def set_password(
    body: SetPasswordRequest,
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    try:
        result = await AuthService.set_password(request.state.jwt_token, body.new_password)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/mfa/enroll")
async def mfa_enroll(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    print(f"DEBUG enroll mfa_verified: {token.mfa_verified}, aal: {token.raw.get('aal')}")

    if token.role == "student":
        return error("FORBIDDEN", "MFA is not available for students", 403)

    try:
        refresh_token = request.headers.get("x-refresh-token", "")
        result = await AuthService.mfa_enroll(request.state.jwt_token, refresh_token)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)
    except Exception as e:
        return error("INTERNAL_ERROR", str(e), 500)


@router.get("/mfa/factors")
async def mfa_get_factors(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    import httpx

    if token.role == "student":
        return error("FORBIDDEN", "MFA is not available for students", 403)

    auth_headers = {
        "Authorization": f"Bearer {request.state.jwt_token}",
        "apikey": settings.SUPABASE_ANON_KEY,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers=auth_headers,
        )

    if resp.status_code >= 400:
        return error("NOT_FOUND", "User not found or session expired", resp.status_code)

    user_data = resp.json()
    factors = user_data.get("factors", [])
    totp = next(
        (f for f in factors if f.get("factor_type") == "totp" and f.get("status") == "verified"),
        None
    )

    if not totp:
        return error("NOT_FOUND", "No TOTP factor found — please set up MFA first", 404)

    return success({
        "factor_id": totp["id"],
        "type": "totp",
        "status": totp["status"]
    })


@router.post("/mfa/verify")
async def mfa_verify(
    body: MFAVerifyRequest,
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    if token.role == "student":
        return error("FORBIDDEN", "MFA is not available for students", 403)

    try:
        refresh_token = request.headers.get("x-refresh-token", "")
        result = await AuthService.mfa_verify(
            request.state.jwt_token,
            refresh_token,
            body.factor_id,
            body.code,
        )
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.delete("/mfa/unenroll")
async def mfa_unenroll(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    if token.role == "student":
        return error("FORBIDDEN", "MFA is not available for students", 403)

    if token.role == "admin":
        return error("FORBIDDEN", "MFA is mandatory for administrators", 403)

    try:
        result = await AuthService.mfa_unenroll(request.state.jwt_token)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.get("/status")
async def get_status(
    token: TokenData = Depends(get_current_user),
):
    try:
        result = await AuthService.get_user_status(token.user_id)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/logout")
async def logout(token: TokenData = Depends(get_current_user)):
    return success({"message": "Logged out successfully"})


@router.post("/refresh")
async def refresh_session(body: RefreshRequest):
    try:
        result = await AuthService.refresh_session(body.refresh_token)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.get("/debug-config")
async def debug_config():
    return {"frontend_url": settings.FRONTEND_URL}


@router.get("/debug-invite-url")
async def debug_invite_url():
    from urllib.parse import quote
    redirect_to = f"{settings.FRONTEND_URL}/auth/callback"
    encoded = quote(redirect_to, safe=":/")
    return {"redirect_to": redirect_to, "encoded": encoded}