-- ============================================================
-- 017_progress_metrics.sql
-- ThinkTarteeb E-Classroom — Performance-optimized metrics tracking
-- ============================================================

-- ── 1. Metrics Table ──────────────────────────────────────────
-- Stores pre-calculated aggregates to avoid expensive on-the-fly calculations
CREATE TABLE IF NOT EXISTS student_progress_metrics (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid        NOT NULL REFERENCES tenants(id),
    student_id        uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    plan_id           uuid        NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
    day_number        integer     NOT NULL, -- For daily breakdown
    total_tasks       integer     DEFAULT 0,
    completed_tasks   integer     DEFAULT 0, -- Status in ('submitted', 'reviewed')
    reviewed_tasks    integer     DEFAULT 0, -- Status = 'reviewed'
    average_score     integer     DEFAULT 0, -- Average of reviewed scores
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE(student_id, plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS ix_metrics_student ON student_progress_metrics(student_id);
CREATE INDEX IF NOT EXISTS ix_metrics_plan    ON student_progress_metrics(plan_id);

-- ── 2. Recalculation Function ────────────────────────────────
CREATE OR REPLACE FUNCTION refresh_student_day_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_plan_id uuid;
    v_day_number integer;
    v_tenant_id uuid;
BEGIN
    -- 1. Identify which plan and day this task belongs to
    SELECT d.plan_id, d.day_number, p.tenant_id
    INTO v_plan_id, v_day_number, v_tenant_id
    FROM study_plan_tasks t
    JOIN study_plan_periods p ON p.id = t.period_id
    JOIN study_plan_days d ON d.id = p.day_id
    WHERE t.id = COALESCE(NEW.task_id, OLD.task_id);

    -- 2. Upsert metrics
    INSERT INTO student_progress_metrics (
        tenant_id, student_id, plan_id, day_number, 
        total_tasks, completed_tasks, reviewed_tasks, average_score, updated_at
    )
    SELECT 
        v_tenant_id,
        COALESCE(NEW.student_id, OLD.student_id),
        v_plan_id,
        v_day_number,
        (
            SELECT COUNT(*) 
            FROM study_plan_tasks t
            JOIN study_plan_periods p ON p.id = t.period_id
            JOIN study_plan_days d ON d.id = p.day_id
            WHERE d.plan_id = v_plan_id AND d.day_number = v_day_number
        ),
        COUNT(*) FILTER (WHERE status IN ('submitted', 'reviewed')),
        COUNT(*) FILTER (WHERE status = 'reviewed'),
        COALESCE(ROUND(AVG(score) FILTER (WHERE status = 'reviewed')), 0),
        now()
    FROM study_plan_submissions
    WHERE student_id = COALESCE(NEW.student_id, OLD.student_id)
    AND task_id IN (
        SELECT t.id 
        FROM study_plan_tasks t
        JOIN study_plan_periods p ON p.id = t.period_id
        JOIN study_plan_days d ON d.id = p.day_id
        WHERE d.plan_id = v_plan_id AND d.day_number = v_day_number
    )
    ON CONFLICT (student_id, plan_id, day_number) DO UPDATE SET
        total_tasks = EXCLUDED.total_tasks,
        completed_tasks = EXCLUDED.completed_tasks,
        reviewed_tasks = EXCLUDED.reviewed_tasks,
        average_score = EXCLUDED.average_score,
        updated_at = EXCLUDED.updated_at;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Triggers ──────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_refresh_metrics ON study_plan_submissions;
CREATE TRIGGER trg_refresh_metrics
AFTER INSERT OR UPDATE OR DELETE ON study_plan_submissions
FOR EACH ROW EXECUTE FUNCTION refresh_student_day_metrics();

-- ── 4. Initial Sync ──────────────────────────────────────────
-- For existing data, we could run a batch update here, 
-- but let's assume the user starts from a clean state or triggers it manually.
-- To be safe, we can populate it once for all submissions:
INSERT INTO student_progress_metrics (
    tenant_id, student_id, plan_id, day_number, 
    total_tasks, completed_tasks, reviewed_tasks, average_score, updated_at
)
SELECT 
    s.tenant_id,
    s.student_id,
    d.plan_id,
    d.day_number,
    (
        SELECT COUNT(*) 
        FROM study_plan_tasks t2
        JOIN study_plan_periods p2 ON p2.id = t2.period_id
        JOIN study_plan_days d2 ON d2.id = p2.day_id
        WHERE d2.plan_id = d.plan_id AND d2.day_number = d.day_number
    ),
    COUNT(*) FILTER (WHERE s.status IN ('submitted', 'reviewed')),
    COUNT(*) FILTER (WHERE s.status = 'reviewed'),
    COALESCE(ROUND(AVG(s.score) FILTER (WHERE s.status = 'reviewed')), 0),
    now()
FROM study_plan_submissions s
JOIN study_plan_tasks t ON t.id = s.task_id
JOIN study_plan_periods p ON p.id = t.period_id
JOIN study_plan_days d ON d.id = p.day_id
GROUP BY s.tenant_id, s.student_id, d.plan_id, d.day_number
ON CONFLICT (student_id, plan_id, day_number) DO UPDATE SET
    total_tasks = EXCLUDED.total_tasks,
    completed_tasks = EXCLUDED.completed_tasks,
    reviewed_tasks = EXCLUDED.reviewed_tasks,
    average_score = EXCLUDED.average_score,
    updated_at = EXCLUDED.updated_at;

-- Enable RLS
ALTER TABLE student_progress_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for metrics" ON student_progress_metrics
    FOR ALL USING (tenant_id = get_tenant_id());
