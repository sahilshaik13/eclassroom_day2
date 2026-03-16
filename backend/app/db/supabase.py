"""
Two Supabase clients:

1. `get_admin_client()`
   Uses SERVICE_ROLE key — bypasses RLS entirely.
   Used ONLY for:
     - Writing audit logs
     - Admin-level operations in /admin/* routes
     - Seeding / migrations

2. `get_user_client(token)`
   Uses the user's own JWT — RLS is enforced by Supabase.
   Used for all student and teacher data queries so that
   the database itself acts as the final security layer.
"""
from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_admin_client() -> Client:
    """
    Singleton Supabase admin client (service role).
    Never expose this to the frontend or pass its token to users.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(jwt_token: str, refresh_token: str = "") -> Client:
    """
    Create a Supabase client scoped to the user's JWT.
    RLS policies will apply — queries return only what the
    user is allowed to see.
    """
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.auth.set_session(access_token=jwt_token, refresh_token=refresh_token)
    return client
