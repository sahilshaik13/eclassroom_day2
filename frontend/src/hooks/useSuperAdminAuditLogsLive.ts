import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { connectSuperAdminAuditLogEvents } from '@/lib/sseAuditLogs'
import { superAdminQueryKeys } from '@/services/superAdminApi'
import type { AuditLogEntry, PaginationMeta } from '@/types'

const PAGE_LIMIT = 50

type AuditPageData = { rows: AuditLogEntry[]; meta: PaginationMeta | null }

/** SSE live tail for super-admin application logs (page 1). */
export function useSuperAdminAuditLogsLive(enabled: boolean, auditPage: number) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!enabled || auditPage !== 1) return

    return connectSuperAdminAuditLogEvents((msg) => {
      if (msg.type !== 'log' || !msg.entry?.id) return

      queryClient.setQueryData<AuditPageData>(
        superAdminQueryKeys.auditLogs(1),
        (prev) => {
          if (!prev) return prev
          const rows = prev.rows ?? []
          if (rows.some((r) => r.id === msg.entry.id)) return prev
          const trimmed = [msg.entry, ...rows].slice(0, PAGE_LIMIT)
          const total = (prev.meta?.total ?? rows.length) + 1
          return {
            rows: trimmed,
            meta: prev.meta
              ? {
                  ...prev.meta,
                  total,
                  has_more: total > PAGE_LIMIT || prev.meta.has_more,
                }
              : null,
          }
        },
      )
    })
  }, [enabled, auditPage, queryClient])
}
