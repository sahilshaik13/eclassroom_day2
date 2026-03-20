"""
AuthService — thin wrapper around Supabase Auth with custom MFA for students.
"""
import random
import jwt
import pyotp
import qrcode
import qrcode.image.svg
import io
import httpx
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional
from twilio.rest import Client as TwilioClient
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
            .select("id, name, role, tenant_id, is_registered, mfa_enabled")
            .eq("phone", phone)
            .eq("tenant_id", tenant_id)
            .single()
            .execute()
        )
        if not user_res or not user_res.data:
            raise AuthError("NOT_FOUND", "User record lost — please contact support", 404)

        user_data = user_res.data
        mfa_enabled = user_data.get("mfa_enabled", False)

        # 4. If MFA is enabled, return a temporary token for verification
        if mfa_enabled:
            temp_token = AuthService._issue_session(user_data, mfa_verified=False, expires_in=timedelta(minutes=15))
            return {
                "mfa_required": True,
                "mfa_token": temp_token,
                "user": user_data
            }

        # 5. Sign a custom JWT for the session
        access_token = AuthService._issue_session(user_data, mfa_verified=True)

        return {
            "access_token": access_token,
            "refresh_token": "manual-otp-verified", # Not using real refresh tokens in manual flow for now
            "token_type": "bearer",
            "user": user_data,
        }

    @staticmethod
    def _issue_session(user_data: dict, mfa_verified: bool = True, expires_in: timedelta = timedelta(days=7)) -> str:
        """Internal helper to sign HS256 JWTs for student manual flow."""
        try:
            secret = base64.b64decode(settings.SUPABASE_JWT_SECRET)
        except Exception:
            secret = settings.SUPABASE_JWT_SECRET.encode()

        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_data["id"],
            "aud": "authenticated",
            "role": "authenticated",
            # Ensure email is present otherwise Supabase auth might reject or ignore some things
            "email": f"user_{user_data['id'][:8]}@sms.thinktarteeb.local",
            "app_metadata": {
                "provider": "sms",
                "role": user_data["role"],
                "tenant_id": user_data["tenant_id"],
                "is_registered": user_data.get("is_registered", False),
                # This is the critical claim that our deps/RLS will check
                "mfa_verified": mfa_verified
            },
            "user_metadata": {
                "name": user_data.get("name", "")
            },
            "iat": int(now.timestamp()),
            "exp": int((now + expires_in).timestamp())
        }
        return jwt.encode(payload, secret, algorithm="HS256")

    # ── Custom Student MFA enrollment ─────────────────────────

    @staticmethod
    async def mfa_enroll_student(user_id: str, phone: str) -> dict:
        """Custom TOTP enrollment for students (bypasses Supabase factors)."""
        admin = get_admin_client()

        # 1. Generate secret
        secret = pyotp.random_base32()

        # 2. Save secret to users table
        try:
            admin.table("users").update({
                "mfa_secret": secret,
                "mfa_enabled": False # verified after first code check
            }).eq("id", user_id).execute()
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Failed to save MFA secret: {str(e)}", 500)

        # 3. Generate QR Code
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=phone, issuer_name="ThinkTarteeb")
        
        img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage)
        stream = io.BytesIO()
        img.save(stream)
        svg_xml = stream.getvalue().decode()

        return {
            "factor_id": f"std_{user_id[:8]}", # fake factor ID for UI consistency
            "secret": secret,
            "qr_code": svg_xml,
            "uri": uri
        }

    @staticmethod
    async def mfa_verify_student(user_id: str, code: str) -> dict:
        """Custom TOTP verification for students."""
        admin = get_admin_client()

        # 1. Fetch user secret
        res = admin.table("users").select("id, role, tenant_id, name, is_registered, mfa_secret").eq("id", user_id).single().execute()
        if not res.data:
            raise AuthError("NOT_FOUND", "User not found", 404)
        
        user_data = res.data
        secret = user_data.get("mfa_secret")
        if not secret:
            raise AuthError("MFA_ERROR", "MFA not enrolled for this user", 400)

        # 2. Verify code
        totp = pyotp.TOTP(secret)
        if not totp.verify(code):
            raise AuthError("INVALID_CREDENTIALS", "Invalid verification code", 401)

        # 3. Mark as enabled (if it was the first verification)
        admin.table("users").update({"mfa_enabled": True}).eq("id", user_id).execute()
        user_data["mfa_enabled"] = True

        # 4. Issue FULL session token (mfa_verified=True)
        access_token = AuthService._issue_session(user_data, mfa_verified=True)

        return {
            "access_token": access_token,
            "refresh_token": "manual-otp-verified",
            "token_type": "bearer",
            "user": user_data,
            "mfa_verified": True
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
            .select("id, name, role, tenant_id, is_registered")
            .eq("id", user.id)
            .single()
            .execute()
        )

        role = user_row.data.get("role", "")
        tenant_id = user_row.data.get("tenant_id", "")

        # Backfill app_metadata if missing (e.g. teachers invited before
        # the app_metadata patch was added to the invite flow).
        auth_meta = (user.app_metadata or {}) if user else {}
        if auth_meta.get("role") != role or auth_meta.get("tenant_id") != tenant_id:
            try:
                auth_headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type": "application/json",
                }
                async with httpx.AsyncClient() as client:
                    await client.put(
                        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user.id}",
                        json={"app_metadata": {"role": role, "tenant_id": tenant_id}},
                        headers=auth_headers,
                    )
                # Re-sign so this session already carries the right claims
                try:
                    result2 = admin.auth.sign_in_with_password({"email": email, "password": password})
                    if result2.session:
                        session = result2.session
                except Exception:
                    pass  # fallback: user can refresh on next request
            except Exception as e:
                print(f"Warning: could not backfill app_metadata: {e}")

        mfa_enrolled = any(
            getattr(f, 'factor_type', '') == 'totp' and getattr(f, 'status', '') == 'verified'
            for f in (user.factors or [])
        )

        user_data = user_row.data
        user_data["mfa_enabled"] = mfa_enrolled

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": user_data,
            "mfa_required": role == "admin",
            "mfa_enrolled": mfa_enrolled,
        }

    @staticmethod
    async def set_password(user_jwt: str, new_password: str) -> dict:
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

        # Update public.users table to reflect that password is set
        try:
            # We need to decode the JWT to get the user ID
            decoded = jwt.decode(user_jwt, options={"verify_signature": False})
            user_id = decoded.get("sub")
            if user_id:
                admin = get_admin_client()
                admin.table("users").update({"has_password": True}).eq("id", user_id).execute()
        except Exception as e:
            # Log error but don't fail the whole request as the password itself WAS set in Supabase Auth
            print(f"Error updating has_password flag: {str(e)}")

        return {"message": "Password updated successfully"}

    # ── TOTP MFA enroll (Admin/Teacher) ───────────────────────

    @staticmethod
    async def mfa_enroll(user_jwt: str, refresh_token: str = "") -> dict:
        """
        Calls Supabase REST API directly — avoids gotrue-py Pydantic bugs.
        """
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

    # ── TOTP MFA verify (Admin/Teacher) ───────────────────────

    @staticmethod
    async def mfa_verify(user_jwt: str, refresh_token: str, factor_id: str, code: str) -> dict:
        """
        Calls Supabase REST API directly — avoids gotrue-py challenge() dict bug.
        """
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
        redirect_to: Optional[str] = None,
    ) -> dict:
        from urllib.parse import quote
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
        # For /invite, GoTrue expects redirect_to as a query parameter.
        # If it is not present (or not allowlisted), Supabase falls back to SITE_URL.
        invite_url = f"{settings.SUPABASE_URL}/auth/v1/invite"
        if redirect_to:
            invite_url = invite_url + "?redirect_to=" + quote(redirect_to, safe=":/")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                invite_url,
                json=payload,
                headers=auth_headers
            )
            
        if resp.status_code >= 400:
            error_msg = resp.json().get("msg", resp.text) if "application/json" in resp.headers.get("Content-Type", "") else resp.text
            raise AuthError("INVITE_ERROR", error_msg, resp.status_code)
            
        data = resp.json()
        return {"user_id": data["id"], "email": email, "message": "Invite email sent"}

    # ── User Status ───────────────────────────────────────────

    @staticmethod
    async def get_user_status(user_id: str) -> dict:
        admin = get_admin_client()
        res = admin.table("users").select("id, name, role, tenant_id, has_password, is_registered").eq("id", user_id).maybe_single().execute()
        
        if not res.data:
            raise AuthError("NOT_FOUND", "User profile not found", 404)
            
        user_data = res.data
        
        # Check MFA status
        try:
            auth_user = admin.auth.admin.get_user_by_id(user_id)
            mfa_enabled = any(
                getattr(f, 'factor_type', '') == 'totp' and getattr(f, 'status', '') == 'verified'
                for f in (auth_user.factors or [])
            )
            user_data["mfa_enabled"] = mfa_enabled
        except Exception:
            user_data["mfa_enabled"] = False
            
        return user_data

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
            .select("id, name, role, tenant_id, is_registered")
            .eq("id", user.id)
            .single()
            .execute()
        )
        
        user_data = user_row.data
        mfa_enabled = any(
            getattr(f, 'factor_type', '') == 'totp' and getattr(f, 'status', '') == 'verified'
            for f in (user.factors or [])
        )
        user_data["mfa_enabled"] = mfa_enabled

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": user_data,
        }