"""
Run from the backend directory with the venv active:
  python debug_jwt.py

Paste a token from the browser (F12 → Application → Local Storage → access_token)
and this script will tell you EXACTLY why verification fails.
"""
import base64, sys
from jose import jwt, JWTError

# ── 1. Load the secret from .env ───────────────────────────────
import os
from dotenv import load_dotenv
load_dotenv()

raw_secret = os.getenv("SUPABASE_JWT_SECRET", "")
print(f"Raw secret length  : {len(raw_secret)} chars")
print(f"Raw secret preview : {raw_secret[:30]}...")

# Try base64 decode
try:
    decoded_secret = base64.b64decode(raw_secret)
    print(f"Base64-decoded len : {len(decoded_secret)} bytes  ✓")
except Exception as e:
    decoded_secret = raw_secret.encode()
    print(f"Not base64 ({e}), using raw UTF-8 bytes")

# ── 2. Get a token to test ─────────────────────────────────────
token_input = (
    sys.argv[1]
    if len(sys.argv) > 1
    else input("\nPaste the access_token from localStorage (or press Enter to skip): ").strip()
)

if not token_input:
    print("\n[INFO] No token provided — checking secret format only.")

    # Just show the header of a dummy structure
    print("\nSecret summary:")
    print(f"  Raw (first 20 chars) : {raw_secret[:20]}")
    print(f"  Decoded bytes (hex)  : {decoded_secret[:16].hex()}...")
    sys.exit(0)

# ── 3. Decode header without verification ────────────────────────
try:
    header = jwt.get_unverified_header(token_input)
    claims = jwt.get_unverified_claims(token_input)
    import time
    exp = claims.get("exp", 0)
    now = int(time.time())
    print(f"\nToken header  : {header}")
    print(f"Token alg     : {header.get('alg')}")
    print(f"Token sub     : {claims.get('sub', '???')[:12]}...")
    print(f"Token role    : {claims.get('role')}")
    print(f"app_metadata  : {claims.get('app_metadata')}")
    print(f"Expires at    : {exp}  (now={now}, {'EXPIRED ✗' if now > exp else 'valid ✓'})")
except Exception as e:
    print(f"\n[ERROR] Could not parse token header/claims: {e}")
    sys.exit(1)

# ── 4. Try verification with DECODED secret ───────────────────
print("\n--- Trying with base64-DECODED secret ---")
try:
    payload = jwt.decode(token_input, decoded_secret, algorithms=["HS256"], options={"verify_aud": False})
    print("  ✅ SUCCESS! Token is valid. app_metadata:", payload.get("app_metadata"))
except JWTError as e:
    print(f"  ✗ FAILED: {e}")

# ── 5. Try verification with RAW string secret ────────────────
print("\n--- Trying with RAW string secret (no base64 decode) ---")
try:
    payload = jwt.decode(token_input, raw_secret, algorithms=["HS256"], options={"verify_aud": False})
    print("  ✅ SUCCESS! Token is valid. app_metadata:", payload.get("app_metadata"))
except JWTError as e:
    print(f"  ✗ FAILED: {e}")
