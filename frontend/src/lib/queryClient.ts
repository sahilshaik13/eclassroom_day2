import { QueryClient } from '@tanstack/react-query'

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const status =
            error && typeof error === 'object' && 'status' in error
              ? (error as { status?: number }).status
              : undefined
          if (status === 401) return false
          return failureCount < 1
        },
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  })
}
