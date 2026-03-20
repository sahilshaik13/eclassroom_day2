from app.core.config import settings
import base64

def run():
    raw = settings.SUPABASE_JWT_SECRET
    print(f"Secret length: {len(raw)}")
    try:
        decoded = base64.b64decode(raw)
        print("Successfully base64 decoded")
    except Exception as e:
        print(f"Base64 decode failed: {e}")

if __name__ == "__main__":
    run()
