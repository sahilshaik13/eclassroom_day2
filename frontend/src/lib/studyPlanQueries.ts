import type { QueryClient } from '@tanstack/react-query'

/** Stale-while-revalidate defaults for study plan payloads (teacher/admin/student). */

export const STUDY_PLAN_STALE_MS = 5 * 60_000
export const STUDY_PLAN_GC_MS = 30 * 60_000
/** Today's task list changes rarely within a calendar day. */
export const STUDENT_TASKS_TODAY_STALE_MS = 30 * 60_000

export function studyPlanQueryOptions() {
  return {
    staleTime: STUDY_PLAN_STALE_MS,
    gcTime: STUDY_PLAN_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  }
}

export function studentTasksTodayQueryOptions() {
  return {
    staleTime: STUDENT_TASKS_TODAY_STALE_MS,
    gcTime: STUDY_PLAN_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  }
}

export function softRefetchStudyPlan(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  void queryClient.refetchQueries({ queryKey, type: 'active' })
}
