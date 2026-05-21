import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

function sameCompetitionId(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return String(a).toLowerCase() === String(b).toLowerCase()
}

export type CompetitionRealtimeRow = {
  id?: string
  title?: string
  name?: string
  status?: string
  is_exam_active?: boolean
}

export function competitionDisplayTitle(row: CompetitionRealtimeRow) {
  return row.title || row.name || 'Competition'
}

export function examActiveChanged(
  next: CompetitionRealtimeRow,
  prev: CompetitionRealtimeRow,
): boolean {
  if (prev.is_exam_active === undefined) {
    return next.is_exam_active !== undefined
  }
  return !!next.is_exam_active !== !!prev.is_exam_active
}

/** Patch exam open/closed (and related fields) across all competition list caches. */
export function patchCompetitionExamStatus(
  queryClient: QueryClient,
  competitionId: string,
  patch: { is_exam_active?: boolean; status?: string; title?: string },
) {
  queryClient.setQueryData(
    queryKeys.competitions.info(competitionId),
    (old: Record<string, unknown> | null | undefined) =>
      old ? { ...old, ...patch } : old,
  )

  queryClient.setQueryData(
    queryKeys.teacher.competitions(),
    (old: { id: string; is_exam_active?: boolean; status?: string; title?: string }[] | undefined) =>
      old?.map((c) => (sameCompetitionId(c.id, competitionId) ? { ...c, ...patch } : c)),
  )

  queryClient.setQueryData(
    queryKeys.admin.competitions(),
    (old: { id: string; is_exam_active?: boolean; status?: string; title?: string }[] | undefined) =>
      old?.map((c) => (sameCompetitionId(c.id, competitionId) ? { ...c, ...patch } : c)),
  )

  queryClient.setQueryData(
    queryKeys.competitions.studentRegistrations(),
    (old: { competitions?: { id: string; is_exam_active?: boolean; status?: string; title?: string } }[] | undefined) => {
      if (!old) return old
      return old.map((reg) => {
        if (!sameCompetitionId(reg.competitions?.id, competitionId)) return reg
        return {
          ...reg,
          competitions: { ...reg.competitions!, ...patch },
        }
      })
    },
  )
}

/** Background refetch for competition detail only (lists are patched in-place). */
export function refreshCompetitionInfoQuery(
  queryClient: QueryClient,
  competitionId: string,
) {
  void queryClient.refetchQueries({
    queryKey: queryKeys.competitions.info(competitionId),
    type: 'active',
  })
}
