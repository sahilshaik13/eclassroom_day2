-- ============================================================
-- TEACHER APPLICATIONS
-- ============================================================
CREATE TABLE teacher_applications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  name        text        NOT NULL,
  email       text        NOT NULL,
  whatsapp    text        NOT NULL,
  subject     text,
  experience  text,
  status      text        NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE teacher_applications ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Anyone can submit an application
CREATE POLICY "Public submit applications" 
  ON teacher_applications 
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

-- 2. Only admins can view/update applications for their tenant
CREATE POLICY "Admins manage applications" 
  ON teacher_applications 
  FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.tenant_id = teacher_applications.tenant_id 
      AND users.role = 'admin'
    )
  );
