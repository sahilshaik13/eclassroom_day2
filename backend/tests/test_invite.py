import asyncio
import os
import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "dummy")

async def test_invite():
    # Since we saw a bug with gotrue-py dict/kwargs before, maybe we can just try calling the REST API or see what gotrue-py does.
    from app.db.supabase import get_admin_client
    from gotrue.errors import AuthApiError
    
    admin = get_admin_client()
    try:
        # What does options kwargs look like?
        res = admin.auth.admin.invite_user_by_email("test_teacher2@example.com", options={"data": {"name": "Test", "role": "teacher", "tenant_id": "test_tenant"}})
        print("Success!", res)
    except Exception as e:
        print("Error!", type(e), str(e))

if __name__ == "__main__":
    asyncio.run(test_invite())
