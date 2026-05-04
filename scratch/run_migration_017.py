import os
import sys
from dotenv import load_dotenv

# Add backend to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))
load_dotenv(os.path.join(os.getcwd(), "backend", ".env"))

from app.db.supabase import get_admin_client

def run_migration_017():
    admin = get_admin_client()
    
    migration_path = os.path.join(os.getcwd(), "backend", "supabase", "migrations", "017_progress_metrics.sql")
    with open(migration_path, "r") as f:
        sql = f.read()
    
    # We'll split by semicolon to run statements, though psql-like execution is better.
    # Actually, we can use 'supabase db execute' via stdin
    print("Running migration 017 via npx supabase db execute...")

if __name__ == "__main__":
    run_migration_017()
