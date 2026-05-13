-- Remove legacy OCR/PDF curriculum import pipeline and its generated data.

BEGIN;

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
),
imported_plans AS (
    SELECT id
    FROM public.study_plans
    WHERE template_id IN (SELECT template_id FROM imported_templates)
)
DELETE FROM public.student_progress_metrics
WHERE plan_id IN (SELECT id FROM imported_plans);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
)
DELETE FROM public.study_plan_submissions
WHERE task_id IN (
    SELECT id
    FROM public.study_plan_tasks
    WHERE template_id IN (SELECT template_id FROM imported_templates)
);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
)
DELETE FROM public.study_plan_tasks
WHERE template_id IN (SELECT template_id FROM imported_templates);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
),
imported_days AS (
    SELECT id
    FROM public.study_plan_days
    WHERE template_id IN (SELECT template_id FROM imported_templates)
)
DELETE FROM public.study_plan_periods
WHERE day_id IN (SELECT id FROM imported_days);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
)
DELETE FROM public.study_plan_days
WHERE template_id IN (SELECT template_id FROM imported_templates);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
)
DELETE FROM public.study_plans
WHERE template_id IN (SELECT template_id FROM imported_templates);

WITH imported_templates AS (
    SELECT DISTINCT template_id
    FROM public.teacher_curriculum_sources
    WHERE template_id IS NOT NULL
)
DELETE FROM public.study_plan_templates
WHERE id IN (SELECT template_id FROM imported_templates);

DELETE FROM storage.objects
WHERE bucket_id = 'curriculum-pdfs';

DELETE FROM storage.buckets
WHERE id = 'curriculum-pdfs';

DROP TABLE IF EXISTS public.teacher_curriculum_sources;

COMMIT;
