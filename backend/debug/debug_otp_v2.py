import traceback
from app.db.supabase import get_admin_client

def debug_otp():
    admin = get_admin_client()
    phone = '+919347151331'
    print(f"Attempting OTP for {phone}")
    try:
        # Some versions of gotrue-py require specific keys or use a different method
        res = admin.auth.sign_in_with_otp({"phone": phone})
        print(f"Result: {res}")
    except Exception as e:
        print(f"Caught exception: {type(e).__name__}: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    debug_otp()
