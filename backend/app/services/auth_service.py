"""
AuthService — thin wrapper around Supabase Auth.
"""
from typing import Optional
from gotrue.errors import AuthApiError

from app.db.supabase import get_admin_client
from app.core.config import settings
import random
import jwt
from datetime import datetime, timedelta, timezone
from twilio.rest import Client as TwilioClient


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

        # Normalize phone number
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))

        try:
            # 1. Verify student exists in this tenant
            result = (
                admin.table("students")
                .select("id, user_id, deactivated_at")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .execute()
            )
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Database query failed: {str(e)}", 500)

        if not result or not result.data:
            raise AuthError("INVALID_CREDENTIALS", "Phone number not registered or access denied", 401)

        student_data = result.data[0]
        if student_data.get("deactivated_at"):
            raise AuthError("INVALID_CREDENTIALS", "Account is deactivated", 401)

        # 2. Generate and store OTP
        otp_code = f"{random.randint(100000, 999999)}"
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

        try:
            # Clean up old codes first
            admin.table("otp_codes").delete().eq("phone", phone).eq("tenant_id", tenant_id).execute()
            # Store new one
            admin.table("otp_codes").insert({
                "phone": phone,
                "tenant_id": tenant_id,
                "code": otp_code,
                "expires_at": expires_at
            }).execute()
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Failed to store OTP: {str(e)}", 500)

        # 3. Send via Twilio
        try:
            client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message_body = f"Your ThinkTarteeb verification code is: {otp_code}. Valid for 10 minutes."
            
            send_args = {"to": phone, "body": message_body}
            if settings.TWILIO_MESSAGING_SERVICE_SID:
                send_args["messaging_service_sid"] = settings.TWILIO_MESSAGING_SERVICE_SID
            elif settings.TWILIO_PHONE_NUMBER:
                send_args["from_"] = settings.TWILIO_PHONE_NUMBER
            else:
                raise Exception("Twilio Phone Number or Messaging Service SID missing")

            client.messages.create(**send_args)
        except Exception as e:
            # Special case for dev: allow mock even if Twilio fails if it's not production
            if not settings.is_production:
                return {
                    "message": "OTP generated (MOCK)",
                    "dev_otp": otp_code,
                    "note": f"Twilio error: {str(e)}. Use {otp_code} for testing."
                }
            raise AuthError("INTERNAL_ERROR", f"SMS delivery failed: {str(e)}", 500)

        return {"message": "OTP sent successfully"}

    @staticmethod
    async def verify_otp(phone: str, token: str, tenant_id: str) -> dict:
        admin = get_admin_client()

        # Normalize phone
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))

        # 1. Verify against our otp_codes table
        try:
            otp_res = (
                admin.table("otp_codes")
                .select("*")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .eq("code", token)
                .gte("expires_at", datetime.now(timezone.utc).isoformat())
                .execute()
            )
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Verification failed: {str(e)}", 500)

        if not otp_res or not otp_res.data:
            raise AuthError("INVALID_CREDENTIALS", "Invalid or expired OTP", 401)

        # 2. Consume the code
        admin.table("otp_codes").delete().eq("id", otp_res.data[0]["id"]).execute()

        # 3. Get user record
        user_res = (
            admin.table("users")
            .select("id, name, role, tenant_id, is_registered")
            .eq("phone", phone)
            .eq("tenant_id", tenant_id)
            .single()
            .execute()
        )
        if not user_res or not user_res.data:
            raise AuthError("NOT_FOUND", "User record lost — please contact support", 404)

        user_data = user_res.data

        # 4. Sign a custom JWT for the session
        # We use HS256 with the secret Supabase expects for local validation
        try:
            import base64
            # Some environments use a base64 encoded secret, some don't
            try:
                secret = base64.b64decode(settings.SUPABASE_JWT_SECRET)
            except Exception:
                secret = settings.SUPABASE_JWT_SECRET.encode()

            now = datetime.now(timezone.utc)
            payload = {
                "sub": user_data["id"],
                "aud": "authenticated",
                "role": "authenticated",
                "email": f"{phone}@sms.thinktarteeb.local",
                "app_metadata": {
                    "provider": "sms",
                    "role": user_data["role"],
                    "tenant_id": user_data["tenant_id"],
                    "is_registered": user_data.get("is_registered", False)
                },
                "user_metadata": {
                    "name": user_data["name"]
                },
                "iat": int(now.timestamp()),
                "exp": int((now + timedelta(days=7)).timestamp())
            }
            access_token = jwt.encode(payload, secret, algorithm="HS256")
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Failed to issue session: {str(e)}", 500)

        return {
            "access_token": access_token,
            "refresh_token": "manual-otp-verified", # Not using real refresh tokens in manual flow for now
            "token_type": "bearer",
            "user": user_data,
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

    @staticmethod
    async def set_password(user_jwt: str, new_password: str) -> dict:
        import httpx

        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                json={"password": new_password},
                headers=auth_headers,
            )

        if resp.status_code >= 400:
            error_msg = resp.json().get("msg", resp.text) if "application/json" in resp.headers.get("Content-Type", "") else resp.text
            raise AuthError("SET_PASSWORD_ERROR", error_msg, resp.status_code)

        return {"message": "Password updated successfully"}

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
        import httpx
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        }
        
        payload = {
            "email": email,
            "data": {
                "name": name,
                "role": role,
                "tenant_id": tenant_id,
            }
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/invite",
                json=payload,
                headers=auth_headers
            )
            
        if resp.status_code >= 400:
            error_msg = resp.json().get("msg", resp.text) if "application/json" in resp.headers.get("Content-Type", "") else resp.text
            raise AuthError("INVITE_ERROR", error_msg, resp.status_code)
            
        data = resp.json()
        return {"user_id": data["id"], "email": email, "message": "Invite email sent"}

    # ── Refresh Session ───────────────────────────────────────

    @staticmethod
    async def refresh_session(refresh_token: str) -> dict:
        admin = get_admin_client()
        try:
            result = admin.auth.refresh_session(refresh_token)
        except AuthApiError as e:
            raise AuthError("INVALID_CREDENTIALS", "Refresh token is invalid or expired", 401)

        session = result.session
        user = result.user

        if not session or not user:
            raise AuthError("INVALID_CREDENTIALS", "Could not refresh session", 401)

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