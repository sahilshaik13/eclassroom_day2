"""
AuthService — thin wrapper around Supabase Auth.

Supabase handles:
  - OTP generation, delivery (Twilio), expiry, and verification
  - Email+password login
  - TOTP MFA enroll / challenge / verify
  - Session JWT issuance

FastAPI's job:
  - Forward requests to Supabase Auth
  - Set custom app_metadata (role, tenant_id, mfa_verified) on the user
  - Validate the returned JWT on subsequent requests
"""
from typing import Optional
from supabase import Client
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
        """
        Trigger Supabase to send a 6-digit OTP to the phone number.
        Supabase uses the Twilio integration configured in the Auth settings.

        Before sending, verify the phone belongs to a student in this tenant.
        Unknown numbers must NOT receive an OTP.
        """
        admin = get_admin_client()

        from postgrest.exceptions import APIError as PostgrestAPIError

        # .maybe_single() raises APIError(code='204') in newer postgrest-py
        # when no row is found, instead of returning data=None.
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
                result = types.SimpleNamespace(data=None)  # treat as "no row found"
            else:
                raise AuthError("INTERNAL_ERROR", str(e), 500)

        if not result.data:
            # Security: don't reveal that the phone doesn't exist
            raise AuthError("INVALID_CREDENTIALS", "Phone number not registered or OTP could not be sent", 401)

        if result.data.get("deactivated_at"):
            raise AuthError("INVALID_CREDENTIALS", "Account is deactivated", 401)

        # Supabase sends the OTP
        try:
            admin.auth.sign_in_with_otp({"phone": phone})
        except AuthApiError as e:
            raise AuthError("INTERNAL_ERROR", str(e), 500)

        response = {"message": "OTP sent successfully"}

        # In dev mode Supabase doesn't send real SMS — it returns the OTP in the response
        # (only when using the Supabase test phone numbers or email OTP fallback)
        if not settings.is_production:
            response["note"] = "In development, check Supabase Auth logs for the OTP or use a test phone number"

        return response

    @staticmethod
    async def verify_otp(phone: str, token: str, tenant_id: str) -> dict:
        """
        Verify the OTP. Returns the Supabase session on success.
        Raises AuthError on failure.
        """
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

        # Fetch our app user record to include role in response
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
        """Sign in with email + password via Supabase."""
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
        mfa_enrolled = bool(user.factors)  # True if user has any MFA factors

        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "token_type": "bearer",
            "user": user_row.data,
            "mfa_required": role == "admin",
            "mfa_enrolled": mfa_enrolled,
        }

    # ── TOTP MFA (Admin) ──────────────────────────────────────

    @staticmethod
    async def mfa_enroll(user_jwt: str, refresh_token: str = "") -> dict:
        """
        Enroll admin in TOTP using Supabase MFA API.
        Returns QR code URI and secret for manual entry.

        NOTE: We call the Supabase REST API directly instead of using
        gotrue-py's mfa.enroll() because gotrue-py 2.9.0 has a Pydantic
        model bug (requires a 'phone' field not returned for TOTP).
        """
        import httpx

        auth_headers = {
            "Authorization": f"Bearer {user_jwt}",
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient() as client:
            # Step 1: Delete any existing unverified TOTP factors
            # (from previous incomplete enrollment attempts)
            try:
                list_resp = await client.get(
                    f"{settings.SUPABASE_URL}/auth/v1/factors",
                    headers=auth_headers,
                )
                if list_resp.status_code == 200:
                    factors = list_resp.json()
                    for f in factors:
                        if f.get("factor_type") == "totp" and f.get("status") != "verified":
                            await client.delete(
                                f"{settings.SUPABASE_URL}/auth/v1/factors/{f['id']}",
                                headers=auth_headers,
                            )
            except httpx.HTTPError:
                pass  # best-effort cleanup

            # Step 2: Enroll new TOTP factor
            body = {
                "factor_type": "totp",
                "friendly_name": "Authenticator App",
                "issuer": "eClassroom",
            }

            try:
                resp = await client.post(
                    f"{settings.SUPABASE_URL}/auth/v1/factors",
                    json=body,
                    headers=auth_headers,
                )
            except httpx.HTTPError as e:
                raise AuthError("MFA_ERROR", f"Network error during MFA enroll: {e}", 500)

            if resp.status_code >= 400:
                try:
                    detail = resp.json()
                except Exception:
                    detail = resp.text
                raise AuthError("MFA_ERROR", f"Supabase MFA enroll failed: {detail}", resp.status_code)

            data = resp.json()

        totp = data.get("totp", {})
        return {
            "factor_id": data["id"],
            "qr_code": totp.get("qr_code", ""),
            "secret": totp.get("secret", ""),
            "uri": totp.get("uri", ""),
        }


    @staticmethod
    async def mfa_verify(user_jwt: str, refresh_token: str, factor_id: str, code: str) -> dict:
        """
        Complete TOTP verification. Returns upgraded session with mfa_verified=true.
        """
        from app.db.supabase import get_user_client
        client = get_user_client(user_jwt, refresh_token)

        try:
            # Step 1: Create challenge
            challenge = client.auth.mfa.challenge({"factor_id": factor_id})
            # Step 2: Verify
            result = client.auth.mfa.verify({
                "factor_id": factor_id,
                "challenge_id": challenge.id,
                "code": code,
            })
        except AuthApiError as e:
            raise AuthError("INVALID_CREDENTIALS", "Invalid TOTP code", 401)

        return {
            "access_token": result.session.access_token,
            "refresh_token": result.session.refresh_token,
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
        """
        Supabase sends an invite email with a set-password link.
        After accepting, we set the user's app_metadata.
        """
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
