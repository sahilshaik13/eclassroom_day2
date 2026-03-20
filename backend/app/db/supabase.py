"""
Two Supabase clients:

1. `get_admin_client()`
   Uses SERVICE_ROLE key — bypasses RLS entirely.
   Used ONLY for admin-level operations and seeding.

2. `get_user_client(token)`
   Uses the user's own JWT for RLS-enforced queries.

   Two JWT types exist:
   - Real Supabase JWTs (teachers, admins): issued by Supabase GoTrue.
     Uses set_session() — GoTrue recognises them.
   - Custom HS256 JWTs (students via OTP): issued by our backend.
     GoTrue rejects them at set_session() with 403 because it didn't
     issue them. Fix: detect custom JWTs by checking provider=sms in
     app_metadata, then set the Bearer header directly on the PostgREST
     client instead. PostgREST accepts them because they are signed with
     the same SUPABASE_JWT_SECRET.
"""
import jwt as pyjwt
from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """
    Singleton Supabase admin client (service role).
    Never expose this token to the frontend.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _is_custom_student_jwt(jwt_token: str) -> bool:
    """
    Returns True if the JWT is our custom HS256 student token
    (issued by auth_service._issue_session, not by Supabase GoTrue).
    Detected by provider=sms in app_metadata.
    """
    try:
        payload = pyjwt.decode(
            jwt_token,
            options={"verify_signature": False},
            algorithms=["HS256", "ES256"],
        )
        return payload.get("app_metadata", {}).get("provider") == "sms"
    except Exception:
        return False


def get_user_client(jwt_token: str, refresh_token: str = "") -> Client:
    """
    Create a Supabase client scoped to the user's JWT.
    RLS policies will apply — queries return only what the user is allowed to see.

    - Real Supabase JWTs (teacher/admin): use set_session() normally.
    - Custom student JWTs: set Authorization header directly on PostgREST,
      bypassing GoTrue's signature validation entirely.
    """
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

    if _is_custom_student_jwt(jwt_token):
        # PostgREST validates against SUPABASE_JWT_SECRET — same key we used to sign.
        # GoTrue is never called so the 403 never happens.
        client.postgrest.auth(jwt_token)
    else:
        # Real Supabase JWT — normal session flow
        try:
            client.auth.set_session(
                access_token=jwt_token,
                refresh_token=refresh_token or "placeholder",
            )
        except Exception:
            # Last-resort fallback — set header directly
            client.postgrest.auth(jwt_token)

    return client