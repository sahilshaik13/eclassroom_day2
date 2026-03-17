import asyncio
from app.db.supabase import get_admin_client

async def main():
    admin = get_admin_client()
    try:
        res = admin.auth.admin.create_user({
            "phone": "+12345678901",
            "phone_confirm": True,
            "app_metadata": {"role": "student", "tenant_id": "test"},
            "user_metadata": {"name": "Test Student"},
        })
        print("Success:", res)
    except Exception as e:
        print("Error:", repr(e))

if __name__ == "__main__":
    asyncio.run(main())
