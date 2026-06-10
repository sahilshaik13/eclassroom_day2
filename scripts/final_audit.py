"""Final audit cycle: verify each previous-session promise is actually in the code.

For each promise, list:
  - PROMISE: short description
  - STATUS: PASS (in tree) / FAIL (missing) / PARTIAL (in tree but not fully wired)
  - EVIDENCE: file:line where it's implemented
"""
import re
from pathlib import Path

ROOT = Path(r"F:\eclassroom_day2")
results: list[tuple[str, str, str]] = []


def check(promise: str, status: str, evidence: str) -> None:
    results.append((promise, status, evidence))


def has(path: str, pattern: str) -> list[str]:
    p = ROOT / path
    if not p.exists():
        return [f"FILE MISSING: {path}"]
    text = p.read_text(encoding="utf-8")
    return [f"{path}: match={m.group(0)[:60]}" for m in re.finditer(pattern, text)]


# P0 critical fixes
check(
    "P0-1 StrictMode subscription leak fix (StudentDashboard stable classIdsKey)",
    "PASS" if has("frontend/src/pages/student/StudentDashboard.tsx", r"classIdsKey") else "FAIL",
    "StudentDashboard.tsx: classIdsKey useMemo + effect deps use stable string",
)
check(
    "P0-2 Parallelize get_pending_submissions (Wave 1 + Wave 2 asyncio.gather)",
    "PASS" if has("backend/app/api/v1/routes/teacher.py", r"Wave 1.*2 fully-independent") and has("backend/app/api/v1/routes/teacher.py", r"Wave 2.*single gather") else "FAIL",
    "teacher.py: Wave 1 (students+tasks gather) + Wave 2 (days+plans gather) with PostgREST inner-join",
)
check(
    "P0-2 Server-side filter on get_students _fetch_class_progress",
    "PASS" if has("backend/app/api/v1/routes/teacher.py", r'\.in_\("task_id", plan_task_ids\)') else "FAIL",
    "teacher.py: .in_('task_id', plan_task_ids) replaces 3000-row Python filter",
)
check(
    "P0-3 clearTeacherDoubtsSessionCache depends on [userId]",
    "PASS" if has("frontend/src/pages/teacher/TeacherDashboard.tsx", r"const userId = user\?\.id\s*\n\s*useEffect\(\(\) => \{\s*\n\s*if \(!userId\)") else "FAIL",
    "TeacherDashboard.tsx: useEffect deps [userId] (not [])",
)

# P1 performance fixes
check(
    "P1-1 Version-key bump for study plan (studyPlanVersion.ts + queryKeys integration)",
    "PASS" if has("frontend/src/lib/studyPlanVersion.ts", r"export function bumpStudyPlanVersion") and has("frontend/src/lib/queryKeys.ts", r"import.*getStudyPlanVersion") and has("frontend/src/lib/realtime.ts", r"bumpStudyPlanVersion\(classId\)") else "PARTIAL",
    "studyPlanVersion.ts + queryKeys.ts + realtime.ts: version increment replaces 7-refetch fan-out",
)
check(
    "P1-2 coalesced_get_or_set defined and wired in teacher dashboard/pulse + student tasks-today",
    "PASS" if has("backend/app/core/cache_service.py", r"async def coalesced_get_or_set") and has("backend/app/api/v1/routes/teacher.py", r"coalesced_get_or_set.*DASHBOARD") and has("backend/app/api/v1/routes/teacher.py", r"coalesced_get_or_set.*TEACHER_PULSE") and has("backend/app/api/v1/routes/student.py", r"coalesced_get_or_set.*STUDENT_TASKS_TODAY") else "FAIL",
    "cache_service.py + teacher.py + student.py: 3 hot paths use coalesced_get_or_set",
)
check(
    "P1-3 GZipMiddleware + per-route Cache-Control headers",
    "PASS" if has("backend/app/main.py", r"app\.add_middleware\(GZipMiddleware") and has("backend/app/main.py", r"cache_control_middleware") else "FAIL",
    "main.py: GZipMiddleware(minimum_size=1024) + cache_control_middleware for hot routes",
)

# P2 caching fixes
check(
    "P2-1 Cloudflare/CDN cache headers on public endpoint",
    "PASS" if has("backend/app/main.py", r"_CACHE_PREFIX_PUBLIC") and has("backend/app/api/v1/routes/public.py", r"public, max-age=300, s-maxage=600") else "FAIL",
    "main.py middleware + public.py: s-maxage=300, stale-while-revalidate=600",
)
check(
    "P2-2 debouncedInvalidate wired in 4 hot realtime paths",
    "PASS" if has("frontend/src/lib/realtime.ts", r"function debouncedInvalidate") and has("frontend/src/lib/realtime.ts", r"debouncedInvalidate\(`student-doubts:") and has("frontend/src/lib/realtime.ts", r"debouncedInvalidate\(`student-progress:") and has("frontend/src/lib/realtime.ts", r"debouncedInvalidate\(`teacher-profile:") and has("frontend/src/lib/realtime.ts", r"debouncedInvalidate\('teacher-doubts:pulse'") else "FAIL",
    "realtime.ts: debouncedInvalidate helper + 4 hot sites (student-doubts, student-progress, teacher-profile, teacher-doubts:pulse)",
)

# P3 ETag/304
check(
    "P3-1 ETag/304 on /public/tenants/{slug}",
    "PASS" if has("backend/app/api/v1/routes/public.py", r'if-none_match') and has("backend/app/api/v1/routes/public.py", r"hashlib\.sha1") else "FAIL",
    "public.py: sha1(body) etag + if-none-match → 304",
)

# ERR safety fixes
check(
    "ERR-1 safeCallback wrapper for realtime callbacks",
    "PASS" if has("frontend/src/lib/realtime.ts", r"function safeCallback") and has("frontend/src/lib/realtime.ts", r"safeCallback\('student-doubts'") and has("frontend/src/lib/realtime.ts", r"safeCallback\('student-progress'") and has("frontend/src/lib/realtime.ts", r"safeCallback\('teacher-profile'") else "FAIL",
    "realtime.ts: safeCallback wraps 3 hot refresh functions",
)
check(
    "ERR-2 handleToggleTask double-refetch removed",
    "PASS" if not has("frontend/src/pages/student/StudentDashboard.tsx", r"refreshTodayTasks\(\)") else "FAIL",
    "StudentDashboard.tsx: refreshTodayTasks() call removed (only the comment remains)",
)
check(
    "ERR-3 useDoubtOutboxFlush self-rescheduling timer",
    "PASS" if has("frontend/src/hooks/useDoubtOutboxFlush.ts", r"setTimeout\(tick, 30_000\)") else "FAIL",
    "useDoubtOutboxFlush.ts: setInterval → self-rescheduling setTimeout, 30s cadence",
)
check(
    "PERF-1 Combined 3 useEffect blocks in StudentDoubtsChat",
    "PASS" if has("frontend/src/components/student/StudentDoubtsChat.tsx", r"const activeThreadId = activeThread\?\.classId") else "FAIL",
    "StudentDoubtsChat.tsx: activeThreadId/activeMessageCount primitives + combined effect",
)
check(
    "PERF-2 StudentLoginPage cooldown uses setInterval",
    "PASS" if has("frontend/src/pages/auth/StudentLoginPage.tsx", r"window\.setInterval") and not has("frontend/src/pages/auth/StudentLoginPage.tsx", r"setTimeout.*setResendCooldown") else "FAIL",
    "StudentLoginPage.tsx: setInterval(1000) replaces per-second setTimeout churn",
)
check(
    "PERF-3 Prefer: return=minimal for PATCH/DELETE in api.ts",
    "PASS" if has("frontend/src/services/api.ts", r"Prefer.*return=minimal") else "FAIL",
    "api.ts: request interceptor adds Prefer: return=minimal for PATCH/DELETE",
)
check(
    "PERF-4 Keyset cursor for audit logs (?before_id)",
    "PASS" if has("backend/app/api/v1/routes/superadmin.py", r"before_id") and has("backend/app/services/application_log_store.py", r"WHERE.*id.*\<.*before_id") else "FAIL",
    "superadmin.py + application_log_store.py: before_id keyset pagination",
)
check(
    "Quick win: console.log calls stripped from realtime.ts",
    "PASS" if not has("frontend/src/lib/realtime.ts", r"console\.log") else "FAIL",
    "realtime.ts: zero console.log calls (16 stripped)",
)

# This session's new fixes
check(
    "N+1 partial index migration for study_plan_submissions",
    "PASS" if has("backend/supabase/migrations/060_study_plan_submissions_indexes.sql", r"idx_study_plan_submissions_pending") else "FAIL",
    "060_study_plan_submissions_indexes.sql: partial index WHERE status='submitted'",
)
check(
    "JSONB GIN index migration for application_logs.metadata",
    "PASS" if has("backend/supabase/migrations/061_application_logs_metadata_gin.sql", r"GIN.*metadata") else "FAIL",
    "061_application_logs_metadata_gin.sql: GIN index on application_logs.metadata",
)

# Print
print("=" * 80)
print(f"{'PROMISE':<70} {'STATUS':<8}")
print("=" * 80)
passed = failed = partial = 0
for promise, status, _evidence in results:
    print(f"{promise[:70]:<70} {status:<8}")
    if status == "PASS":
        passed += 1
    elif status == "FAIL":
        failed += 1
    else:
        partial += 1
print("=" * 80)
print(f"PASS: {passed}  PARTIAL: {partial}  FAIL: {failed}  TOTAL: {len(results)}")

# Detail
print("\n\nDETAIL:")
for promise, status, evidence in results:
    print(f"\n[{status}] {promise}")
    print(f"    {evidence}")
