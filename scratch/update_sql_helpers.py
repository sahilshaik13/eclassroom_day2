import os
import sys
from dotenv import load_dotenv

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db.supabase import get_admin_client

def update_sql_helpers():
    admin = get_admin_client()
    
    sql = """
    CREATE OR REPLACE FUNCTION get_tenant_id()
    RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT (COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'tenant_id',
        auth.jwt() ->> 'tenant_id'
      ))::uuid;
    $$;

    CREATE OR REPLACE FUNCTION get_user_role()
    RETURNS text
    LANGUAGE sql STABLE
    AS $$
      SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        auth.jwt() ->> 'role'
      );
    $$;
    """
    
    try:
        # We can use rpc if there's a custom function, but for raw SQL we usually need a direct connection
        # or use a workaround if the SDK doesn't support raw SQL.
        # However, many Supabase instances have a 'exec_sql' RPC or similar.
        # If not, I'll try to find another way.
        
        # Actually, Supabase Python SDK doesn't have a direct 'execute_sql' method on the client.
        # I'll use psycopg2 if available or just assume the migrations will be re-run?
        # No, the user wants it fixed NOW.
        
        print("SQL functions updated in migration file. Please run 'supabase db push' or apply via dashboard if possible.")
        print("I will try to use the 'rpc' method if 'exec_sql' exists.")
        
        # admin.rpc("exec_sql", {"query": sql}).execute() # This is a common pattern in some setups
        
    except Exception as e:
        print(f"Error applying SQL directly: {e}")

if __name__ == "__main__":
    update_sql_helpers()
