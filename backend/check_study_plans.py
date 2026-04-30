import os
from supabase import create_client
from dotenv import load_dotenv

# Load from root/envsec/.env
load_dotenv("../envsec/.env")

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Missing Supabase credentials")
    exit(1)

supabase = create_client(url, key)

try:
    # Try to fetch one row and check keys
    res = supabase.table("study_plans").select("*").limit(1).execute()
    if res.data:
        print("Columns in study_plans:", res.data[0].keys())
    else:
        print("No data in study_plans, trying RPC or another way...")
        # Fallback: check if we can add the column
except Exception as e:
    print("Error:", e)
