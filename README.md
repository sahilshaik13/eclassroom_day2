# ThinkTarteeb E-Classroom

**Stack:** Vite + React 19 + TypeScript · FastAPI (Python) · Supabase (PostgreSQL + Auth + RLS)

## Architecture

```
┌─────────────────────┐     HTTPS      ┌──────────────────────────┐
│   Vite / React      │ ──────────────▶│   FastAPI (Python)       │
│   (port 5173)       │                │   (port 8000)            │
│                     │                │                          │
│  - Auth pages       │                │  - Business logic        │
│  - Student portal   │                │  - JWT validation        │
│  - Teacher portal   │                │  - Supabase client       │
│  - Admin portal     │                │  - PDF generation        │
└─────────────────────┘                └──────────┬───────────────┘
                                                  │ supabase-py
                                       ┌──────────▼───────────────┐
                                       │   Supabase               │
                                       │                          │
                                       │  - PostgreSQL (DB)       │
                                       │  - Row Level Security    │
                                       │  - Auth (OTP + MFA)      │
                                       │  - Realtime (future)     │
                                       └──────────────────────────┘
```

### Auth Flow
- **Students** → Phone + OTP (Supabase Phone Auth via Twilio)
- **Teachers** → Email + Password (Supabase Email Auth)
- **Admins**   → Email + Password + Mandatory TOTP MFA (Supabase MFA)

FastAPI validates the Supabase JWT on every request, then applies its own
role checks before touching the database. Supabase RLS is the final safety
net — even a bug in FastAPI cannot leak cross-tenant data.

## Quick Start

### Prerequisites
- Python 3.12+
- Node 20+
- A Supabase project (free tier works)

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in your Supabase keys
uvicorn app.main:app --reload  # http://localhost:8000/docs
```

### Run migrations
```bash
# In Supabase SQL Editor, paste and run:
#   supabase/migrations/001_initial_schema.sql
#   supabase/migrations/002_rls_policies.sql
#   supabase/migrations/003_seed.sql
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # fill in VITE_SUPABASE_URL + ANON_KEY
npm run dev                     # http://localhost:5173
```

## Project Structure

```
eclassroom/
├── backend/
│   ├── app/
│   │   ├── api/v1/routes/      # FastAPI route handlers
│   │   ├── core/               # config, security, deps
│   │   ├── db/                 # Supabase client helpers
│   │   ├── models/             # Pydantic response models
│   │   ├── schemas/            # Request/response Pydantic schemas
│   │   └── services/           # Business logic services
│   ├── supabase/
│   │   ├── migrations/         # SQL migration files (run in Supabase)
│   │   └── tests/              # RLS verification tests
│   └── tests/                  # pytest test suite
└── frontend/
    └── src/
        ├── components/         # Reusable UI components
        ├── pages/              # Route pages per portal
        ├── hooks/              # Custom React hooks
        ├── services/           # API call functions
        ├── stores/             # Zustand state stores
        └── types/              # TypeScript interfaces
```

## Day-by-Day Build Plan
| Day | What ships |
|-----|-----------|
| 1 ✅ | Supabase schema + RLS + seed + FastAPI foundation |
| 2   | Auth flows — all 3 login pages wired to Supabase Auth |
| 3   | Student tasks + study plan (live Supabase data) |
| 4   | Student doubts + classes + profile |
| 5   | Teacher dashboard + attendance + students |
| 6   | Teacher doubts + grades + PDF report cards |
| 7   | Admin console — full center management |
| 8   | E2E tests + Vercel/Render deploy |
