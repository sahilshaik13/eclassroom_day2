/**
 * Prefer `useStudyPlanSyncStore().needsStudentSync` on the teacher study plan page.
 * Timestamp comparison is unreliable (server touch vs client clock).
 */
export function planHasUnsyncedChanges(plan: {
  updated_at?: string
  published_at?: string | null
  status?: string
} | null): boolean {
  if (!plan?.updated_at || !plan.published_at) return false
  return new Date(plan.updated_at).getTime() > new Date(plan.published_at).getTime() + 1000
}
