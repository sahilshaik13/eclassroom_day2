"""Add debouncedInvalidate helper to realtime.ts and wire it to the hot-path
invalidation sites:
  1. subscribeToStudentDoubts: refresh() — student doubts
  2. refreshTeacherDoubts body — teacher doubts + pulse
  3. invalidateStudyPlanForClass — 7-refetch fan-out (also wired to version bump
     in a separate patch)
  4. subscribeToStudentProgress: refresh() — progress + tasks-today + classes
  5. subscribeToTeacherStudentProfile: refreshProfile() — overview + report
"""
from pathlib import Path

p = Path(r"F:\eclassroom_day2\frontend\src\lib\realtime.ts")
src = p.read_text(encoding="utf-8")

# 1) Insert the debounce helper right after safeCallback.
marker = """function safeCallback<T>(name: string, fn: (payload: T) => void | Promise<void>) {
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
"""
assert marker in src, "safeCallback marker not found"
src = src.replace(
    marker,
    marker + """
/**
 * Coalesce a batch of (invalidate / refetch) calls into a single flush.
 * Realtime channels can fire dozens of events within ~1s during a teacher
 * publishing a new plan (or a flurry of student submissions). Without this,
 * every event triggers a fresh refetch; with it, we run exactly one flush
 * per 400ms window keyed by `key`.
 */
const _flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const _flushWaiters = new Map<string, Array<() => void>>();

function debouncedInvalidate(key: string, run: () => void, waitMs = 400) {
  const existing = _flushWaiters.get(key);
  if (existing) {
    existing.push(run);
    return;
  }
  _flushWaiters.set(key, [run]);
  const t = setTimeout(() => {
    const waiters = _flushWaiters.get(key) ?? [];
    _flushWaiters.delete(key);
    _flushTimers.delete(key);
    for (const w of waiters) {
      try {
        w();
      } catch (err) {
        console.error('[realtime] flush handler failed', err);
      }
    }
  }, waitMs);
  _flushTimers.set(key, t);
}
""",
    1,
)
print("[1] inserted debouncedInvalidate helper")

# 2) Wire debouncedInvalidate in subscribeToStudentDoubts's refresh().
old = """  const refresh = safeCallback('student-doubts', () => {
    if (!suppressToasts) {
      softRefetch(queryKeys.student.doubts());
    }
    options?.onRefresh?.();
  });"""
new = """  const refresh = safeCallback('student-doubts', () => {
    if (!suppressToasts) {
      debouncedInvalidate(`student-doubts:${studentId}`, () =>
        softRefetch(queryKeys.student.doubts()),
      );
    }
    options?.onRefresh?.();
  });"""
if old in src:
    src = src.replace(old, new, 1)
    print("[2] wrapped subscribeToStudentDoubts refresh")
else:
    print("[2] skip: subscribeToStudentDoubts refresh not verbatim")

# 3) Wire debouncedInvalidate in refreshTeacherDoubts.
old = """async function refreshTeacherDoubts(toastMessage?: string) {
  try {
    const qc = getQueryClient();
    if (qc) {
      await qc.refetchQueries({ queryKey: ['teacher', 'doubts'], type: 'active' });
      await qc.refetchQueries({ queryKey: queryKeys.teacher.pulseToday(), type: 'active' });
    }
  } catch (err) {
    console.error('[Realtime] refreshTeacherDoubts refetch failed', err);
  }
  if (toastMessage) {
    try {
      toast(toastMessage, { duration: 4000, icon: '❓' });
    } catch (err) {
      console.error('[Realtime] refreshTeacherDoubts toast failed', err);
    }
  }
}"""
new = """async function refreshTeacherDoubts(toastMessage?: string) {
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
if old in src:
    src = src.replace(old, new, 1)
    print("[3] wrapped refreshTeacherDoubts with debounce")
else:
    print("[3] skip: refreshTeacherDoubts not verbatim")

# 4) Wire debouncedInvalidate in subscribeToStudentProgress's refresh().
old = """  const refresh = safeCallback('student-progress', () => {
    softRefetch(['student', 'progress-report']);
    softRefetch(queryKeys.student.tasksToday());
    softRefetch(queryKeys.student.classesMy());
  });"""
new = """  const refresh = safeCallback('student-progress', () => {
    debouncedInvalidate(`student-progress:${studentId}`, () => {
      softRefetch(['student', 'progress-report']);
      softRefetch(queryKeys.student.tasksToday());
      softRefetch(queryKeys.student.classesMy());
    });
  });"""
if old in src:
    src = src.replace(old, new, 1)
    print("[4] wrapped subscribeToStudentProgress refresh")
else:
    print("[4] skip: subscribeToStudentProgress refresh not verbatim")

# 5) Wire debouncedInvalidate in subscribeToTeacherStudentProfile's refreshProfile().
old = """  const refreshProfile = safeCallback('teacher-profile', () => {
    softRefetch(queryKeys.teacher.studentOverview(studentId));
    const now = new Date();
    softRefetch(
      queryKeys.teacher.studentReport(
        studentId,
        now.getMonth() + 1,
        now.getFullYear(),
        'all',
      ),
    );
  });"""
new = """  const refreshProfile = safeCallback('teacher-profile', () => {
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
if old in src:
    src = src.replace(old, new, 1)
    print("[5] wrapped subscribeToTeacherStudentProfile refreshProfile")
else:
    print("[5] skip: refreshProfile not verbatim")

p.write_text(src, encoding="utf-8", newline="")
print("done")
