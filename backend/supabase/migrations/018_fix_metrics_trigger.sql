-- Fix for student_progress_metrics trigger function
-- Resolved: column p.tenant_id does not exist

CREATE OR REPLACE FUNCTION refresh_student_day_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_plan_id uuid;
    v_day_number integer;
    v_tenant_id uuid;
BEGIN
    -- 1. Identify which plan and day this task belongs to
    -- JOIN study_plans to get the correct tenant_id
    SELECT d.plan_id, d.day_number, pl.tenant_id
    INTO v_plan_id, v_day_number, v_tenant_id
    FROM study_plan_tasks t
    JOIN study_plan_periods p ON p.id = t.period_id
    JOIN study_plan_days d ON d.id = p.day_id
    JOIN study_plans pl ON pl.id = d.plan_id
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
