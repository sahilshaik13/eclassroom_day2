/**
 * Per-classroom study-plan version counter.
 *
 * Standalone module (no dependencies on queryKeys or realtime) so it can be
 * imported safely from both queryKeys.ts and realtime.ts without creating
 * a circular import.
 *
 * Why this exists: the previous realtime handler did 7 parallel
 * softRefetch() calls on every study-plan DB change. Bumping a single
 * in-memory version number is O(1) and any query key built with
 * withStudyPlanVersion() will automatically miss cache on next render.
 */

const studyPlanVersions = new Map<string, number>()

export function bumpStudyPlanVersion(classId: string) {
  studyPlanVersions.set(classId, (studyPlanVersions.get(classId) ?? 0) + 1)
}

export function getStudyPlanVersion(classId: string): number {
  return studyPlanVersions.get(classId) ?? 0
}

/**
 * Append the current study-plan version to a base query key. When
 * bumpStudyPlanVersion is called, every key built with this helper
 * automatically misses cache on next render.
 */
export function withStudyPlanVersion<T extends readonly unknown[]>(
  classId: string,
  baseKey: T,
): readonly [...T, number] {
  return [...baseKey, getStudyPlanVersion(classId)] as readonly [...T, number]
}
