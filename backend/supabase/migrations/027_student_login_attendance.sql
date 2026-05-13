-- Track one attendance presence per student per unique login date.

CREATE TABLE IF NOT EXISTS public.student_login_attendance (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  login_date date NOT NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, login_date)
);

CREATE INDEX IF NOT EXISTS idx_student_login_attendance_tenant_date
  ON public.student_login_attendance (tenant_id, login_date DESC);

CREATE INDEX IF NOT EXISTS idx_student_login_attendance_student_date
  ON public.student_login_attendance (student_id, login_date DESC);
