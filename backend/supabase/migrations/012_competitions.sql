-- ============================================================
-- 012_competitions.sql
-- ThinkTarteeb E-Classroom — Competition Module
-- ============================================================

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_status') THEN
        CREATE TYPE competition_status AS ENUM ('draft', 'active', 'closed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'registration_status') THEN
        CREATE TYPE registration_status AS ENUM ('registered', 'participated', 'disqualified');
    END IF;
END $$;

-- Table: competitions
CREATE TABLE IF NOT EXISTS public.competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    assigned_teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status competition_status DEFAULT 'draft',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_tenant_id ON public.competitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_competitions_assigned_teacher_id ON public.competitions(assigned_teacher_id);

-- Table: competition_registrations
CREATE TABLE IF NOT EXISTS public.competition_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    name TEXT NOT NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    status registration_status DEFAULT 'registered',
    registered_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(competition_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_competition_registrations_competition_id ON public.competition_registrations(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_registrations_phone_tenant ON public.competition_registrations(phone, tenant_id);
CREATE INDEX IF NOT EXISTS idx_competition_registrations_student_id ON public.competition_registrations(student_id);

-- Table: competition_results
CREATE TABLE IF NOT EXISTS public.competition_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES public.competition_registrations(id) ON DELETE CASCADE,
    score INTEGER CHECK (score >= 0 AND score <= 100),
    remarks TEXT,
    recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(competition_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_results_competition_id ON public.competition_results(competition_id);

-- Triggers for auto-updating updated_at
CREATE TRIGGER trg_competitions_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_competition_results_updated_at
  BEFORE UPDATE ON public.competition_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: Service Role Only (like otp_codes)
-- By enabling RLS and not providing any policies, only the postgres role
-- and service role can access these tables. Frontend clients are entirely blocked.
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_results ENABLE ROW LEVEL SECURITY;
