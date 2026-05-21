import type { QueryClient } from '@tanstack/react-query'

/** Shared React Query options for competition lists (stale-while-revalidate). */

export const COMPETITION_STALE_MS = 5 * 60_000
export const COMPETITION_GC_MS = 30 * 60_000

export function competitionListQueryOptions() {
  return {
    staleTime: COMPETITION_STALE_MS,
    gcTime: COMPETITION_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  }
}

/** Background refetch without clearing cached list data. */
export function softRefetchCompetitions(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  void queryClient.refetchQueries({ queryKey, type: 'active' })
}
