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
from app.db.supabase import get_admin_client
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


class MFAEnrollRequest(BaseModel):
    pass


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
        # Require JWT to update password
        result = await AuthService.set_password(request.state.jwt_token, body.new_password)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.post("/mfa/enroll")
async def mfa_enroll(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    # MFA enrollment is allowed for all authenticated users to enhance security.
    # Students use a custom TOTP flow because Supabase MFA does not support custom tokens.
    try:
        if token.role == "student":
            # phone is needed for QR code label
            user_res = (
                get_admin_client().table("users").select("phone").eq("id", token.user_id).single().execute()
            )
            phone = user_res.data.get("phone", "Student") if user_res.data else "Student"
            result = await AuthService.mfa_enroll_student(token.user_id, phone)
        else:
            refresh_token = request.headers.get("x-refresh-token", "")
            result = await AuthService.mfa_enroll(request.state.jwt_token, refresh_token)
        return success(result)
    except AuthError as e:
        return error(e.code, e.message, e.status)


@router.get("/mfa/factors")
async def mfa_get_factors(
    request: Request,
    token: TokenData = Depends(get_current_user),
):
    import httpx
    auth_headers = {
        "Authorization": f"Bearer {request.state.jwt_token}",
        "apikey": settings.SUPABASE_ANON_KEY,
    }
    
    if token.role == "student":
        # Check users table for student
        user_res = (
            get_admin_client().table("users").select("mfa_enabled, mfa_secret").eq("id", token.user_id).single().execute()
        )
        if not user_res.data or not user_res.data.get("mfa_secret"):
            return error("NOT_FOUND", "MFA not enrolled", 404)
        
        return success({
            "factor_id": f"std_{token.user_id[:8]}",
            "type": "totp",
            "status": "verified" if user_res.data.get("mfa_enabled") else "unverified"
        })

    # For others, use Supabase Auth factors
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers=auth_headers,
        )
        
    if resp.status_code >= 400:
        return error("NOT_FOUND", "User not found or session expired", resp.status_code)
        
    user_data = resp.json()
    factors = user_data.get("factors", [])
    totp = next((f for f in factors if f.get("factor_type") == "totp" and f.get("status") == "verified"), None)
    
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
    refresh_token = request.headers.get("x-refresh-token", "")
    try:
        if token.role == "student":
            result = await AuthService.mfa_verify_student(token.user_id, body.code)
        else:
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