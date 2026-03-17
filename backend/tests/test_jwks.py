"""Quick test of corrected JWKS URL"""
import os
from dotenv import load_dotenv
load_dotenv()
from jwt import PyJWKClient
import jwt as pyjwt

url = os.getenv("SUPABASE_URL", "")
jwks_url = f"{url}/auth/v1/.well-known/jwks.json"
print(f"JWKS URL: {jwks_url}")

try:
    client = PyJWKClient(jwks_url, cache_keys=True)
    jwk_set = client.get_jwk_set()
    print(f"JWKS loaded OK! Keys: {len(jwk_set.keys)}")
    for k in jwk_set.keys:
        print(f"  kid={k.key_id}  kty={k.key_type}")
    print("\nES256 verification should now work!")
except Exception as e:
    print(f"JWKS fetch FAILED: {e}")
