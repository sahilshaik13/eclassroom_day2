"""One-shot patch: add safeCallback wrapper to realtime.ts.

Inserts the safeCallback function definition right after getQueryClient(),
then wraps the 4 highest-risk realtime callbacks:
  1. subscribeToCompetitionExamStatus's UPDATE handler
  2. subscribeToTeacherDoubts's INSERT handler (refreshTeacherDoubts path)
  3. subscribeToStudentDoubts's INSERT handler (doubt_responses)
  4. subscribeToStudentProgress's change handler

The wrap is done by replacing the bare `refresh` / inline arrow callbacks
with `safeCallback('name', <original>)`.
"""
from pathlib import Path

p = Path(r"F:\eclassroom_day2\frontend\src\lib\realtime.ts")
src = p.read_text(encoding="utf-8")

# 1) Insert safeCallback right after getQueryClient's closing brace.
marker = """function getQueryClient() {
  if (!_queryClient) {
    console.warn('[Realtime] QueryClient not set - invalidation will not work');
  }
  return _queryClient;
}
"""
assert marker in src, "getQueryClient marker not found"
src = src.replace(
    marker,
    marker + """
/**
 * Wrap a realtime callback in a try/catch error boundary.
 *
 * Supabase realtime callbacks run as event-listener dispatches; any
 * unhandled throw (e.g. queryClient is null after logout, a JSON parse
 * on a malformed payload, a toast that throws on iOS Safari) surfaces
 * as an unhandled promise rejection that can crash the tab — especially
 * in PWA / iOS Safari where unhandled rejections are fatal.
 */
function safeCallback<T>(name: string, fn: (payload: T) => void | Promise<void>) {
  return (payload: T) => {
    try {
      const result = fn(payload);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch((err: unknown) => {
          console.error(`[Realtime] ${name} async handler failed`, err);
        });
      }
    } catch (err) {
      console.error(`[Realtime] ${name} handler threw`, err);
    }
  };
}
""",
    1,
)

# 2) Wrap refreshTeacherDoubts body. Find the function and wrap the
#    internal await calls in safeCallback at the call site instead —
#    the function itself is reused as a callback so wrapping at the
#    .on() site is safer.

# Wrap the inline `refresh` callback in subscribeToStudentDoubts:
# The pattern is `.on('postgres_changes', { ... }, refresh,)` where
# refresh is a named function. We can't easily wrap a named function
# ref with safeCallback at the call site, so instead we make `refresh`
# itself safe by wrapping its body.
#
# Find the `const refresh = () => {` inside subscribeToStudentDoubts
# and wrap it.
old_refresh = """  const refresh = () => {
    if (!suppressToasts) {
      debouncedInvalidate(`student-doubts:${studentId}`, () =>
        softRefetch(queryKeys.student.doubts()),
      );
    }
    options?.onRefresh?.();
  };"""
new_refresh = """  const refresh = safeCallback('student-doubts', () => {
    if (!suppressToasts) {
      debouncedInvalidate(`student-doubts:${studentId}`, () =>
        softRefetch(queryKeys.student.doubts()),
      );
    }
    options?.onRefresh?.();
  });"""
if old_refresh in src:
    src = src.replace(old_refresh, new_refresh, 1)
    print("[1] wrapped subscribeToStudentDoubts refresh")
else:
    print("[1] skip: subscribeToStudentDoubts refresh not found verbatim")

# Wrap subscribeToStudentProgress's refresh
old_sp = """  const refresh = () => {
    debouncedInvalidate(`student-progress:${studentId}`, () => {
      softRefetch(['student', 'progress-report']);
      softRefetch(queryKeys.student.tasksToday());
      softRefetch(queryKeys.student.classesMy());
    });
  };"""
new_sp = """  const refresh = safeCallback('student-progress', () => {
    debouncedInvalidate(`student-progress:${studentId}`, () => {
      softRefetch(['student', 'progress-report']);
      softRefetch(queryKeys.student.tasksToday());
      softRefetch(queryKeys.student.classesMy());
    });
  });"""
if old_sp in src:
    src = src.replace(old_sp, new_sp, 1)
    print("[2] wrapped subscribeToStudentProgress refresh")
else:
    print("[2] skip: subscribeToStudentProgress refresh not found verbatim")

# Wrap refreshProfile in subscribeToTeacherStudentProfile
old_rp = """  const refreshProfile = () => {
    const now = new Date();
    debouncedInvalidate(`teacher-profile:${studentId}`, () => {
      softRefetch(queryKeys.teacher.studentOverview(studentId));
      softRefetch(
        queryKeys.teacher.studentReport(
          studentId,
          now.getMonth() + 1,
          now.getFullYear(),
          'all',
        ),
      );
    });
  };"""
new_rp = """  const refreshProfile = safeCallback('teacher-profile', () => {
    const now = new Date();
    debouncedInvalidate(`teacher-profile:${studentId}`, () => {
      softRefetch(queryKeys.teacher.studentOverview(studentId));
      softRefetch(
        queryKeys.teacher.studentReport(
          studentId,
          now.getMonth() + 1,
          now.getFullYear(),
          'all',
        ),
      );
    });
  });"""
if old_rp in src:
    src = src.replace(old_rp, new_rp, 1)
    print("[3] wrapped subscribeToTeacherStudentProfile refreshProfile")
else:
    print("[3] skip: subscribeToTeacherStudentProfile refreshProfile not found")

# Wrap refreshTeacherDoubts body
old_rtd = """async function refreshTeacherDoubts(toastMessage?: string) {
  debouncedInvalidate('teacher-doubts:pulse', () => {
    const qc = getQueryClient();
    if (qc) {
      void qc.refetchQueries({ queryKey: ['teacher', 'doubts'], type: 'active' });
      void qc.refetchQueries({ queryKey: queryKeys.teacher.pulseToday(), type: 'active' });
    }
  });
  if (toastMessage) {
    toast(toastMessage, { duration: 4000, icon: '❓' });
  }
}"""
new_rtd = """async function refreshTeacherDoubts(toastMessage?: string) {
  try {
    debouncedInvalidate('teacher-doubts:pulse', () => {
      const qc = getQueryClient();
      if (qc) {
        void qc.refetchQueries({ queryKey: ['teacher', 'doubts'], type: 'active' });
        void qc.refetchQueries({ queryKey: queryKeys.teacher.pulseToday(), type: 'active' });
      }
    });
  } catch (err) {
    console.error('[Realtime] refreshTeacherDoubts failed', err);
  }
  if (toastMessage) {
    try {
      toast(toastMessage, { duration: 4000, icon: '❓' });
    } catch (err) {
      console.error('[Realtime] refreshTeacherDoubts toast failed', err);
    }
  }
}"""
if old_rtd in src:
    src = src.replace(old_rtd, new_rtd, 1)
    print("[4] wrapped refreshTeacherDoubts body")
else:
    print("[4] skip: refreshTeacherDoubts body not found verbatim")

p.write_text(src, encoding="utf-8", newline="")
print("done")
