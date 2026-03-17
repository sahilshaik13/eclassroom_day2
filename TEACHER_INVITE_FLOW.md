# Teacher Invitation & Registration Flow

## Overview
When an admin invites a teacher to the platform, the teacher receives an email with a unique token. They click the link, set their password, complete their profile, and gain full access to the teacher dashboard.

**Key Point:** Admins DO NOT set passwords. Teachers set their own passwords via the invite link.

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEACHER INVITATION FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

1. ADMIN INVITES TEACHER
   ├─ Admin Dashboard → Teachers page
   ├─ Click "Invite Teacher"
   ├─ Enter: Name, Email
   └─ Click "Send Invite"
        │
        ▼
   POST /api/v1/admin/teachers
   ├─ Body: { email: "teacher@example.com", name: "Ustadh Ahmed" }
   └─ Requires: Admin auth + MFA
        │
        ▼
2. BACKEND PROCESSES INVITE
   ├─ AuthService.invite_user_by_email()
   ├─ Calls Supabase admin API
   ├─ Creates auth user in Supabase
   ├─ Sets role="teacher" in app_metadata
   ├─ Creates users table record (tenant_id, name, email, role)
   └─ Supabase generates access token (expires in ~24 hours)
        │
        ▼
3. SUPABASE SENDS INVITE EMAIL
   ├─ Email subject: "You're invited to ThinkTarteeb"
   ├─ Email body: "Click here to set up your account"
   ├─ Magic link: 
   │  {FRONTEND_URL}/auth/callback?access_token=JWT_TOKEN&type=invite
   │
   │  JWT contains:
   │  {
   │    "sub": "user-uuid",
   │    "email": "teacher@example.com",
   │    "app_metadata": {
   │      "role": "teacher",
   │      "tenant_id": "tenant-uuid",
   │      "name": "Ustadh Ahmed"
   │    }
   │  }
   └─ Teacher receives email
        │
        ▼
4. TEACHER CLICKS EMAIL LINK
   ├─ Browser navigates to /auth/callback
   ├─ URL contains: access_token & type=invite
   │
   └─ AuthCallback component:
       ├─ Parses URL hash
       ├─ Extracts access_token from params
       ├─ Decodes JWT (client-side, no verification needed)
       ├─ Extracts email from decoded JWT
       ├─ Stores in localStorage:
       │  - temp_invite_token = access_token
       │  - temp_invite_email = teacher@example.com
       └─ Redirects to /auth/setup-password
            │
            ▼
5. SETUP PASSWORD PAGE
   ├─ SetupPasswordPage component
   ├─ Gets temp_invite_token and temp_invite_email from localStorage
   ├─ Displays:
   │  - Logo & welcome message
   │  - Password input field
   │  - Confirm password input field
   │  - "Set Password" button
   │
   └─ Teacher enters password and clicks "Set Password":
       ├─ POST /auth/set-password
       │  ├─ Body: { new_password: "secure123" }
       │  ├─ Auth: Bearer {temp_invite_token}
       │  ├─ Backend verifies token with Supabase
       │  └─ Updates password in Supabase Auth
       │
       ├─ (Immediate) POST /auth/login
       │  ├─ Body: { email: "teacher@example.com", password: "secure123" }
       │  ├─ Backend calls Supabase sign_in_with_password
       │  └─ Returns: access_token, refresh_token, user data
       │
       ├─ Frontend stores session:
       │  ├─ useAuthStore.setSession()
       │  ├─ localStorage: access_token, refresh_token
       │  └─ Clears: temp_invite_token, temp_invite_email
       │
       └─ Redirects to /auth/teacher-registration
            │
            ▼
6. TEACHER COMPLETES PROFILE
   ├─ TeacherRegistrationPage component
   ├─ Requires: role="teacher" (from JWT)
   ├─ Shows 3-step form:
   │  ├─ Step 1: Personal - first_name, last_name, gender, dob, nationality
   │  ├─ Step 2: Contact - phone, email, address
   │  └─ Step 3: Qualifications - islamic_name, emirates_id, qualifications
   │
   └─ Teacher completes all steps and clicks "Complete Registration":
       ├─ POST /teacher/complete-profile
       │  ├─ Body: { first_name, last_name, gender, dob, nationality, ... }
       │  ├─ Auth: Bearer {access_token}
       │  ├─ Requires: require_teacher dependency (role check)
       │  └─ Backend updates users table:
       │     - Sets is_registered=True
       │     - Updates profile fields
       │
       └─ Redirects to /teacher (dashboard)
            │
            ▼
7. TEACHER DASHBOARD
   ├─ PortalLayout + TeacherDashboard
   ├─ Full access to:
   │  ├─ My Classes
   │  ├─ Students
   │  ├─ Attendance
   │  ├─ Grades
   │  ├─ Reports
   │  └─ Profile Settings
   │
   └─ Teacher can now teach!

```

---

## Files Modified

### Frontend
1. **`src/pages/auth/AuthCallback.tsx`**
   - Added JWT decoding utility
   - Extracts email from JWT token
   - Stores both token and email in localStorage
   - Passes email to password setup page

2. **`src/pages/auth/SetupPasswordPage.tsx`**
   - Enhanced to retrieve stored email
   - Calls `authApi.setPassword()` with invite token
   - Immediately calls `authApi.login()` with email + new password
   - Sets Zustand auth store with session
   - **Redirects to `/auth/teacher-registration`** (changed from `/auth/login`)
   - Shows loading state during auto-login

3. **`src/pages/auth/TeacherRegistrationPage.tsx`**
   - No changes needed! Already correct:
     - Calls `authApi.completeTeacherProfile()`
     - Redirects to `/teacher` on success

### Backend
- **No changes needed!** Existing endpoints handle the flow:
  - `POST /api/v1/admin/teachers` - invite endpoint
  - `POST /auth/set-password` - password setup
  - `POST /auth/login` - auto-login
  - `POST /teacher/complete-profile` - profile completion

---

## Key Implementation Details

### Email Storage & Retrieval
```typescript
// In AuthCallback
const decoded = decodeJWT(accessToken)
const email = decoded?.email
localStorage.setItem('temp_invite_email', email)

// In SetupPasswordPage
const email = localStorage.getItem('temp_invite_email')
```

### Auto-Login Logic
```typescript
// After password is successfully set
const res = await authApi.login(email, data.password)
const { user, access_token, refresh_token } = res.data.data
setSession({ user, access_token, refresh_token })
navigate('/auth/teacher-registration', { replace: true })
```

### Session Management
- After successful login, the session is stored in Zustand (`useAuthStore`)
- Access token is used in all subsequent API calls (via axios interceptor)
- Teacher can now access protected routes requiring `@RequireRole` guard

---

## Environment Configuration

### Required Settings (in `.env`)
```env
FRONTEND_URL=http://localhost:5173  # or your production URL
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Supabase Configuration
The Supabase invite endpoint needs to be configured with the correct redirect URL:
- In Supabase Dashboard → Authentication → URL Configuration
- Add redirect URL: `{FRONTEND_URL}/auth/callback`
- Type: `type=invite` (passed in the magic link)

---

## Security Considerations

1. **Token Expiry**: Invite tokens expire after ~24 hours
   - If teacher clicks link after expiry, they get redirected to login
   - They can request a new invite from admin

2. **LocalStorage Security**:
   - Email is stored (not sensitive)
   - Token is temporary and cleared after use
   - XSS protection: React/Vite provide inherent XSS protection

3. **Tenant Isolation**:
   - tenant_id is encoded in JWT
   - All API calls validate tenant_id matches request
   - Teacher can only access their own tenant's resources

4. **Password Requirements**:
   - Minimum 6 characters (validated on frontend & backend)
   - No complexity requirements yet (can be added)
   - Stored securely in Supabase Auth

5. **Role-Based Access**:
   - invite token includes role="teacher"
   - All teacher endpoints require `@require_teacher` dependency
   - Admin cannot manually set teacher passwords

---

## Testing the Flow

### Manual Testing Checklist
- [ ] Admin goes to Teacher management
- [ ] Clicks "Invite Teacher"
- [ ] Enters name and email
- [ ] Gets "Invite sent" toast
- [ ] Check email inbox for invite link
- [ ] Click invite link
- [ ] AuthCallback page shows loading
- [ ] Redirected to SetupPasswordPage
- [ ] Enter and confirm password
- [ ] See "Setting password..." then "Logging you in..."
- [ ] Redirected to TeacherRegistrationPage
- [ ] Form shows Step 1 of 3
- [ ] Fill out all 3 steps
- [ ] Click "Complete Registration"
- [ ] Redirected to /teacher dashboard
- [ ] Can see classes, students, etc.

### API Testing (via Postman/curl)
```bash
# 1. Send invite
curl -X POST http://localhost:8000/api/v1/admin/teachers \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Teacher","email":"test@example.com"}'

# Response includes invite link in email

# 2. After teacher sets password and logs in, complete profile
curl -X POST http://localhost:8000/api/v1/teacher/complete-profile \
  -H "Authorization: Bearer {teacher_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name":"Test",
    "last_name":"Teacher",
    "gender":"male",
    "dob":"1990-01-15",
    "nationality":"UAE"
  }'
```

---

## Future Improvements

1. **Email Template Customization**
   - Create branded HTML template in Supabase
   - Add organization logo
   - Add support/help links
   - Add expiry time information

2. **Resend Invite**
   - Add "Resend Invite" button if teacher doesn't receive email
   - Track sent invites and resend counts

3. **Invite Expiry Handling**
   - Show expiry time to teacher
   - Option to request new invite if expired
   - Admin can revoke/resend invites

4. **Bulk Invites**
   - CSV upload for inviting multiple teachers
   - Batch processing with progress tracking

5. **Enhanced Password Requirements**
   - Configurable complexity rules
   - History to prevent reuse
   - Expiry policies

6. **Two-Factor Authentication**
   - MFA setup during onboarding
   - Same MFA requirements as admin

---

## Troubleshooting

### Teacher clicks link but gets "Invalid or expired invitation"
- Check if link is from recent email
- Admin can resend invite
- Check that {FRONTEND_URL}/auth/callback is in Supabase redirect URLs

### After password setup, redirects to login instead of registration
- Ensure SetupPasswordPage code is using latest version
- Check that authApi.login() is being called
- Check browser console for errors

### Teacher can't access /auth/teacher-registration page
- Verify user has role="teacher" in JWT
- Check that teacher is authenticated (`@RequireRole` guard)
- Look at network tab to see JWT contents

### Teacher registration fails on complete profile
- Check if all required fields are filled
- Verify JWT token hasn't expired during profile entry
- Check backend logs for validation errors

---

## Summary

✅ **Problem Solved**: Admins no longer set passwords for teachers

✅ **Security**: Teachers set their own secure passwords via email token

✅ **UX**: Smooth flow from invite → password setup → profile → dashboard

✅ **No Admin Burden**: Admins just add name + email, teacher does the rest
