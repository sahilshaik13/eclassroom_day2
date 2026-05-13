-- ============================================================
-- 022_competition_setup_teachers.sql
-- Teachers allowed to configure exam content / toggle exam
-- (separate from grading roster).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.competition_setup_teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (competition_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_competition_setup_teachers_competition_id
    ON public.competition_setup_teachers(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_setup_teachers_teacher_id
    ON public.competition_setup_teachers(teacher_id);

ALTER TABLE public.competition_setup_teachers ENABLE ROW LEVEL SECURITY;

-- Mirror existing graders into setup (same teachers can configure until admin changes it)
INSERT INTO public.competition_setup_teachers (competition_id, tenant_id, teacher_id)
SELECT cg.competition_id, cg.tenant_id, cg.teacher_id
FROM public.competition_graders cg
ON CONFLICT (competition_id, teacher_id) DO NOTHING;

-- Competitions that only had assigned_teacher_id (no grader rows): grant setup to that teacher
INSERT INTO public.competition_setup_teachers (competition_id, tenant_id, teacher_id)
SELECT c.id, c.tenant_id, c.assigned_teacher_id
FROM public.competitions c
WHERE c.assigned_teacher_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.competition_setup_teachers s
    WHERE s.competition_id = c.id AND s.teacher_id = c.assigned_teacher_id
  )
ON CONFLICT (competition_id, teacher_id) DO NOTHING;
