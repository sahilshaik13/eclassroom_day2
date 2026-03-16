-- ============================================================
-- 003_seed.sql
-- Demo data for ThinkTarteeb E-Classroom
--
-- After running this, create matching Supabase Auth users:
--   Admin:   admin@iic-demo.com  / Admin@123456   (email+password)
--   Teacher: teacher@iic-demo.com / Teacher@123  (email+password)
--   Student: use Supabase Phone Auth with +971501234567
--
-- IMPORTANT: After creating auth users, update the id values
--   below to match the auth.users.id UUIDs that Supabase assigns.
--   Or run the auth_user_sync trigger (see end of file).
-- ============================================================

-- Fixed UUIDs for easy reference in tests
DO $$
DECLARE
  v_tenant_id   uuid := '00000000-0000-0000-0000-000000000001';
  v_admin_id    uuid := '00000000-0000-0000-0000-000000000010';
  v_teacher_id  uuid := '00000000-0000-0000-0000-000000000020';
  v_class_id    uuid := '00000000-0000-0000-0000-000000000030';
  v_student1_id uuid := '00000000-0000-0000-0000-000000000040';
  v_student2_id uuid := '00000000-0000-0000-0000-000000000050';
  v_student3_id uuid := '00000000-0000-0000-0000-000000000060';
  v_student4_id uuid := '00000000-0000-0000-0000-000000000070';
  v_student5_id uuid := '00000000-0000-0000-0000-000000000080';
  v_template_id uuid := '00000000-0000-0000-0000-000000000090';

  -- Student UUIDs in students table (separate from user IDs)
  v_s1 uuid := gen_random_uuid();
  v_s2 uuid := gen_random_uuid();
  v_s3 uuid := gen_random_uuid();
  v_s4 uuid := gen_random_uuid();
  v_s5 uuid := gen_random_uuid();

BEGIN

-- ── Tenant ────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug) VALUES
  (v_tenant_id, 'Islamic Information Centre — Demo', 'iic-demo');

-- ── Users ─────────────────────────────────────────────────────
-- NOTE: These IDs must match the auth.users.id that Supabase creates.
-- Replace these placeholder UUIDs after creating auth users.
INSERT INTO users (id, tenant_id, role, email, name) VALUES
  (v_admin_id,   v_tenant_id, 'admin',   'admin@iic-demo.com',   'Admin User'),
  (v_teacher_id, v_tenant_id, 'teacher', 'teacher@iic-demo.com', 'Ustazah Fatima');

INSERT INTO users (id, tenant_id, role, phone, name) VALUES
  (v_student1_id, v_tenant_id, 'student', '+971501234567', 'Ahmed Al-Rashid'),
  (v_student2_id, v_tenant_id, 'student', '+971501234568', 'Fatima Hassan'),
  (v_student3_id, v_tenant_id, 'student', '+971501234569', 'Omar Siddiqui'),
  (v_student4_id, v_tenant_id, 'student', '+971501234570', 'Aisha Malik'),
  (v_student5_id, v_tenant_id, 'student', '+971501234571', 'Yusuf Ibrahim');

-- ── Students ──────────────────────────────────────────────────
INSERT INTO students (id, user_id, tenant_id, name, phone) VALUES
  (v_s1, v_student1_id, v_tenant_id, 'Ahmed Al-Rashid', '+971501234567'),
  (v_s2, v_student2_id, v_tenant_id, 'Fatima Hassan',   '+971501234568'),
  (v_s3, v_student3_id, v_tenant_id, 'Omar Siddiqui',   '+971501234569'),
  (v_s4, v_student4_id, v_tenant_id, 'Aisha Malik',     '+971501234570'),
  (v_s5, v_student5_id, v_tenant_id, 'Yusuf Ibrahim',   '+971501234571');

-- Accountability partners (circular pairing)
UPDATE students SET accountability_partner_id = v_s2 WHERE id = v_s1;
UPDATE students SET accountability_partner_id = v_s3 WHERE id = v_s2;
UPDATE students SET accountability_partner_id = v_s4 WHERE id = v_s3;
UPDATE students SET accountability_partner_id = v_s5 WHERE id = v_s4;
UPDATE students SET accountability_partner_id = v_s1 WHERE id = v_s5;

-- ── Class ─────────────────────────────────────────────────────
INSERT INTO classes (id, tenant_id, teacher_id, name, zoom_link, schedule_json) VALUES
  (
    v_class_id,
    v_tenant_id,
    v_teacher_id,
    'Juz 30 — Beginner',
    'https://zoom.us/j/123456789',
    '{"days": ["monday", "wednesday"], "time": "18:00", "timezone": "Asia/Dubai"}'
  );

-- ── Enroll all students ───────────────────────────────────────
INSERT INTO class_enrollments (student_id, class_id, tenant_id) VALUES
  (v_s1, v_class_id, v_tenant_id),
  (v_s2, v_class_id, v_tenant_id),
  (v_s3, v_class_id, v_tenant_id),
  (v_s4, v_class_id, v_tenant_id),
  (v_s5, v_class_id, v_tenant_id);

-- ── Study Plan Template ───────────────────────────────────────
INSERT INTO study_plan_templates (id, tenant_id, name, description, total_days, created_by) VALUES
  (
    v_template_id,
    v_tenant_id,
    'Juz 30 Review Plan — 14 Days',
    'Daily memorisation and review schedule covering the major surahs of Juz 30',
    14,
    v_admin_id
  );

-- ── Tasks (14 days, 2 tasks/day) ─────────────────────────────
INSERT INTO study_plan_tasks (template_id, tenant_id, day_number, title, task_type, order_index) VALUES
  -- Day 1
  (v_template_id, v_tenant_id, 1,  'Memorise Surah An-Naba 1–10',             'memorise', 1),
  (v_template_id, v_tenant_id, 1,  'Listen to Surah An-Naba (full audio)',     'listen',   2),
  -- Day 2
  (v_template_id, v_tenant_id, 2,  'Review Surah An-Naba 1–10',               'review',   1),
  (v_template_id, v_tenant_id, 2,  'Memorise Surah An-Naba 11–20',            'memorise', 2),
  -- Day 3
  (v_template_id, v_tenant_id, 3,  'Recite Surah An-Naba 1–20 to partner',    'recite',   1),
  (v_template_id, v_tenant_id, 3,  'Memorise Surah An-Naba 21–30',            'memorise', 2),
  -- Day 4
  (v_template_id, v_tenant_id, 4,  'Full Surah An-Naba review',               'review',   1),
  (v_template_id, v_tenant_id, 4,  'Memorise Surah An-Naziat 1–10',           'memorise', 2),
  -- Day 5
  (v_template_id, v_tenant_id, 5,  'Review Surah An-Naziat 1–10',             'review',   1),
  (v_template_id, v_tenant_id, 5,  'Memorise Surah An-Naziat 11–20',          'memorise', 2),
  -- Day 6
  (v_template_id, v_tenant_id, 6,  'Recite An-Naba + An-Naziat 1–20 to partner', 'recite', 1),
  (v_template_id, v_tenant_id, 6,  'Memorise Surah An-Naziat 21–30',          'memorise', 2),
  -- Day 7
  (v_template_id, v_tenant_id, 7,  'Rest Day — Listen to full Juz 30',        'listen',   1),
  (v_template_id, v_tenant_id, 7,  'Read tafsir notes for An-Naba',           'read',     2),
  -- Day 8
  (v_template_id, v_tenant_id, 8,  'Full review: An-Naba + An-Naziat',        'review',   1),
  (v_template_id, v_tenant_id, 8,  'Memorise Surah Abasa 1–10',               'memorise', 2),
  -- Day 9
  (v_template_id, v_tenant_id, 9,  'Review Surah Abasa 1–10',                 'review',   1),
  (v_template_id, v_tenant_id, 9,  'Memorise Surah Abasa 11–20',              'memorise', 2),
  -- Day 10
  (v_template_id, v_tenant_id, 10, 'Recite Surah Abasa 1–20 to partner',      'recite',   1),
  (v_template_id, v_tenant_id, 10, 'Memorise Surah Abasa 21–42',              'memorise', 2),
  -- Day 11
  (v_template_id, v_tenant_id, 11, 'Full Abasa review',                       'review',   1),
  (v_template_id, v_tenant_id, 11, 'Memorise Surah At-Takwir 1–10',           'memorise', 2),
  -- Day 12
  (v_template_id, v_tenant_id, 12, 'Recite An-Naba, An-Naziat, Abasa',        'recite',   1),
  (v_template_id, v_tenant_id, 12, 'Memorise Surah At-Takwir 11–29',          'memorise', 2),
  -- Day 13
  (v_template_id, v_tenant_id, 13, 'Full review: An-Naba through At-Takwir',  'review',   1),
  (v_template_id, v_tenant_id, 13, 'Memorise Surah Al-Infitar 1–19',          'memorise', 2),
  -- Day 14
  (v_template_id, v_tenant_id, 14, 'Final recitation — all memorised surahs', 'recite',   1),
  (v_template_id, v_tenant_id, 14, 'Self-assessment and reflection',           'read',     2);

-- ── Assign Day 1 tasks to all students (starting today) ──────
INSERT INTO task_completions (student_id, task_id, tenant_id, assigned_date)
SELECT
  s.id,
  t.id,
  v_tenant_id,
  CURRENT_DATE
FROM students s
CROSS JOIN study_plan_tasks t
WHERE s.tenant_id = v_tenant_id
  AND t.template_id = v_template_id
  AND t.day_number = 1;

-- ── Announcement ──────────────────────────────────────────────
INSERT INTO announcements (tenant_id, body, created_by) VALUES
  (
    v_tenant_id,
    '🌙 Ramadan Mubarak! Classes continue as scheduled. Please complete your daily tasks before Iftar.',
    v_admin_id
  );

END $$;
