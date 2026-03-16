"""
AuthService — thin wrapper around Supabase Auth.
"""
from typing import Optional
from gotrue.errors import AuthApiError

from app.db.supabase import get_admin_client
from app.core.config import settings


class AuthError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


class AuthService:

    # ── OTP (Student phone login) ─────────────────────────────

    @staticmethod
    async def send_otp(phone: str, tenant_id: str) -> dict:
        admin = get_admin_client()

        from postgrest.exceptions import APIError as PostgrestAPIError
        try:
            result = (
                admin.table("students")
                .select("id, user_id, deactivated_at")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .maybe_single()
                .execute()
            )
        except PostgrestAPIError as e:
            if e.code == "204":
                import types
                result = types.SimpleNamespace(data=None)
            else:
                raise AuthError("INTERNAL_ERROR", str(e), 500)

        if not result.data:
            raise AuthError("INVALID_CREDENTIALS", "Phone number not registered or OTP could not be sent", 401)

        if result.data.get("deactivated_at"):
            raise AuthError("INVALID_CREDENTIALS", "Account is deactivated", 401)

        try:
            admin.auth.sign_in_with_otp({"phone": phone})
        except AuthApiError as e:
            raise AuthError("INTERNAL_ERROR", str(e), 500)

        response = {"message": "OTP sent successfully"}
        if not settings.is_production:
            response["note"] = "In development, check Supabase Auth logs for the OTP"

        return response

    @staticmethod
    async def verify_otp(phone: str, token: str, tenant_id: str) -> dict:
        admin = get_admin_client()

        try:
            result = admin.auth.verify_otp({"phone": phone, "token": token, "type": "sms"})
        except AuthApiError as e:
            msg = str(e).lower()
            if "expired" in msg:
                raise AuthError("INVALID_CREDENTIALS", "OTP has expired. Please request a new one.", 401)
            if "invalid" in msg or "incorrect" in msg:
                raise AuthError("INVALID_CREDENTIALS", "Invalid OTP.", 401)
            raise AuthError("INTERNAL_ERROR", str(e), 500)

        session = result.session
        user = result.user

        if not session or not user:
            raise AuthError("INTERNAL_ERROR", "No session returned from Supabase", 500)

        user_row = (
            admin.table("users")
            .select("id, name, role, tenant_id")
            .eq("id", user.id)
            .single()
            .execute()
        )

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": user_row.data,
        }

    # ── Email + Password (Teacher / Admin) ────────────────────

    @staticmethod
    async def login_with_password(email: str, password: str) -> dict:
        admin = get_admin_client()

        try:
            result = admin.auth.sign_in_with_password({"email": email, "password": password})
        except AuthApiError as e:
            raise AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401)

        session = result.session
        user = result.user

        if not session or not user:
            raise AuthError("INTERNAL_ERROR", "No session returned", 500)

        user_row = (
            admin.table("users")
            .select("id, name, role, tenant_id")
            .eq("id", user.id)
            .single()
            .execute()
        )

        role = user_row.data.get("role", "")
        mfa_enrolled = any(
            getattr(f, 'factor_type', '') == 'totp' and getattr(f, 'status', '') == 'verified'
            for f in (user.factors or [])
        )

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": user_row.data,
            "mfa_required": role == "admin",
            "mfa_enrolled": mfa_enrolled,
        }

    # ── TOTP MFA enroll (Admin) ───────────────────────────────

    @staticmethod
    async def mfa_enroll(user_jwt: str, refresh_token: str = "") -> dict:
        """
        Calls Supabase REST API directly — avoids gotrue-py Pydantic bugs.
        """
        import httpx

        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient() as client:
            # Clean up any previous incomplete enrollment attempts
            try:
                list_resp = await client.get(
                    f"{settings.SUPABASE_URL}/auth/v1/factors",
                    headers=auth_headers,
                )
                if list_resp.status_code == 200:
                    for f in list_resp.json():
                        if f.get("factor_type") == "totp" and f.get("status") != "verified":
                            await client.delete(
                                f"{settings.SUPABASE_URL}/auth/v1/factors/{f['id']}",
                                headers=auth_headers,
                            )
            except httpx.HTTPError:
                pass

            # Enroll new TOTP factor
            resp = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors",
                json={
                    "factor_type": "totp",
                    "friendly_name": "Authenticator App",
                    "issuer": "eClassroom",
                },
                headers=auth_headers,
            )

            if resp.status_code >= 400:
                raise AuthError("MFA_ERROR", f"Supabase MFA enroll failed: {resp.text}", resp.status_code)

            data = resp.json()

        totp = data.get("totp", {})
        return {
            "factor_id": data["id"],
            "qr_code": totp.get("qr_code", ""),
            "secret": totp.get("secret", ""),
            "uri": totp.get("uri", ""),
        }

    # ── TOTP MFA verify (Admin) ───────────────────────────────

    @staticmethod
    async def mfa_verify(user_jwt: str, refresh_token: str, factor_id: str, code: str) -> dict:
        """
        Calls Supabase REST API directly — avoids gotrue-py challenge() dict bug.
        """
        import httpx

        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient() as http:
            # Step 1: Create challenge
            challenge_resp = await http.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors/{factor_id}/challenge",
                headers=auth_headers,
            )
            if challenge_resp.status_code >= 400:
                raise AuthError("MFA_ERROR", f"Challenge failed: {challenge_resp.text}", 401)

            challenge_id = challenge_resp.json().get("id")

            # Step 2: Verify the 6-digit code
            verify_resp = await http.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors/{factor_id}/verify",
                json={"challenge_id": challenge_id, "code": code},
                headers=auth_headers,
            )

            if verify_resp.status_code >= 400:
                raise AuthError("INVALID_CREDENTIALS", "Invalid TOTP code. Try again.", 401)

            data = verify_resp.json()

        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "token_type": "bearer",
            "mfa_verified": True,
        }

    # ── Invite teacher by email ───────────────────────────────

    @staticmethod
    async def invite_user_by_email(
        email: str,
        name: str,
        role: str,
        tenant_id: str,
    ) -> dict:
        admin = get_admin_client()

        try:
            result = admin.auth.admin.invite_user_by_email(
                email,
                options={
                    "data": {
                        "name": name,
                        "role": role,
                        "tenant_id": tenant_id,
                    }
                },
            )
        except AuthApiError as e:
            raise AuthError("INVITE_ERROR", str(e), 400)

        return {"user_id": result.user.id, "email": email, "message": "Invite email sent"}