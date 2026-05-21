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

export type ImportSseMessage = {
  type?: string
  class_id?: string
  import_id?: string
  ocr_status?: string
  import?: Record<string, unknown>
}

/** Subscribe to study-plan import status via SSE (Bearer auth). Returns cleanup. */
export function connectStudyPlanImportEvents(
  classId: string,
  onMessage: (msg: ImportSseMessage) => void,
): () => void {
  const token = getStoredToken()
  const controller = new AbortController()

  void (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/admin/classrooms/${classId}/study-plan-imports/events`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        },
      )
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
            onMessage(JSON.parse(line.slice(6)) as ImportSseMessage)
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
