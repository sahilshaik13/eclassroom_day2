import asyncio
import os
import sys

# Add the parent directory to sys.path so we can import from app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.supabase import get_admin_client

async def main():
    admin = get_admin_client()
    # List users in our users table that are teachers but not registered
    users_res = admin.table("users").select("id, email, name, role, is_registered").eq("role", "teacher").execute()
    print("Teachers in DB:")
    for u in users_res.data:
        print(f" - {u['email']} (id: {u['id']}, registered: {u['is_registered']})")
        
        # Now fetch from supabase auth
        try:
            import httpx
            from app.core.config import settings
            auth_headers = {
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users/{u['id']}",
                    headers=auth_headers
                )
                if res.status_code == 200:
                    auth_user = res.json()
                    print(f"   => app_metadata: {auth_user.get('app_metadata')}")
                    print(f"   => user_metadata: {auth_user.get('user_metadata')}")
                else:
                    print(f"   => Failed to get auth user: {res.status_code} {res.text}")
        except Exception as e:
            print(f"   => Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
