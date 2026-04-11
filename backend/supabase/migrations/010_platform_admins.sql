-- Create platform_admins table for super admin management
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid NOT NULL REFERENCES auth.users(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_admins_pkey PRIMARY KEY (id)
);

-- Enable RLS
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Platform admins can view their own profile"
  ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
