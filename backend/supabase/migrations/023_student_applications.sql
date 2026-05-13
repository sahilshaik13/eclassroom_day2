-- ============================================================
-- STUDENT APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_applications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id),
  name              text NOT NULL,
  phone             text NOT NULL,
  notes             text,
  assigned_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending',
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public submit student applications"
  ON public.student_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins manage student applications"
  ON public.student_applications
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users
      WHERE users.id = auth.uid()
        AND users.tenant_id = student_applications.tenant_id
        AND users.role = 'admin'
    )
  );

ALTER publication supabase_realtime ADD TABLE public.student_applications;
