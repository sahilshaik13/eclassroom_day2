-- ============================================================
-- 021_competition_multi_graders.sql
-- Multiple assigned graders per competition; per-grader scores
-- aggregated into competition_results (average for participants).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.competition_graders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (competition_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_graders_competition_id
    ON public.competition_graders(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_graders_teacher_id
    ON public.competition_graders(teacher_id);

CREATE TABLE IF NOT EXISTS public.competition_grader_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    registration_id UUID NOT NULL REFERENCES public.competition_registrations(id) ON DELETE CASCADE,
    grader_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (competition_id, registration_id, grader_user_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_grader_scores_registration
    ON public.competition_grader_scores(registration_id);
CREATE INDEX IF NOT EXISTS idx_competition_grader_scores_competition
    ON public.competition_grader_scores(competition_id);

CREATE TRIGGER trg_competition_grader_scores_updated_at
    BEFORE UPDATE ON public.competition_grader_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.competition_graders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_grader_scores ENABLE ROW LEVEL SECURITY;

-- Backfill: one grader row per existing assigned_teacher_id
INSERT INTO public.competition_graders (competition_id, tenant_id, teacher_id)
SELECT c.id, c.tenant_id, c.assigned_teacher_id
FROM public.competitions c
WHERE c.assigned_teacher_id IS NOT NULL
ON CONFLICT (competition_id, teacher_id) DO NOTHING;
