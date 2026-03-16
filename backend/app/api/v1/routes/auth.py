"""
Auth routes — thin layer that delegates to AuthService.

POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/verify
POST /api/v1/auth/login
POST /api/v1/auth/mfa/enroll
POST /api/v1/auth/mfa/verify
POST /api/v1/auth/logout
"""
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr

from app.core.deps import get_current_user, TokenData
from app.core.response import success, error
from app.services.auth_service import AuthService, AuthError


router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request schemas ────────────────────────────────────────────────────────────

class OTPSendRequest(BaseModel):
    phone: str       # E.164 e.g. +971501234567
    tenant_id: str   # which Islamic Center


class OTPVerifyRequest(BaseModel):
    phone: str
    token: str       # 6-digit OTP from SMS
    tenant_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MFAEnrollRequest(BaseModel):
    pass             # no body — reads from current user JWT


class MFAVerifyRequest(BaseModel):
    factor_id: str   # from enroll response
    code: str        # 6-digit TOTP from authenticator app


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


@router.post("/mfa/enroll")
async def mfa_enroll(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    if token.role != "admin":
        return error("UNAUTHORIZED", "MFA enroll is for admins only", 403)
    refresh_token = request.headers.get("x-refresh-token", "")
    try:
        result = await AuthService.mfa_enroll(request.state.jwt_token, refresh_token)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/mfa/verify")
async def mfa_verify(
    body: MFAVerifyRequest,
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    refresh_token = request.headers.get("x-refresh-token", "")
    try:
        result = await AuthService.mfa_verify(
            request.state.jwt_token,
            refresh_token,
            body.factor_id,
            body.code,
        )
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/logout")
async def logout(token: TokenData = Depends(get_current_user)):
    # Stateless — client drops the token.
    # Supabase handles server-side session invalidation if needed.
    return success({"message": "Logged out successfully"})
