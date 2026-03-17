# Invite → Setup Password Walkthrough (Teacher)

This document captures what we changed to make **teacher invitations land on a controlled “Setup Password” screen**, and to **gate** that screen based on whether the invited teacher already has a password (`public.users.has_password`).

---

## Goal

- **Admin invites teacher** by email (admin never sets password).
- Teacher clicks invite email.
- Teacher is always routed into **`/auth/setup-password`** first.
  - If `has_password = false` → allow setting a password.
  - If `has_password = true` → show “Password already set” and send them to **`/auth/login`**.

This avoids the issue where Supabase invite verification redirects to `/` and the app immediately sends users to `/auth/login` without running the invite logic.

---

## Current Data/Backend Assumptions

- `public.users` contains:
  - `has_password boolean` (added by migration `backend/supabase/migrations/007_add_password_status.sql`)
- Backend endpoint exists:
  - `GET /api/v1/auth/status` → returns `has_password` (and other profile flags)
- Backend endpoint exists:
  - `POST /api/v1/auth/set-password` → uses the provided JWT to update password in Supabase Auth
  - Also updates `public.users.has_password = true` (best-effort)

---

## What we changed in the codebase

### 1) Backend: send invite redirects to `/auth/setup-password`

**File**: `backend/app/api/v1/routes/admin.py`

- In the admin teacher invite endpoint, we changed:
  - from redirecting to `.../auth/callback`
  - to redirecting to `.../auth/setup-password`

So now, when your backend calls Supabase Auth invite API, it passes:

- `redirectTo = {FRONTEND_URL}/auth/setup-password`

This makes Supabase (after verifying the invite token) redirect into the setup password page.

---

### 2) Frontend: `SetupPasswordPage` now handles Supabase invite tokens directly

**File**: `frontend/src/pages/auth/SetupPasswordPage.tsx`

We updated the page to:

- **Extract token** from the URL on load (Supabase may provide either):
  - hash: `#access_token=...`
  - query: `?access_token=...` or `?token=...`
- **Store**:
  - `temp_invite_token` in `localStorage`
  - `temp_invite_email` (decoded from JWT payload) when available
- **Check password status** immediately using the invite token:
  - Temporarily sets `localStorage.access_token = token`
  - Calls `authApi.getUserStatus()` → `GET /auth/status`
  - If `has_password = true`:
    - Clears temp values
    - Redirects to `/auth/login`
  - If `has_password = false`:
    - Remains on the setup form and allows password creation

Password submission flow remains:

- `POST /auth/set-password` (Authorization: Bearer invite token)
- (Optional) auto-login currently still runs as previously implemented

---

### 3) Frontend: `AuthCallback` improvements (kept for compatibility)

**File**: `frontend/src/pages/auth/AuthCallback.tsx`

We made token parsing more permissive:

- Reads token from either hash or query
- Accepts `access_token` or `token`

This helps for older flows that still use `/auth/callback`.

---

### 4) Frontend: root “hash handler” improvements (defensive)

**File**: `frontend/src/App.tsx`

There is a `HashHandler` that attempts to detect invite tokens that accidentally land on `/` and forward them to `/auth/callback`.

We updated it to:

- check both hash + query
- accept `access_token` or `token`

