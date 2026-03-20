# Custom MFA Flow for Students

This plan implements a custom TOTP-based MFA flow for students, as the existing Supabase GoTrue MFA does not support the custom tokens used in the student manual OTP flow.

## Proposed Changes

### Database
- Add `mfa_secret` (text, nullable) and `mfa_enabled` (boolean, default false) to `public.users` table.

### Backend - AuthService ([auth_service.py](file:///d:/eclassroom_day2/backend/app/services/auth_service.py))
- Implement `mfa_enroll_student(user_id, phone)`:
  - Generate a random base32 secret using `pyotp`.
  - Save the secret to `public.users`.
  - Generate a QR code SVG using `qrcode` with `pyotp.totp.provisioning_uri`.
  - Return the factor ID (use user ID), secret, and QR code SVG.
- Implement `mfa_verify_student(user_id, code)`:
  - Verify the code against the saved secret.
  - If valid, set `mfa_enabled = True`.
  - Return a new session token (with `mfa_verified` claim).

### Backend - Auth Routes ([auth.py](file:///d:/eclassroom_day2/backend/app/api/v1/routes/auth.py))
- Update [mfa_enroll](file:///d:/eclassroom_day2/backend/app/api/v1/routes/auth.py#102-115) and [mfa_verify](file:///d:/eclassroom_day2/backend/app/services/auth_service.py#341-383) to check the user role from [TokenData](file:///d:/eclassroom_day2/backend/app/core/deps.py#57-72).
- If role is [student](file:///d:/eclassroom_day2/backend/app/api/v1/routes/teacher.py#125-161), delegate to the new `mfa_enroll_student` / `mfa_verify_student` methods.

### Backend - Student Login ([auth_service.py](file:///d:/eclassroom_day2/backend/app/services/auth_service.py))
- Update [verify_otp](file:///d:/eclassroom_day2/backend/app/services/auth_service.py#95-174) to fetch `mfa_enabled` from the user record.
- Include `mfa_required` and `mfa_enrolled` in the response if `mfa_enabled` is true.

### Frontend - Student Login ([StudentLoginPage.tsx](file:///d:/eclassroom_day2/frontend/src/pages/auth/StudentLoginPage.tsx))
- Add logic to handle `mfa_required: true` in the verification response.
- Store the temporary token and navigate to `/auth/mfa-setup` or `/auth/mfa-verify`.

## Verification Plan

### Manual Verification
- Log in as a student via phone/OTP.
- Go to MFA setup.
- Scan QR code and verify.
- Logout and log in again.
- Verify that the MFA verification screen appears and works.
