import { useStudyPlanSyncStore } from '@/stores/studyPlanSyncStore'

/** Returns true if navigation away from the study-plan page may proceed. */
export async function confirmLeaveStudyPlan(
  currentPath: string,
  nextPath: string,
): Promise<boolean> {
  if (
    !currentPath.startsWith('/teacher/study-plan') ||
    currentPath === nextPath ||
    !useStudyPlanSyncStore.getState().needsLeaveGuard()
  ) {
    return true
  }

  const choice = await useStudyPlanSyncStore.getState().askBeforeLeave()
  if (choice === 'stay') return false
  if (choice === 'sync') {
    const ok = await useStudyPlanSyncStore.getState().syncHandler?.()
    if (!ok) return false
  }
  return true
}
