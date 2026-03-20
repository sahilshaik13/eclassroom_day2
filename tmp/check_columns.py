from app.db.supabase import get_admin_client
import json

def run():
    admin = get_admin_client()
    res = admin.table("users").select("*").limit(1).execute()
    if res.data:
        print(json.dumps(list(res.data[0].keys()), indent=2))
    else:
        print("No users found")

if __name__ == "__main__":
    run()
