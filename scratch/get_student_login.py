import os
import sys
from dotenv import load_dotenv

# Add backend to sys.path to import app modules
sys.path.append(os.path.join(os.getcwd(), "backend"))

load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db.supabase import get_admin_client

def get_test_student():
    admin = get_admin_client()
    res = admin.table("students").select("id, name, user_id, users(phone)").limit(5).execute()
    for row in (res.data or []):
        phone = row.get("users", {}).get("phone")
        if phone:
            print(f"Name: {row['name']}, Phone: {phone}, ID: {row['id']}")

if __name__ == "__main__":
    get_test_student()
