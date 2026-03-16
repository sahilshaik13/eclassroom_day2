import asyncio
import httpx
from app.core.config import settings

SUPABASE_URL = settings.SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY = settings.SUPABASE_SERVICE_ROLE_KEY

async def test_invite_httpx():
    import json
    auth_headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
    }
    
    async with httpx.AsyncClient() as client:
        # invite API payload
        payload = {
            "email": "test_teacher_api@gmail.com",
            "data": {
                "name": "Test Api",
                "role": "teacher",
                "tenant_id": "test_tenant"
            }
        }
        res = await client.post(
            f"{SUPABASE_URL}/auth/v1/invite",
            json=payload,
            headers=auth_headers
        )
        print("Status Code:", res.status_code)
        
        try:
            print("Response:", json.dumps(res.json(), indent=2))
        except:
            print("Response Text:", res.text)
            
if __name__ == "__main__":
    asyncio.run(test_invite_httpx())
