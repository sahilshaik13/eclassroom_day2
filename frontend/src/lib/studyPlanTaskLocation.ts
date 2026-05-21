import type { Day } from '@/components/study-plan/StudyPlanBuilder'

export function findTaskLocation(days: Day[], taskId: string) {
  for (let dIdx = 0; dIdx < days.length; dIdx++) {
    const day = days[dIdx]
    for (let pIdx = 0; pIdx < (day.periods?.length ?? 0); pIdx++) {
      const period = day.periods[pIdx]
      for (let tIdx = 0; tIdx < (period.tasks?.length ?? 0); tIdx++) {
        if (period.tasks[tIdx].id === taskId) {
          return { dIdx, pIdx, tIdx, task: period.tasks[tIdx], day }
        }
      }
    }
  }
  return null
}
