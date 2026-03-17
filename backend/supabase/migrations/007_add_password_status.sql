-- Add has_password column to users table
ALTER TABLE public.users ADD COLUMN has_password boolean DEFAULT false;

-- Mark existing users as having a password (admin and demo teacher)
UPDATE public.users SET has_password = true WHERE email IN ('admin@iic-demo.com', 'teacher@iic-demo.com');
