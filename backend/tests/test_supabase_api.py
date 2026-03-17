import asyncio, httpx, os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

async def main():
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{url}/auth/v1/admin/users",
            json={
                "phone": "+971509999999",
                "phone_confirm": True,
                "app_metadata": {"role": "student"},
                "user_metadata": {"name": "API Test"}
            },
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": "application/json"
            }
        )
        print("Status:", resp.status_code)
        print("Body:", resp.text)
        
        if resp.status_code < 300:
            uid = resp.json().get("id")
            await client.delete(f"{url}/auth/v1/admin/users/{uid}", headers={
                "Authorization": f"Bearer {key}", "apikey": key
            })

asyncio.run(main())
