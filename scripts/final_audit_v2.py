"""Final audit v2: corrected boolean checks for each previous-session promise."""
import re
import sys
from pathlib import Path

ROOT = Path(r"F:\eclassroom_day2")


def has(path: str, pattern: str) -> bool:
    p = ROOT / path
    if not p.exists():
        return False
    return bool(re.search(pattern, p.read_text(encoding="utf-8")))


def missing(path: str, pattern: str) -> bool:
    return not has(path, pattern)


checks = [
    # P0 critical fixes
    ("P0-1 classIdsKey stable ref", has("frontend/src/pages/student/StudentDashboard.tsx", r"classIdsKey")),
    ("P0-2 Wave 1 parallel gather", has("backend/app/api/v1/routes/teacher.py", r"Wave 1")),
    ("P0-2 Wave 2 single gather", has("backend/app/api/v1/routes/teacher.py", r"Wave 2")),
    ("P0-2 .in_ task_id server-side filter", has("backend/app/api/v1/routes/teacher.py", r'in_."task_id"')),
    ("P0-3 userId dep not []", has("frontend/src/pages/teacher/TeacherDashboard.tsx", r"const userId = user")),

    # P1 performance
    ("P1-1 bumpStudyPlanVersion exported", has("frontend/src/lib/studyPlanVersion.ts", r"export function bumpStudyPlanVersion")),
    ("P1-1 queryKeys imports getStudyPlanVersion", has("frontend/src/lib/queryKeys.ts", r"getStudyPlanVersion")),
    ("P1-1 realtime calls bumpStudyPlanVersion", has("frontend/src/lib/realtime.ts", r"bumpStudyPlanVersion\(")),
    ("P1-2 coalesced_get_or_set defined", has("backend/app/core/cache_service.py", r"async def coalesced_get_or_set")),
    ("P1-2 dashboard wired", has("backend/app/api/v1/routes/teacher.py", r"coalesced_get_or_set.*DASHBOARD")),
    ("P1-2 pulse wired", has("backend/app/api/v1/routes/teacher.py", r"coalesced_get_or_set.*TEACHER_PULSE")),
    ("P1-2 tasks-today wired", has("backend/app/api/v1/routes/student.py", r"coalesced_get_or_set.*STUDENT_TASKS_TODAY")),
    ("P1-3 GZipMiddleware", has("backend/app/main.py", r"GZipMiddleware")),
    ("P1-3 cache_control_middleware", has("backend/app/main.py", r"cache_control_middleware")),

    # P2 caching
    ("P2-1 _CACHE_PREFIX_PUBLIC", has("backend/app/main.py", r"_CACHE_PREFIX_PUBLIC")),
    ("P2-1 s-maxage=300", has("backend/app/api/v1/routes/public.py", r"s-maxage=(300|600)")),
    ("P2-2 debouncedInvalidate defined", has("frontend/src/lib/realtime.ts", r"function debouncedInvalidate")),
    ("P2-2 student-doubts debounced", has("frontend/src/lib/realtime.ts", r"debouncedInvalidate.*student-doubts")),
    ("P2-2 student-progress debounced", has("frontend/src/lib/realtime.ts", r"debouncedInvalidate.*student-progress")),
    ("P2-2 teacher-profile debounced", has("frontend/src/lib/realtime.ts", r"debouncedInvalidate.*teacher-profile")),
    ("P2-2 teacher-doubts:pulse debounced", has("frontend/src/lib/realtime.ts", r"debouncedInvalidate.*teacher-doubts")),

    # P3 ETag
    ("P3-1 if-none-match", has("backend/app/api/v1/routes/public.py", r"if-none-match")),
    ("P3-1 hashlib.sha1", has("backend/app/api/v1/routes/public.py", r"hashlib.sha1")),

    # ERR safety
    ("ERR-1 safeCallback defined", has("frontend/src/lib/realtime.ts", r"function safeCallback")),
    ("ERR-1 student-doubts wrap", has("frontend/src/lib/realtime.ts", r"safeCallback..student-doubts")),
    ("ERR-1 student-progress wrap", has("frontend/src/lib/realtime.ts", r"safeCallback..student-progress")),
    ("ERR-1 teacher-profile wrap", has("frontend/src/lib/realtime.ts", r"safeCallback..teacher-profile")),
    ("ERR-2 refreshTodayTasks definition removed", missing("frontend/src/pages/student/StudentDashboard.tsx", r"const refreshTodayTasks =")),
    ("ERR-3 setTimeout tick 30s", has("frontend/src/hooks/useDoubtOutboxFlush.ts", r"setTimeout.tick, 30_000")),

    # PERF
    ("PERF-1 activeThreadId primitive", has("frontend/src/components/student/StudentDoubtsChat.tsx", r"const activeThreadId")),
    ("PERF-2 setInterval in StudentLoginPage", has("frontend/src/pages/auth/StudentLoginPage.tsx", r"window.setInterval")),
    ("PERF-3 Prefer return=minimal", has("frontend/src/services/api.ts", r"Prefer.*return=minimal")),
    ("PERF-4 before_id in route", has("backend/app/api/v1/routes/superadmin.py", r"before_id")),
    ("PERF-4 keyset SQL in store", has("backend/app/services/application_log_store.py", r"id < .*before_id")),
    ("Quick win: zero console.log", missing("frontend/src/lib/realtime.ts", r"console.log")),

    # This session's new fixes
    ("N+1 partial index migration", has("backend/supabase/migrations/060_study_plan_submissions_indexes.sql", r"idx_study_plan_submissions_pending")),
    ("JSONB GIN index migration", has("backend/supabase/migrations/061_application_logs_metadata_gin.sql", r"GIN")),
]

passed = sum(1 for _, ok in checks if ok)
failed = len(checks) - passed

print("=" * 80)
print("FINAL AUDIT — previous-session promises + this session's new fixes")
print("=" * 80)
for name, ok in checks:
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {name}")
print("=" * 80)
print(f"PASS: {passed}/{len(checks)}  FAIL: {failed}")

sys.exit(0 if failed == 0 else 1)
