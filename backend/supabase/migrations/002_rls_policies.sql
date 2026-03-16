-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security — every table locked down
--
-- Security model:
--   Students  → only own rows + own tenant
--   Teachers  → only rows for their assigned classes + own tenant
--   Admins    → all rows within their tenant (never cross-tenant)
--
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── Enable RLS on every table ────────────────────────────────
ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_plan_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubt_responses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance           ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades               ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TENANTS — no user reads this directly; only service role
-- ============================================================
-- (No policies = deny all. FastAPI uses service role to read tenants.)


-- ============================================================
-- USERS
-- ============================================================

-- Students: can only read and update their own user row
CREATE POLICY "student_own_user_read" ON users
  FOR SELECT USING (
    auth.uid() = id
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "student_own_user_update" ON users
  FOR UPDATE USING (
    auth.uid() = id
    AND tenant_id = get_tenant_id()
  );

-- Teachers: can read users in their classes (for student lookup)
CREATE POLICY "teacher_class_users_read" ON users
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND (
      -- their own record
      id = auth.uid()
      OR
      -- students in their classes
      id IN (
        SELECT s.user_id FROM students s
        JOIN class_enrollments ce ON ce.student_id = s.id
        JOIN classes c ON c.id = ce.class_id
        WHERE c.teacher_id = auth.uid()
        AND c.tenant_id = get_tenant_id()
      )
    )
  );

-- Admins: full access scoped to tenant
CREATE POLICY "admin_tenant_users" ON users
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- STUDENTS
-- ============================================================

-- Students: read/update only their own record
CREATE POLICY "student_own_record" ON students
  FOR ALL USING (
    user_id = auth.uid()
    AND tenant_id = get_tenant_id()
  );

-- Teachers: read students enrolled in their classes
CREATE POLICY "teacher_class_students" ON students
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND id IN (
      SELECT ce.student_id FROM class_enrollments ce
      JOIN classes c ON c.id = ce.class_id
      WHERE c.teacher_id = auth.uid()
      AND c.tenant_id = get_tenant_id()
    )
  );

-- Admins: full access within tenant
CREATE POLICY "admin_tenant_students" ON students
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- CLASSES
-- ============================================================

-- Students: read only classes they are enrolled in
CREATE POLICY "student_enrolled_classes" ON classes
  FOR SELECT USING (
    get_user_role() = 'student'
    AND tenant_id = get_tenant_id()
    AND id IN (
      SELECT ce.class_id FROM class_enrollments ce
      JOIN students s ON s.id = ce.student_id
      WHERE s.user_id = auth.uid()
      AND ce.tenant_id = get_tenant_id()
    )
  );

-- Teachers: read/update their own assigned classes
CREATE POLICY "teacher_own_classes" ON classes
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND tenant_id = get_tenant_id()
  );

CREATE POLICY "teacher_update_own_class" ON classes
  FOR UPDATE USING (
    get_user_role() = 'teacher'
    AND teacher_id = auth.uid()
    AND tenant_id = get_tenant_id()
  );

-- Admins: full access within tenant
CREATE POLICY "admin_tenant_classes" ON classes
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- CLASS ENROLLMENTS
-- ============================================================

-- Students: read their own enrollments
CREATE POLICY "student_own_enrollments" ON class_enrollments
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers: read enrollments for their classes
CREATE POLICY "teacher_class_enrollments" ON class_enrollments
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND class_id IN (
      SELECT id FROM classes WHERE teacher_id = auth.uid()
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_enrollments" ON class_enrollments
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- STUDY PLAN TEMPLATES
-- ============================================================

-- Students + Teachers: read templates for their tenant
CREATE POLICY "tenant_members_read_templates" ON study_plan_templates
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Admins: full access
CREATE POLICY "admin_tenant_templates" ON study_plan_templates
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- STUDY PLAN TASKS
-- ============================================================

-- All authenticated users can read tasks in their tenant
CREATE POLICY "tenant_members_read_tasks" ON study_plan_tasks
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Admins: full access
CREATE POLICY "admin_tenant_tasks" ON study_plan_tasks
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- TASK COMPLETIONS
-- ============================================================

-- Students: read + write only their own completions
CREATE POLICY "student_own_completions" ON task_completions
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers: read completions for their class students
CREATE POLICY "teacher_class_completions" ON task_completions
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND student_id IN (
      SELECT ce.student_id FROM class_enrollments ce
      JOIN classes c ON c.id = ce.class_id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_completions" ON task_completions
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- DOUBTS
-- ============================================================

-- Students: read + insert their own doubts
CREATE POLICY "student_own_doubts" ON doubts
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers: read doubts for their class
CREATE POLICY "teacher_class_doubts" ON doubts
  FOR SELECT USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND class_id IN (
      SELECT id FROM classes WHERE teacher_id = auth.uid()
    )
  );

-- Teachers: update status (mark resolved/archived)
CREATE POLICY "teacher_update_doubt_status" ON doubts
  FOR UPDATE USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND class_id IN (
      SELECT id FROM classes WHERE teacher_id = auth.uid()
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_doubts" ON doubts
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- DOUBT RESPONSES
-- ============================================================

-- Students: read responses to their own doubts
CREATE POLICY "student_own_doubt_responses" ON doubt_responses
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND doubt_id IN (
      SELECT id FROM doubts
      WHERE student_id IN (
        SELECT id FROM students WHERE user_id = auth.uid()
      )
    )
  );

-- Teachers: insert + read responses for their class doubts
CREATE POLICY "teacher_doubt_responses" ON doubt_responses
  FOR ALL USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND (
      teacher_id = auth.uid()
      OR
      doubt_id IN (
        SELECT d.id FROM doubts d
        JOIN classes c ON c.id = d.class_id
        WHERE c.teacher_id = auth.uid()
      )
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_responses" ON doubt_responses
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- ATTENDANCE
-- ============================================================

-- Students: read their own attendance
CREATE POLICY "student_own_attendance" ON attendance
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Teachers: read + write attendance for their classes
CREATE POLICY "teacher_class_attendance" ON attendance
  FOR ALL USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND class_id IN (
      SELECT id FROM classes WHERE teacher_id = auth.uid()
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_attendance" ON attendance
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- GRADES
-- ============================================================
-- Students cannot read grades directly (they see it on report card PDF only)

-- Teachers: read + write grades for their class students
CREATE POLICY "teacher_class_grades" ON grades
  FOR ALL USING (
    get_user_role() = 'teacher'
    AND tenant_id = get_tenant_id()
    AND class_id IN (
      SELECT id FROM classes WHERE teacher_id = auth.uid()
    )
  );

-- Admins: full access
CREATE POLICY "admin_tenant_grades" ON grades
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================

-- All tenant members can read active announcements
CREATE POLICY "tenant_members_read_announcements" ON announcements
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND is_active = true
  );

-- Admins: full access
CREATE POLICY "admin_tenant_announcements" ON announcements
  FOR ALL USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );


-- ============================================================
-- AUDIT LOGS  (read-only for admins, append via service role)
-- ============================================================
CREATE POLICY "admin_audit_read" ON audit_logs
  FOR SELECT USING (
    get_user_role() = 'admin'
    AND tenant_id = get_tenant_id()
  );
-- No INSERT/UPDATE/DELETE policy for regular users.
-- FastAPI uses service_role key to insert audit log rows.
