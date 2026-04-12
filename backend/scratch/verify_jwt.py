import os
import jwt
import base64
from dotenv import load_dotenv

load_dotenv()

anon_key = os.getenv("SUPABASE_ANON_KEY")
jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

if not anon_key or not jwt_secret:
    print("Missing key or secret in .env")
    exit(1)

print(f"Testing JWT Secret: {jwt_secret[:10]}...")

# Method 1: Raw string encode
try:
    decoded = jwt.decode(anon_key, jwt_secret.encode(), algorithms=["HS256"], options={"verify_aud": False})
    print("SUCCESS: Method 1 (Raw string)")
except Exception as e:
    print(f"FAILED: Method 1 (Raw string): {e}")

# Method 2: Base64 decode
try:
    secret_bytes = base64.b64decode(jwt_secret)
    decoded = jwt.decode(anon_key, secret_bytes, algorithms=["HS256"], options={"verify_aud": False})
    print("SUCCESS: Method 2 (Base64 decode)")
except Exception as e:
    print(f"FAILED: Method 2 (Base64 decode): {e}")
