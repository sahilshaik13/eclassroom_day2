-- Track last successful student OTP login (custom JWT flow does not update auth.users)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

COMMENT ON COLUMN public.users.last_login_at IS 'Last time the user completed OTP/password login (app-tracked).';
