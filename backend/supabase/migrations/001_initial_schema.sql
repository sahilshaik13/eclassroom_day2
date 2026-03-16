-- ============================================================
-- 001_initial_schema.sql
-- ThinkTarteeb E-Classroom — Full Database Schema
--
-- Run this in: Supabase Dashboard → SQL Editor
-- Every table has tenant_id for multi-tenant isolation.
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUMs ────────────────────────────────────────────────────
CREATE TYPE user_role        AS ENUM ('student', 'teacher', 'admin');
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late');
CREATE TYPE doubt_status     AS ENUM ('pending', 'resolved', 'archived');
CREATE TYPE task_type        AS ENUM ('memorise', 'review', 'recite', 'listen', 'read');
CREATE TYPE audit_action     AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'DEACTIVATE', 'INVITE', 'LOGIN', 'LOGOUT');

-- ── Helper: extract tenant_id from JWT ───────────────────────
-- Called inside every RLS policy so we never repeat JWT parsing.
CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- ── Helper: extract role from JWT ────────────────────────────
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT auth.jwt() ->> 'role';
$$;


-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL UNIQUE,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- USERS  (mirrors Supabase auth.users — extended profile)
-- ============================================================
-- NOTE: id must match auth.users.id — set during invite/signup
CREATE TABLE users (
  id              uuid        PRIMARY KEY,  -- same as auth.users.id
  tenant_id       uuid        NOT NULL REFERENCES tenants(id),
  role            user_role   NOT NULL,
  email           text        UNIQUE,
  phone           text,                     -- E.164
  name            text        NOT NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  deactivated_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_users_tenant   ON users(tenant_id);
CREATE INDEX ix_users_email    ON users(email);
CREATE INDEX ix_users_phone    ON users(phone);


-- ============================================================
-- STUDENTS  (extended profile for student role)
-- ============================================================
CREATE TABLE students (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL UNIQUE REFERENCES users(id),
  tenant_id                uuid        NOT NULL REFERENCES tenants(id),
  name                     text        NOT NULL,
  phone                    text        NOT NULL,
  accountability_partner_id uuid       REFERENCES students(id),
  deactivated_at           timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_students_tenant ON students(tenant_id);
CREATE INDEX ix_students_user   ON students(user_id);


-- ============================================================
-- CLASSES
-- ============================================================
CREATE TABLE classes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id),
  teacher_id    uuid        NOT NULL REFERENCES users(id),
  name          text        NOT NULL,
  zoom_link     text,
  capacity      integer,
  schedule_json jsonb,                  -- {days, time, timezone}
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_classes_tenant_teacher ON classes(tenant_id, teacher_id);


-- ============================================================
-- CLASS ENROLLMENTS
-- ============================================================
CREATE TABLE class_enrollments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES students(id),
  class_id    uuid        NOT NULL REFERENCES classes(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, class_id)
);

CREATE INDEX ix_enrollments_class   ON class_enrollments(class_id);
CREATE INDEX ix_enrollments_student ON class_enrollments(student_id);


-- ============================================================
-- STUDY PLAN TEMPLATES
-- ============================================================
CREATE TABLE study_plan_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  name        text        NOT NULL,
  description text,
  total_days  integer     NOT NULL,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_templates_tenant ON study_plan_templates(tenant_id);


-- ============================================================
-- STUDY PLAN TASKS  (tasks within a template)
-- ============================================================
CREATE TABLE study_plan_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid        NOT NULL REFERENCES study_plan_templates(id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  day_number   integer     NOT NULL,
  title        text        NOT NULL,
  description  text,
  task_type    task_type   NOT NULL DEFAULT 'memorise',
  order_index  integer     NOT NULL DEFAULT 0
);

CREATE INDEX ix_tasks_template_day ON study_plan_tasks(template_id, day_number);


-- ============================================================
-- TASK COMPLETIONS  (one row per student × task × assigned_date)
-- ============================================================
CREATE TABLE task_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid        NOT NULL REFERENCES students(id),
  task_id       uuid        NOT NULL REFERENCES study_plan_tasks(id),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id),
  assigned_date date        NOT NULL,
  completed_at  timestamptz,           -- NULL = not yet completed
  notes         text,
  UNIQUE(student_id, task_id, assigned_date)
);

CREATE INDEX ix_completions_student_date ON task_completions(student_id, assigned_date);
CREATE INDEX ix_completions_task         ON task_completions(task_id);


-- ============================================================
-- DOUBTS  (student questions to teacher)
-- ============================================================
CREATE TABLE doubts (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid          NOT NULL REFERENCES students(id),
  class_id    uuid          NOT NULL REFERENCES classes(id),
  tenant_id   uuid          NOT NULL REFERENCES tenants(id),
  task_id     uuid          REFERENCES study_plan_tasks(id),
  title       text          NOT NULL,
  body        text          NOT NULL,
  status      doubt_status  NOT NULL DEFAULT 'pending',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX ix_doubts_class_status   ON doubts(class_id, status);
CREATE INDEX ix_doubts_student        ON doubts(student_id);


-- ============================================================
-- DOUBT RESPONSES  (teacher replies)
-- ============================================================
CREATE TABLE doubt_responses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  doubt_id    uuid        NOT NULL REFERENCES doubts(id),
  teacher_id  uuid        NOT NULL REFERENCES users(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  body        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_doubt_responses_doubt ON doubt_responses(doubt_id);


-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE attendance (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid              NOT NULL REFERENCES students(id),
  class_id      uuid              NOT NULL REFERENCES classes(id),
  tenant_id     uuid              NOT NULL REFERENCES tenants(id),
  session_date  date              NOT NULL,
  status        attendance_status NOT NULL,
  marked_by     uuid              NOT NULL REFERENCES users(id),
  created_at    timestamptz       NOT NULL DEFAULT now(),
  UNIQUE(student_id, class_id, session_date)
);

CREATE INDEX ix_attendance_class_date ON attendance(class_id, session_date);
CREATE INDEX ix_attendance_student    ON attendance(student_id);


-- ============================================================
-- GRADES  (monthly, per student per class)
-- ============================================================
CREATE TABLE grades (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES students(id),
  class_id    uuid        NOT NULL REFERENCES classes(id),
  teacher_id  uuid        NOT NULL REFERENCES users(id),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  month       text        NOT NULL,     -- YYYY-MM
  score       integer     NOT NULL CHECK (score BETWEEN 0 AND 100),
  remarks     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, class_id, month)
);

CREATE INDEX ix_grades_class_month ON grades(class_id, month);


-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE announcements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  body        text        NOT NULL,
  created_by  uuid        NOT NULL REFERENCES users(id),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_announcements_tenant ON announcements(tenant_id, is_active);


-- ============================================================
-- AUDIT LOGS  (append-only — no UPDATE/DELETE policy)
-- ============================================================
CREATE TABLE audit_logs (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid         NOT NULL REFERENCES tenants(id),
  admin_id     uuid         NOT NULL REFERENCES users(id),
  action_type  audit_action NOT NULL,
  target_table text         NOT NULL,
  target_id    uuid,
  payload      jsonb,        -- before/after snapshot
  ip_address   text,
  user_agent   text,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_tenant_time ON audit_logs(tenant_id, created_at DESC);

-- ── Trigger: auto-update updated_at ──────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_classes_updated_at
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_doubts_updated_at
  BEFORE UPDATE ON doubts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_grades_updated_at
  BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
