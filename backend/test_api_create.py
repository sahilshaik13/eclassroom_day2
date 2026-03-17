import httpx
import jwt
import os
from dotenv import load_dotenv

load_dotenv()
secret = os.getenv("SUPABASE_JWT_SECRET")

# Mock Admin Token
token = jwt.encode({
    "sub": "admin_test_uuid",
    "role": "admin",
    "app_metadata": {"role": "admin", "tenant_id": "00000000-0000-0000-0000-000000000001"},
    "user_metadata": {"name": "Test Admin"},
    "mfa_verified": True
}, secret, algorithm="HS256")

headers = {"Authorization": f"Bearer {token}"}

with httpx.Client(base_url="http://localhost:8000/api/v1") as client:
    resp = client.post("/admin/students", headers=headers, json={
        "name": "Integration Test Student",
        "phone": "+971501234567"
    })
    print("Status:", resp.status_code)
    print("Body:", resp.text)
