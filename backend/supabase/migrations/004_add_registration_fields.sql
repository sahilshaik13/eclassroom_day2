-- Add registration fields to users table

ALTER TABLE public.users
ADD COLUMN is_registered boolean DEFAULT false,
ADD COLUMN first_name text,
ADD COLUMN last_name text,
ADD COLUMN islamic_name text,
ADD COLUMN gender text,
ADD COLUMN dob date,
ADD COLUMN nationality text,
ADD COLUMN emirates_id text,
ADD COLUMN whatsapp_number text,
ADD COLUMN city text,
ADD COLUMN needs_transport boolean DEFAULT false,
ADD COLUMN address text;
