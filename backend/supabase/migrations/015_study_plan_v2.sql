-- ============================================================
-- 015_study_plan_v2.sql
-- ThinkTarteeb E-Classroom — Hierarchical Study Plan Upgrade
-- ============================================================

-- ── 1. New Enums ──────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE plan_status AS ENUM ('template', 'draft', 'active', 'paused', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE submission_status AS ENUM ('pending', 'submitted', 'reviewed', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update task_type to include more options if not present
-- Note: 'memorise', 'review', 'recite', 'listen', 'read' already exist
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'mcq';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'written';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'reflection';

-- ── 2. Study Plans (Classroom Instances) ──────────────────────
-- Existing 'study_plan_templates' remains as the blueprint.
-- 'study_plans' holds the forked copy assigned to a classroom.

CREATE TABLE IF NOT EXISTS study_plans (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL REFERENCES tenants(id),
    class_id      uuid        REFERENCES classes(id) ON DELETE CASCADE,
    template_id   uuid        REFERENCES study_plan_templates(id) ON DELETE SET NULL,
    name          text        NOT NULL,
    description   text,
    status        plan_status NOT NULL DEFAULT 'draft',
    created_by    uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE(class_id) -- One active plan per classroom
);

CREATE INDEX IF NOT EXISTS ix_study_plans_tenant ON study_plans(tenant_id);
CREATE INDEX IF NOT EXISTS ix_study_plans_class  ON study_plans(class_id);

-- ── 3. Study Plan Days ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plan_days (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id        uuid        REFERENCES study_plans(id) ON DELETE CASCADE,
    template_id    uuid        REFERENCES study_plan_templates(id) ON DELETE CASCADE, -- if this is part of a template
    day_number     integer     NOT NULL,
    scheduled_date date,        -- Assigned by teacher for live plans
    created_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (plan_id IS NOT NULL OR template_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_plan_days_plan ON study_plan_days(plan_id);
CREATE INDEX IF NOT EXISTS ix_plan_days_date ON study_plan_days(scheduled_date);

-- ── 4. Study Plan Periods ────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plan_periods (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id           uuid        NOT NULL REFERENCES study_plan_days(id) ON DELETE CASCADE,
    title            text        NOT NULL,
    duration_minutes integer     DEFAULT 30,
    order_index      integer     NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_periods_day ON study_plan_periods(day_id);

-- ── 5. Evolve Study Plan Tasks ────────────────────────────────
-- We'll add columns to the existing study_plan_tasks or create a new one.
-- To avoid breaking existing queries immediately, we'll add period_id.

ALTER TABLE study_plan_tasks ADD COLUMN IF NOT EXISTS period_id uuid REFERENCES study_plan_periods(id) ON DELETE CASCADE;
ALTER TABLE study_plan_tasks ADD COLUMN IF NOT EXISTS required boolean DEFAULT true;
ALTER TABLE study_plan_tasks ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'; -- For MCQ questions, Surah ranges, etc.

-- Allow template_id to be NULL (for classroom-specific tasks)
ALTER TABLE study_plan_tasks ALTER COLUMN template_id DROP NOT NULL;

-- ── 6. Task Submissions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_plan_submissions (
    id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid              NOT NULL REFERENCES tenants(id),
    student_id    uuid              NOT NULL REFERENCES students(id),
    task_id       uuid              NOT NULL REFERENCES study_plan_tasks(id) ON DELETE CASCADE,
    status        submission_status NOT NULL DEFAULT 'submitted',
    content       jsonb             DEFAULT '{}', -- Text answers or MCQ responses
    audio_url     text,             -- Path to Supabase storage
    feedback      text,             -- Teacher comments
    score         integer,          -- 0-100
    reviewed_by   uuid              REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at   timestamptz,
    created_at    timestamptz       NOT NULL DEFAULT now(),
    updated_at    timestamptz       NOT NULL DEFAULT now(),
    UNIQUE(student_id, task_id)     -- One submission per student per task
);

CREATE INDEX IF NOT EXISTS ix_submissions_task    ON study_plan_submissions(task_id);
CREATE INDEX IF NOT EXISTS ix_submissions_student ON study_plan_submissions(student_id);

-- ── 7. RLS Policies ──────────────────────────────────────────

-- Enable RLS
ALTER TABLE study_plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_submissions ENABLE ROW LEVEL SECURITY;

-- Shared Policy: Tenant isolation (everyone can see their own tenant's plans)
CREATE POLICY "Tenant isolation for study_plans" ON study_plans
    FOR ALL USING (tenant_id = get_tenant_id());

CREATE POLICY "Plan isolation for study_plan_days" ON study_plan_days
    FOR ALL USING (plan_id IN (SELECT id FROM study_plans WHERE tenant_id = get_tenant_id()));

CREATE POLICY "Day isolation for study_plan_periods" ON study_plan_periods
    FOR ALL USING (day_id IN (SELECT id FROM study_plan_days WHERE plan_id IN (SELECT id FROM study_plans WHERE tenant_id = get_tenant_id())));

CREATE POLICY "Tenant isolation for study_plan_submissions" ON study_plan_submissions
    FOR ALL USING (tenant_id = get_tenant_id());

-- Triggers for updated_at
CREATE TRIGGER trg_study_plans_updated_at
  BEFORE UPDATE ON study_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_study_plan_submissions_updated_at
  BEFORE UPDATE ON study_plan_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
