"""
AuthService — thin wrapper around Supabase Auth.
"""
import random
import jwt
import httpx
import base64
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from twilio.rest import Client as TwilioClient
from supabase import create_client
from gotrue.errors import AuthApiError

from app.db.supabase import get_admin_client
from app.core.config import settings
from app.services.student_attendance_service import record_login_attendance


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

    @staticmethod
    def _record_student_login_attendance(
        student_id: Optional[str],
        user_id: Optional[str],
        tenant_id: Optional[str],
    ) -> None:
        """Record login log + unique calendar day (first login preserved)."""
        record_login_attendance(
            student_id=student_id,
            user_id=user_id,
            tenant_id=tenant_id,
        )

    # ── OTP (Student phone login) ─────────────────────────────

    @staticmethod
    def _resolve_competition_tenant(admin, competition_id: str) -> str:
        res = (
            admin.table("competitions")
            .select("tenant_id, status")
            .eq("id", competition_id)
            .limit(1)
            .execute()
        )
        if not res or not res.data:
            raise AuthError("NOT_FOUND", "Competition not found", 404)
        row = res.data[0]
        if row.get("status") == "closed":
            raise AuthError("COMPETITION_CLOSED", "This competition is closed", 400)
        return str(row["tenant_id"])

    @staticmethod
    async def send_otp(
        phone: str,
        tenant_id: Optional[str],
        context: str = "classroom",
        competition_id: Optional[str] = None,
    ) -> dict:
        admin = get_admin_client()
        # Normalize: keep only digits and leading +
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))

        if context == "classroom":
            try:
                # Auto-resolve: look up student globally (or within tenant if provided)
                query = admin.table("students").select("id, user_id, deactivated_at, tenant_id, phone").eq("phone", phone)
                if tenant_id:
                    query = query.eq("tenant_id", tenant_id)
                result = query.execute()

                # Fallback: suffix match for format differences (+91XXXXXXXXXX vs XXXXXXXXXX)
                if not result or not result.data:
                    digits_only = phone.lstrip("+")
                    last10 = digits_only[-10:] if len(digits_only) >= 10 else digits_only
                    suffix_q = admin.table("students").select(
                        "id, user_id, deactivated_at, tenant_id, phone"
                    ).ilike("phone", f"%{last10}")
                    if tenant_id:
                        suffix_q = suffix_q.eq("tenant_id", tenant_id)
                    suffix_res = suffix_q.limit(5).execute()
                    matched = [
                        s
                        for s in (suffix_res.data or [])
                        if str(s.get("phone") or "").lstrip("+").endswith(last10)
                    ]
                    if matched:
                        phone = matched[0]["phone"]
                        result = type("obj", (object,), {"data": matched})()
            except Exception as e:
                raise AuthError("INTERNAL_ERROR", f"Database query failed: {str(e)}", 500)

            if not result or not result.data:
                raise AuthError(
                    "NOT_REGISTERED",
                    "This phone number is not registered. Student access is invite-only.",
                    401
                )

            student_data = result.data[0]
            if student_data.get("deactivated_at"):
                raise AuthError("ACCOUNT_DISABLED", "Account is deactivated", 401)

            # ✅ Always resolve tenant_id from the matched student record
            tenant_id = student_data["tenant_id"]

        elif context == "competition":
            if not competition_id:
                raise AuthError(
                    "INVALID_REQUEST",
                    "competition_id is required to join a competition",
                    400,
                )
            tenant_id = AuthService._resolve_competition_tenant(admin, str(competition_id))
            # Optional: normalize phone / block deactivated accounts for known students
            try:
                stu_res = (
                    admin.table("students")
                    .select("phone, deactivated_at")
                    .eq("phone", phone)
                    .eq("tenant_id", tenant_id)
                    .maybe_single()
                    .execute()
                )
                if stu_res and stu_res.data:
                    if stu_res.data.get("deactivated_at"):
                        raise AuthError("ACCOUNT_DISABLED", "Account is deactivated", 401)
                    phone = stu_res.data.get("phone") or phone
            except AuthError:
                raise
            except Exception:
                pass

        if not tenant_id:
            raise AuthError("INVALID_REQUEST", "tenant_id is required for non-classroom context", 400)

        tenant_id = str(tenant_id)

        # Check if the tenant itself is active
        tenant_res = (
            admin.table("tenants")
            .select("is_active")
            .eq("id", tenant_id)
            .maybe_single()
            .execute()
        )
        if tenant_res and tenant_res.data and not tenant_res.data.get("is_active", True):
            raise AuthError(
                "TENANT_SUSPENDED",
                "Your organization account has been suspended. Please contact your platform administrator.",
                403,
            )

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
            if not settings.is_production:
                return {
                    "message": "OTP sent successfully",
                    "dev_otp": otp_code,
                    "tenant_id": tenant_id,
                }
            raise AuthError("INTERNAL_ERROR", f"SMS delivery failed: {str(e)}", 500)

        return {"message": "OTP sent successfully", "tenant_id": tenant_id}

    @staticmethod
    async def verify_otp(phone: str, token: str, tenant_id: Optional[str], competition_id: Optional[str] = None) -> dict:
        admin = get_admin_client()
        phone = "".join(filter(lambda x: x.isdigit() or x == '+', phone))

        # Auto-resolve tenant_id from phone or competition link
        if not tenant_id:
            if competition_id:
                try:
                    tenant_id = AuthService._resolve_competition_tenant(
                        admin, str(competition_id)
                    )
                except AuthError:
                    raise
                except Exception as e:
                    raise AuthError(
                        "INTERNAL_ERROR", f"Failed to load competition: {str(e)}", 500
                    )
            else:
                try:
                    stu_lookup = (
                        admin.table("students")
                        .select("tenant_id, phone")
                        .eq("phone", phone)
                        .maybe_single()
                        .execute()
                    )
                    if stu_lookup and stu_lookup.data:
                        tenant_id = stu_lookup.data["tenant_id"]
                        phone = stu_lookup.data["phone"]
                except Exception:
                    pass

        if not tenant_id:
            raise AuthError("NOT_REGISTERED", "Phone number not registered", 401)

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

        # 3. Handle Student Account Setup (Lazy Allocation)
        is_existing_student = False
        student_record = None
        
        try:
            # First, check the students table for an invite/record
            stu_res = (
                admin.table("students")
                .select("id, user_id, name, tenant_id")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .maybe_single()
                .execute()
            )
            student_record = stu_res.data
        except Exception:
            pass

        if not student_record and not competition_id:
            raise AuthError("NOT_REGISTERED", "Student record not found. Access is invite-only.", 401)

        # 4. Find or Create User Record
        user_data = None
        try:
            # Check if a user record already exists for this phone + tenant
            user_res = (
                admin.table("users")
                .select("id, name, role, tenant_id, has_password, is_registered")
                .eq("phone", phone)
                .eq("tenant_id", tenant_id)
                .maybe_single()
                .execute()
            )
            user_data = user_res.data
        except Exception:
            pass

        if not user_data:
            # First-time login: Create the user record
            new_user_id = str(uuid.uuid4())
            try:
                # 1. Insert into users table
                user_res = admin.table("users").insert({
                    "id":            new_user_id,
                    "name":          student_record.get("name", "Student") if student_record else "Participant",
                    "phone":         phone,
                    "role":          "student",
                    "tenant_id":     tenant_id,
                    "is_registered": False,
                    "has_password":  False
                }).execute()
                
                user_data = user_res.data[0]
                
                # 2. Link the student record to this new user
                if student_record:
                    admin.table("students").update({"user_id": new_user_id}).eq("id", student_record["id"]).execute()
                    
            except Exception as e:
                raise AuthError("INTERNAL_ERROR", f"Failed to setup user account: {str(e)}", 500)
        
        # 6. Record login time (OTP flow bypasses Supabase Auth last_sign_in)
        try:
            login_ts = datetime.now(timezone.utc).isoformat()
            admin.table("users").update({"last_login_at": login_ts}).eq("id", user_data["id"]).execute()
        except Exception:
            pass

        AuthService._record_student_login_attendance(
            student_id=student_record["id"] if student_record else None,
            user_id=user_data.get("id"),
            tenant_id=tenant_id,
        )

        if competition_id:
            try:
                from app.services.realtime_events import broadcast_competition_registration

                comp_id_str = str(competition_id)
                reg_name = user_data.get("name") or "Participant"
                reg_res = admin.table("competition_registrations").upsert(
                    {
                        "competition_id": comp_id_str,
                        "tenant_id": tenant_id,
                        "phone": phone,
                        "name": reg_name,
                        "student_id": student_record["id"] if student_record else None,
                        "status": "registered",
                    },
                    on_conflict="competition_id, phone",
                ).execute()
                if reg_res.data:
                    reg = reg_res.data[0]
                    await broadcast_competition_registration(
                        tenant_id=tenant_id,
                        competition_id=comp_id_str,
                        student_id=(
                            (student_record or {}).get("id") or user_data["id"]
                        ),
                        registration_id=reg["id"],
                        student_name=reg_name,
                    )
            except Exception:
                pass

        # 7. Issue full session immediately (no MFA for students)
        access_token = AuthService._issue_session(user_data, mfa_verified=True)
        return {
            "access_token": access_token,
            "refresh_token": "manual-otp-verified",
            "token_type": "bearer",
            "mfa_required": False,
            "mfa_enrolled": False,
            "is_existing_student": is_existing_student,
            "is_competition_participant": bool(competition_id),
            "user": {
                "id":            user_data["id"],
                "student_id":    student_record["id"] if student_record else None,
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
            .maybe_single()
            .execute()
        )
        
        # If not found in users table, check platform_admins (super admin)
        if not user_row or not user_row.data:
            platform_admin_row = (
                admin.table("platform_admins")
                .select("id, name, email")
                .eq("id", user.id)
                .maybe_single()
                .execute()
            )
            if platform_admin_row and platform_admin_row.data:
                # Super admin found - mandatory MFA
                u_data = platform_admin_row.data
                user_data = {
                    "id": u_data["id"],
                    "name": u_data["name"],
                    "email": u_data["email"],
                    "role": "super_admin",
                    "tenant_id": None,
                    "is_registered": True,
                }
                
                # ── Sync metadata to super admin JWT ──────────
                # Ensure Supabase Auth knows this user is a super admin
                await AuthService.update_auth_app_metadata(user.id, {"role": "super_admin", "tenant_id": None})
                
                return {
                    "access_token":  session.access_token,
                    "refresh_token": session.refresh_token,
                    "token_type":    "bearer",
                    "user":          user_data,
                    "mfa_required":  False,  # Temporarily disabled per user request
                    "mfa_enrolled":  False,
                }
            else:
                raise AuthError("NOT_FOUND", "User profile not found", 404)
        
        if not user_row.data:
            raise AuthError("NOT_FOUND", "User profile not found", 404)

        role      = user_row.data.get("role", "")
        tenant_id = user_row.data.get("tenant_id", "")

        # ── Check if tenant is suspended ──────────────────────
        if tenant_id:
            tenant_res = (
                admin.table("tenants")
                .select("is_active")
                .eq("id", tenant_id)
                .maybe_single()
                .execute()
            )
            if tenant_res and tenant_res.data and not tenant_res.data.get("is_active", True):
                if role != "admin":
                    raise AuthError(
                        "TENANT_SUSPENDED",
                        "Your organization account has been suspended. Please contact your platform administrator.",
                        403,
                    )

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
            except Exception:
                pass

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
                pass
        except Exception:
            pass

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
                pa = (
                    admin.table("platform_admins")
                    .select("id")
                    .eq("id", user_id)
                    .maybe_single()
                    .execute()
                )
                if pa.data:
                    try:
                        admin.table("platform_admins").update({"has_password": True}).eq(
                            "id", user_id
                        ).execute()
                    except Exception:
                        pass
        except Exception:
            pass

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
            except Exception:
                pass

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
        except Exception:
            pass

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
        except Exception:
            pass

        return {"message": "MFA disabled successfully"}

    # ── JWT Metadata Sync ─────────────────────────────────────

    @staticmethod
    async def update_auth_app_metadata(user_id: str, metadata: dict) -> bool:
        """
        Update a user's app_metadata in Supabase Auth via Admin API.
        Used to sync role and tenant_id into JWT claims.
        """
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type":  "application/json",
        }
        # GoTrue Admin API: PUT /admin/users/{id}
        url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}"
        payload = {"app_metadata": metadata}

        async with httpx.AsyncClient() as client:
            try:
                resp = await client.put(url, json=payload, headers=auth_headers)
                return resp.status_code < 400
            except Exception:
                return False

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
            print(f"DEBUG Supabase Invite Response: {resp.status_code} - {resp.text}")

        if resp.status_code >= 400:
            error_msg = (
                resp.json().get("msg", resp.text)
                if "application/json" in resp.headers.get("Content-Type", "")
                else resp.text
            )
            print(f"DEBUG: raising AuthError INVITE_ERROR: {error_msg}")
            raise AuthError("INVITE_ERROR", error_msg, resp.status_code)

        data = resp.json()
        user_id = data["id"]

        # ── Sync metadata to newly invited user ──────────────
        # Ensure their JWT will have role and tenant_id in app_metadata
        await AuthService.update_auth_app_metadata(user_id, {"role": role, "tenant_id": tenant_id})

        return {"user_id": user_id, "email": email, "message": "Invite email sent"}

    @staticmethod
    async def resend_invite_or_reset(
        user_id: str,
        email: str,
        role: str,
        tenant_id: str,
        redirect_to: Optional[str] = None,
    ) -> dict:
        """
        Resend an invite for a user who hasn't completed registration.
        - If email NOT confirmed → resend /auth/v1/invite
        - If email confirmed but has_password = false → send password-reset link
        - If has_password = true → raise AuthError (no action needed)
        """
        from urllib.parse import quote

        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey":        settings.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type":  "application/json",
        }

        # Fetch current auth user state from Supabase
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=auth_headers,
            )
        if user_resp.status_code >= 400:
            raise AuthError("NOT_FOUND", "Auth user not found", 404)

        auth_user = user_resp.json()
        email_confirmed = bool(auth_user.get("email_confirmed_at"))

        if not email_confirmed:
            # Email not confirmed — re-send invite
            invite_url = f"{settings.SUPABASE_URL}/auth/v1/invite"
            if redirect_to:
                invite_url += "?redirect_to=" + quote(redirect_to, safe=":/")
            payload = {
                "email": email,
                "data": {"name": auth_user.get("user_metadata", {}).get("name", ""), "role": role, "tenant_id": tenant_id},
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(invite_url, json=payload, headers=auth_headers)
            if resp.status_code >= 400:
                error_msg = resp.json().get("msg", resp.text)
                raise AuthError("INVITE_ERROR", error_msg, resp.status_code)
            return {"message": "Invite email resent", "method": "invite"}
        else:
            # Email confirmed but password not set — send password reset link
            gen_url = f"{settings.SUPABASE_URL}/auth/v1/admin/generate_link"
            payload = {
                "type": "recovery",
                "email": email,
            }
            if redirect_to:
                payload["redirect_to"] = redirect_to
            async with httpx.AsyncClient() as client:
                resp = await client.post(gen_url, json=payload, headers=auth_headers)
            if resp.status_code >= 400:
                error_msg = resp.json().get("msg", resp.text)
                raise AuthError("RESET_ERROR", error_msg, resp.status_code)
            return {"message": "Password setup email sent", "method": "recovery"}

    @staticmethod
    async def _email_is_staff_account(email: str) -> bool:
        """True if email belongs to admin, teacher, or platform super admin."""
        normalized = email.strip().lower()
        admin = get_admin_client()
        user_res = (
            admin.table("users")
            .select("role")
            .eq("email", normalized)
            .maybe_single()
            .execute()
        )
        if user_res.data:
            return user_res.data.get("role") in ("admin", "teacher")
        pa_res = (
            admin.table("platform_admins")
            .select("id")
            .eq("email", normalized)
            .maybe_single()
            .execute()
        )
        return bool(pa_res.data)

    @staticmethod
    async def request_password_reset(email: str, redirect_to: Optional[str] = None) -> dict:
        """
        Send a password recovery email via Supabase Auth (staff roles only).
        Always returns a generic success message to avoid email enumeration.
        """
        normalized = email.strip().lower()
        generic = {
            "message": "If an account exists for this email, you will receive a password reset link shortly."
        }

        if not normalized or "@" not in normalized:
            return generic

        if not await AuthService._email_is_staff_account(normalized):
            return generic

        target = redirect_to or f"{settings.FRONTEND_URL.rstrip('/')}/auth/reset-password"
        headers = {
            "apikey": settings.SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.SUPABASE_URL}/auth/v1/recover",
                json={"email": normalized, "redirect_to": target},
                headers=headers,
            )
        if resp.status_code >= 400:
            # Do not leak whether the address exists
            return generic
        return generic

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
                        user_data["mfa_enabled"] = False
            except Exception:
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
            "expires_in":    session.expires_in,
            "user":          user_data,
        }

    # ── Admin Deletion ───────────────────────────────────────

    @staticmethod
    async def delete_auth_user(user_id: str):
        """Permanently delete a user from Supabase Auth."""
        auth_headers = {
            "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.delete(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}",
                headers=auth_headers
            )
            if resp.status_code >= 400:
                print(f"DEBUG: Failed to delete auth user {user_id}: {resp.text}")
                # We don't necessarily want to crash the whole request if auth deletion fails
                # but we should log it.