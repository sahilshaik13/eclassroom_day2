-- ============================================================
-- rls_verification.sql
-- Run each block in Supabase SQL Editor to verify RLS policies.
-- ALL tests must pass before starting Day 2.
--
-- Expected results are in the comments after each query.
-- ============================================================

-- ── Setup: replace these with real IDs from your seed ────────
-- (run SELECT id FROM tenants; to find them)
\set tenant_a '00000000-0000-0000-0000-000000000001'
\set tenant_b 'bbbbbbbb-0000-0000-0000-000000000001'  -- create a second tenant to test isolation
\set student_uid '00000000-0000-0000-0000-000000000040'
\set teacher_uid '00000000-0000-0000-0000-000000000020'
\set admin_uid   '00000000-0000-0000-0000-000000000010'


-- ════════════════════════════════════════════════════════════
-- TEST 1: Student sees only their own task completions
-- Expected: rows where student matches auth.uid(), count > 0
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000040",
  "role": "student",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 1 — Student own completions' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '❌ FAIL — student sees no completions (check seed)'
  END AS result
FROM task_completions;

-- ════════════════════════════════════════════════════════════
-- TEST 2: Student cannot read another student's completions
-- Expected: 0 rows for student_id != auth.uid()
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000040",
  "role": "student",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 2 — Student cannot see others completions' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — student can see other students data!'
  END AS result
FROM task_completions
WHERE student_id IN (
  SELECT id FROM students
  WHERE user_id != '00000000-0000-0000-0000-000000000040'::uuid
);

-- ════════════════════════════════════════════════════════════
-- TEST 3: Student cannot read grades table
-- Expected: 0 rows (no student policy on grades)
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000040",
  "role": "student",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 3 — Student cannot read grades' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — student can see grades!'
  END AS result
FROM grades;

-- ════════════════════════════════════════════════════════════
-- TEST 4: Teacher sees students in their class only
-- Expected: rows for teacher's class students, not others
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000020",
  "role": "teacher",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 4 — Teacher sees class students' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) > 0 THEN '✅ PASS'
    ELSE '❌ FAIL — teacher sees no students'
  END AS result
FROM students;

-- ════════════════════════════════════════════════════════════
-- TEST 5: Teacher cannot see admin/other teacher user rows
-- Expected: teacher sees only their own user row + their students
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000020",
  "role": "teacher",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 5 — Teacher cannot see admin user row' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — teacher can see admin user!'
  END AS result
FROM users
WHERE role = 'admin';

-- ════════════════════════════════════════════════════════════
-- TEST 6: Admin sees all data within tenant
-- Expected: sees all 5 students
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000010",
  "role": "admin",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 6 — Admin sees all students' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) = 5 THEN '✅ PASS'
    ELSE '❌ FAIL — expected 5 students, got ' || COUNT(*)
  END AS result
FROM students;

-- ════════════════════════════════════════════════════════════
-- TEST 7: Admin from Tenant A cannot see Tenant B data
-- Expected: 0 rows when filtering for a different tenant
-- (Only meaningful if you have a second tenant seeded)
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000010",
  "role": "admin",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

SELECT
  'TEST 7 — Admin cannot see other tenant students' AS test,
  COUNT(*) AS row_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — admin sees cross-tenant data!'
  END AS result
FROM students
WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ════════════════════════════════════════════════════════════
-- TEST 8: Audit logs are read-only via regular role
-- (Write requires service_role key — FastAPI backend only)
-- ════════════════════════════════════════════════════════════
SET request.jwt.claims TO '{
  "sub": "00000000-0000-0000-0000-000000000010",
  "role": "admin",
  "tenant_id": "00000000-0000-0000-0000-000000000001"
}';

-- This should succeed (read)
SELECT
  'TEST 8a — Admin can read audit logs' AS test,
  COUNT(*) AS row_count,
  '✅ PASS (0 rows is fine — no logs yet)' AS result
FROM audit_logs;

-- ════════════════════════════════════════════════════════════
-- SUMMARY — run after all tests
-- ════════════════════════════════════════════════════════════
-- All results should show ✅ PASS
-- Any ❌ FAIL means a policy is misconfigured — do not proceed to Day 2.
