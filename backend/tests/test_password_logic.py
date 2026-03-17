import asyncio
import os
import json
from app.db.supabase import get_admin_client
from app.services.auth_service import AuthService

async def check_migration():
    print("--- Checking Migration Status ---")
    admin = get_admin_client()
    try:
        # Check if has_password column exists
        res = admin.table("users").select("has_password").limit(1).execute()
        print("Column 'has_password' exists.")
        return True
    except Exception as e:
        print(f"Error: Column 'has_password' might be missing: {str(e)}")
        return False

async def verify_logic():
    print("\n--- Verifying Logic ---")
    admin = get_admin_client()
    # Use demo teacher or any user
    res = admin.table("users").select("id, email, has_password").limit(1).execute()
    if not res.data:
        print("No users found in database.")
        return
    
    user = res.data[0]
    user_id = user["id"]
    print(f"Testing with User: {user.get('email', 'N/A')} (ID: {user_id})")
    
    # Save original state
    orig_has_password = user["has_password"]
    print(f"Original has_password: {orig_has_password}")
    
    try:
        # Test update
        print("Setting has_password to False...")
        admin.table("users").update({"has_password": False}).eq("id", user_id).execute()
        
        status = await AuthService.get_user_status(user_id)
        print(f"get_user_status returned has_password: {status['has_password']}")
        
        print("Setting has_password to True...")
        admin.table("users").update({"has_password": True}).eq("id", user_id).execute()
        
        status = await AuthService.get_user_status(user_id)
        print(f"get_user_status returned has_password: {status['has_password']}")
        
    finally:
        # Restore original state
        admin.table("users").update({"has_password": orig_has_password}).eq("id", user_id).execute()
        print("Restored original state.")

async def main():
    if await check_migration():
        await verify_logic()

if __name__ == "__main__":
    asyncio.run(main())
