"""
AuthService — thin wrapper around Supabase Auth.
"""
import random
import jwt
import httpx
import base64
from datetime import datetime, timedelta, timezone
from typing import Optional
from twilio.rest import Client as TwilioClient
from supabase import create_client
from gotrue.errors import AuthApiError

from app.db.supabase import get_admin_client
from app.core.config import settings


def _disposable_auth_client():
    """Create a fresh Supabase client for sign_in_with_password.

    NEVER use the cached admin client for this — sign_in_with_password
    mutates the client's auth session, poisoning the service-role headers
    for all subsequent PostgREST queries."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


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
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))
        tenant_id = str(tenant_id)

        try:
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

        otp_code  = f"{random.randint(100000, 999999)}"
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()

        try:
            admin.table("otp_codes").delete().eq("phone", phone).eq("tenant_id", tenant_id).execute()
            admin.table("otp_codes").insert({
                "phone": phone,
                "tenant_id": tenant_id,
                "code": otp_code,
                "expires_at": expires_at
            }).execute()
        except Exception as e:
            raise AuthError("INTERNAL_ERROR", f"Failed to store OTP: {str(e)}", 500)

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
            print(f"DEBUG send_otp Twilio/Delivery error for {phone}: {e}")
            if not settings.is_production:
                return {
                    "message": "OTP generated (MOCK)",
                    "dev_otp": otp_code,
                    "note": f"Delivery error: {str(e)}. Use {otp_code} for testing."
                }
            raise AuthError("INTERNAL_ERROR", f"SMS delivery failed: {str(e)}", 500)

        return {"message": "OTP sent successfully"}

    @staticmethod
    async def verify_otp(phone: str, token: str, tenant_id: str) -> dict:
        admin = get_admin_client()
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))
        tenant_id = str(tenant_id)

        # 1. Validate OTP code
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
        try:
            user_res = (
                admin.table("users")
                .select("id, name, role, tenant_id, has_password, is_registered")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .single()
                .execute()
            )
            user_data = user_res.data
        except Exception as e:
            raise AuthError("NOT_FOUND", "Student record not found in user directory", 404)

        if not user_data:
            raise AuthError("NOT_FOUND", "User record not found — contact support", 404)

        # 4. Issue full session immediately (no MFA for students)
        access_token = AuthService._issue_session(user_data, mfa_verified=True)
        return {
            "access_token": access_token,
            "refresh_token": "manual-otp-verified",
            "token_type": "bearer",
            "mfa_required": False,
            "mfa_enrolled": False,
            "user": {
                "id":            user_data["id"],
                "name":          user_data.get("name", ""),
                "role":          user_data["role"],
                "tenant_id":     user_data["tenant_id"],
                "is_registered": user_data.get("is_registered", False),
            },
        }

    @staticmethod
    def _issue_session(
        user_data: dict,
        mfa_verified: bool = True,
        expires_in: timedelta = timedelta(days=7)
    ) -> str:
        """Sign HS256 JWTs for the student manual-OTP flow."""
        try:
            secret = base64.b64decode(settings.SUPABASE_JWT_SECRET)
        except Exception:
            secret = settings.SUPABASE_JWT_SECRET.encode()

        now = datetime.now(timezone.utc)
        payload = {
            "sub": user_data["id"],
            "aud": "authenticated",
            "role": "authenticated",
            "email": f"user_{user_data['id'][:8]}@sms.thinktarteeb.local",
            "app_metadata": {
                "provider":      "sms",
                "role":          user_data["role"],
                "tenant_id":     user_data["tenant_id"],
                "is_registered": user_data.get("is_registered", False),
                "mfa_verified":  mfa_verified,
            },
            "user_metadata": {
                "name": user_data.get("name", "")
            },
            "iat": int(now.timestamp()),
            "exp": int((now + expires_in).timestamp()),
        }
        return jwt.encode(payload, secret, algorithm="HS256")

    # ── Email + Password (Teacher / Admin) ────────────────────

    @staticmethod
    async def login_with_password(email: str, password: str) -> dict:
        admin = get_admin_client()
        # Use a disposable client for sign_in — never the cached admin singleton
        auth_client = _disposable_auth_client()

        try:
            result = auth_client.auth.sign_in_with_password({"email": email, "password": password})
        except AuthApiError:
            raise AuthError("INVALID_CREDENTIALS", "Invalid email or password", 401)

        session = result.session
        user    = result.user

        if not session or not user:
            raise AuthError("INTERNAL_ERROR", "No session returned", 500)

        user_row = (
            admin.table("users")
            .select("id, name, role, tenant_id, is_registered")
            .eq("id", user.id)
            .single()
            .execute()
        )
        if not user_row.data:
            raise AuthError("NOT_FOUND", "User profile not found", 404)

        role      = user_row.data.get("role", "")
        tenant_id = user_row.data.get("tenant_id", "")

        # Backfill app_metadata if missing
        auth_meta = (user.app_metadata or {}) if user else {}
        if auth_meta.get("role") != role or auth_meta.get("tenant_id") != tenant_id:
            try:
                auth_headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
                    "Content-Type":  "application/json",
                }
                async with httpx.AsyncClient() as client:
                    await client.put(
                        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user.id}",
                        json={"app_metadata": {"role": role, "tenant_id": tenant_id}},
                        headers=auth_headers,
                    )
                try:
                    re_auth = _disposable_auth_client()
                    result2 = re_auth.auth.sign_in_with_password({"email": email, "password": password})
                    if result2.session:
                        session = result2.session
                except Exception:
                    pass
            except Exception as e:
                print(f"Warning: could not backfill app_metadata: {e}")

        # ── Robust MFA status detection (Admin API) ────────────────
        mfa_enrolled = False
        try:
            auth_headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
            }
            async with httpx.AsyncClient() as http:
                resp = await http.get(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user.id}",
                    headers=auth_headers
                )
                if resp.status_code == 200:
                    auth_user_data = resp.json()
                    factors = auth_user_data.get("factors", [])
                    for f in factors:
                        if f.get("factor_type") == "totp" and f.get("status") == "verified":
                            mfa_enrolled = True
                            break
                else:
                    print(f"DEBUG: Admin API check failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"DEBUG login MFA check exception: {e}")

        user_data = user_row.data

        # ── MFA decision ──────────────────────────────────────
        # Admin:   always require MFA (mandatory per security architecture)
        # Teacher: only require MFA if they have enrolled a TOTP factor
        mfa_required = (role == "admin") or (role == "teacher" and mfa_enrolled)

        return {
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token,
            "token_type":    "bearer",
            "user":          user_data,
            "mfa_required":  mfa_required,
            "mfa_enrolled":  mfa_enrolled,
        }

    @staticmethod
    async def set_password(user_jwt: str, new_password: str) -> dict:
        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey":        settings.SUPABASE_ANON_KEY,
            "Content-Type":  "application/json",
        }

        async with httpx.AsyncClient() as client:
            resp = await client.put(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                json={"password": new_password},
                headers=auth_headers,
            )

        if resp.status_code >= 400:
            error_msg = (
                resp.json().get("msg", resp.text)
                if "application/json" in resp.headers.get("Content-Type", "")
                else resp.text
            )
            raise AuthError("SET_PASSWORD_ERROR", error_msg, resp.status_code)

        try:
            decoded = jwt.decode(user_jwt, options={"verify_signature": False})
            user_id = decoded.get("sub")
            if user_id:
                admin = get_admin_client()
                admin.table("users").update({"has_password": True}).eq("id", user_id).execute()
        except Exception as e:
            print(f"Error updating has_password flag: {str(e)}")

        return {"message": "Password updated successfully"}

    # ── TOTP MFA enroll (Admin / Teacher via Supabase) ────────

    @staticmethod
    async def mfa_enroll(user_jwt: str, refresh_token: str = "") -> dict:
        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey":        settings.SUPABASE_ANON_KEY,
            "Content-Type":  "application/json",
        }

        async with httpx.AsyncClient() as client:
            # 1. Clean up any existing unverified factors to avoid name conflicts (422)
            try:
                admin_headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
                }
                user_id = jwt.decode(user_jwt, options={"verify_signature": False})["sub"]

                list_resp = await client.get(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                    headers=admin_headers,
                )
                if list_resp.status_code == 200:
                    factors = list_resp.json().get("factors", [])
                    for f in factors:
                        if f.get("factor_type") == "totp" and f.get("status") != "verified":
                            await client.delete(
                                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}/factors/{f['id']}",
                                headers=admin_headers,
                            )
            except Exception as e:
                print(f"DEBUG enrollment cleanup warning: {e}")

            # 2. Proceed with enrollment (User-level action)
            resp = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors",
                json={
                    "factor_type":   "totp",
                    "friendly_name": "Authenticator App",
                    "issuer":        "ThinkTarteeb",
                },
                headers=auth_headers,
            )

            if resp.status_code >= 400:
                raise AuthError("MFA_ERROR", f"Supabase MFA enroll failed: {resp.text}", resp.status_code)

            data = resp.json()

        totp = data.get("totp", {})
        return {
            "factor_id": data["id"],
            "qr_code":   totp.get("qr_code", ""),
            "secret":    totp.get("secret", ""),
            "uri":       totp.get("uri", ""),
        }

    # ── TOTP MFA verify (Admin / Teacher via Supabase) ────────

    @staticmethod
    async def mfa_verify(user_jwt: str, refresh_token: str, factor_id: str, code: str) -> dict:
        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey":        settings.SUPABASE_ANON_KEY,
            "Content-Type":  "application/json",
        }

        async with httpx.AsyncClient() as http:
            challenge_resp = await http.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors/{factor_id}/challenge",
                headers=auth_headers,
            )
            if challenge_resp.status_code >= 400:
                raise AuthError("MFA_ERROR", f"Challenge failed: {challenge_resp.text}", 401)

            challenge_id = challenge_resp.json().get("id")

            verify_resp = await http.post(
                f"{settings.SUPABASE_URL}/auth/v1/factors/{factor_id}/verify",
                json={"challenge_id": challenge_id, "code": code},
                headers=auth_headers,
            )
            if verify_resp.status_code >= 400:
                raise AuthError("INVALID_CREDENTIALS", "Invalid TOTP code. Try again.", 401)

            data = verify_resp.json()

        # ── Sync mfa_enabled = True in users table ────────────
        try:
            user_id = jwt.decode(user_jwt, options={"verify_signature": False})["sub"]
            admin = get_admin_client()
            admin.table("users").update({"mfa_enabled": True}).eq("id", user_id).execute()
        except Exception as e:
            print(f"Warning: could not sync mfa_enabled after verify: {e}")

        return {
            "access_token":  data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "token_type":    "bearer",
            "mfa_verified":  True,
        }

    @staticmethod
    async def mfa_unenroll(user_jwt: str) -> dict:
        try:
            user_id = jwt.decode(user_jwt, options={"verify_signature": False})["sub"]
        except Exception as e:
            raise AuthError("UNAUTHORIZED", "Invalid token", 401)
            
        admin_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
        }
        
        async with httpx.AsyncClient() as client:
            list_resp = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=admin_headers,
            )
            if list_resp.status_code != 200:
                raise AuthError("MFA_ERROR", f"Failed to fetch user factors: {list_resp.text}", list_resp.status_code)

            user_data_api = list_resp.json()
            factors = user_data_api.get("factors", [])
            for f in factors:
                if f.get("factor_type") == "totp":
                    await client.delete(
                        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}/factors/{f['id']}",
                        headers=admin_headers,
                    )

        # ── Sync mfa_enabled = False in users table ───────────
        try:
            admin = get_admin_client()
            admin.table("users").update({"mfa_enabled": False}).eq("id", user_id).execute()
        except Exception as e:
            print(f"Warning: could not sync mfa_enabled after unenroll: {e}")

        return {"message": "MFA disabled successfully"}

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
            "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type":  "application/json",
        }
        payload = {
            "email": email,
            "data":  {"name": name, "role": role, "tenant_id": tenant_id},
        }
        invite_url = f"{settings.SUPABASE_URL}/auth/v1/invite"
        if redirect_to:
            invite_url += "?redirect_to=" + quote(redirect_to, safe=":/")

        async with httpx.AsyncClient() as client:
            resp = await client.post(invite_url, json=payload, headers=auth_headers)

        if resp.status_code >= 400:
            error_msg = (
                resp.json().get("msg", resp.text)
                if "application/json" in resp.headers.get("Content-Type", "")
                else resp.text
            )
            raise AuthError("INVITE_ERROR", error_msg, resp.status_code)

        data = resp.json()
        return {"user_id": data["id"], "email": email, "message": "Invite email sent"}

    # ── User Status ───────────────────────────────────────────

    @staticmethod
    async def get_user_status(user_id: str) -> dict:
        admin = get_admin_client()

        res = (
            admin.table("users")
            .select("id, name, role, tenant_id, has_password, is_registered")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if not res.data:
            raise AuthError("NOT_FOUND", "User profile not found", 404)

        user_data = res.data

        # Check MFA status from Supabase auth factors (only for non-students)
        if user_data.get("role") != "student":
            try:
                auth_headers = {
                    "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                    "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
                }
                async with httpx.AsyncClient() as http:
                    resp = await http.get(
                        f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                        headers=auth_headers
                    )
                    if resp.status_code == 200:
                        factors = resp.json().get("factors", [])
                        mfa_enabled = False
                        for f in factors:
                            if f.get("factor_type") == "totp" and f.get("status") == "verified":
                                mfa_enabled = True
                                break
                        user_data["mfa_enabled"] = mfa_enabled
                    else:
                        print(f"DEBUG: Status check failed ({resp.status_code}): {resp.text}")
                        user_data["mfa_enabled"] = False
            except Exception as e:
                print(f"MFA Factor check failed for {user_id}: {e}")
                user_data["mfa_enabled"] = False
        else:
            user_data["mfa_enabled"] = False

        return user_data

    # ── Refresh Session ───────────────────────────────────────

    @staticmethod
    async def refresh_session(refresh_token: str) -> dict:
        admin = get_admin_client()

        # Student manual-OTP sessions use a placeholder refresh token — not refreshable
        if refresh_token in ("manual-otp-verified", "pending-mfa"):
            raise AuthError("INVALID_CREDENTIALS", "Manual OTP sessions cannot be refreshed. Please log in again.", 401)

        try:
            auth_client = _disposable_auth_client()
            result = auth_client.auth.refresh_session(refresh_token)
        except AuthApiError:
            raise AuthError("INVALID_CREDENTIALS", "Refresh token is invalid or expired", 401)

        session = result.session
        user    = result.user
        if not session or not user:
            raise AuthError("INVALID_CREDENTIALS", "Could not refresh session", 401)

        user_row = (
            admin.table("users")
            .select("id, name, role, tenant_id, is_registered")
            .eq("id", user.id)
            .single()
            .execute()
        )

        user_data   = user_row.data
        mfa_enabled = any(
            getattr(f, 'factor_type', '') == 'totp' and getattr(f, 'status', '') == 'verified'
            for f in (user.factors or [])
        )
        user_data["mfa_enabled"] = mfa_enabled

        return {
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token,
            "token_type":    "bearer",
            "user":          user_data,
        }