"""
Auth routes — thin layer that delegates to AuthService.

POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/verify
POST /api/v1/auth/login
POST /api/v1/auth/forgot-password
POST /api/v1/auth/set-password
POST /api/v1/auth/mfa/enroll
GET  /api/v1/auth/mfa/factors
POST /api/v1/auth/mfa/verify
POST /api/v1/auth/logout
11: """
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
    tenant_id: UUID | None = None
    context: str = "classroom"
    competition_id: UUID | None = None


class OTPVerifyRequest(BaseModel):
    phone: str
    token: str
    tenant_id: UUID | None = None
    competition_id: UUID | None = None


class SetPasswordRequest(BaseModel):
    new_password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    redirect_to: str | None = None


class MFAVerifyRequest(BaseModel):
    factor_id: str
    code: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/otp/send")
async def send_otp(body: OTPSendRequest):
    try:
        tenant_id = str(body.tenant_id) if body.tenant_id else None
        comp_id = str(body.competition_id) if body.competition_id else None
        result = await AuthService.send_otp(
            body.phone, tenant_id, body.context, comp_id
        )
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/otp/verify")
async def verify_otp(body: OTPVerifyRequest):
    try:
        tenant_id = str(body.tenant_id) if body.tenant_id else None
        comp_id = str(body.competition_id) if body.competition_id else None
        result = await AuthService.verify_otp(body.phone, body.token, tenant_id, comp_id)
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


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    """Request a password reset link (admin, teacher, super admin only)."""
    try:
        redirect_to = body.redirect_to
        if not redirect_to:
            origin = request.headers.get("origin")
            referer = request.headers.get("referer")
            base = settings.FRONTEND_URL.rstrip("/")
            if origin:
                base = origin.rstrip("/")
            elif referer:
                from urllib.parse import urlparse

                p = urlparse(referer)
                base = f"{p.scheme}://{p.netloc}"
            redirect_to = f"{base}/auth/reset-password"
        result = await AuthService.request_password_reset(body.email, redirect_to)
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