import type { AuditLogEntry } from '@/types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080') + '/api/v1'

function getStoredToken(): string | null {
  const direct = localStorage.getItem('access_token')
  if (direct) return direct
  try {
    const raw = localStorage.getItem('eclassroom-auth')
    if (raw) {
      const parsed = JSON.parse(raw)
      return parsed?.state?.accessToken ?? null
    }
  } catch {
    /* ignore */
  }
  return null
}

export type AuditLogSseMessage =
  | { type: 'connected' }
  | { type: 'log'; entry: AuditLogEntry }

/** Live application logs for super-admin (SSE + Redis, Neon-backed). */
export function connectSuperAdminAuditLogEvents(
  onMessage: (msg: AuditLogSseMessage) => void,
): () => void {
  const token = getStoredToken()
  const controller = new AbortController()

  void (async () => {
    try {
      const res = await fetch(`${API_BASE}/super-admin/audit-logs/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      })
      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          try {
            onMessage(JSON.parse(line.slice(6)) as AuditLogSseMessage)
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch {
      /* aborted or network */
    }
  })()

  return () => controller.abort()
}
