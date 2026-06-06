import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase, supabaseRealtimeEnabled } from '@/lib/supabase'
import {
  type DoubtChatPayload,
  newClientMessageId,
  normalizeDoubtChatPayload,
  publishDoubtChatMessage,
} from '@/lib/doubtChatRealtime'
import {
  type DoubtChatMessage,
  chatMessageFromBroadcast,
  mergeChatMessages,
  pruneEphemeralAgainstServer,
} from '@/lib/doubtChatMerge'

const BROADCAST_EVENT = 'message'

function channelName(tenantId: string, classId: string): string {
  return `doubt-chat:${tenantId}:${classId}`
}

function senderIdsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Live text chat: Supabase broadcast + local ephemeral messages merged with server data.
 */
type UseDoubtChatLiveOptions = {
  /** When set, ignore broadcasts targeted at other students (class-wide channels). */
  recipientStudentId?: string
  /** Skip adding duplicate bubbles for our own broadcasts; upgrade send status instead. */
  currentUserId?: string
  /** Who is viewing the chat — used to ignore own-side broadcasts as incoming bubbles. */
  viewerRole?: 'student' | 'teacher'
  /** Patch query cache / delivery ticks when a broadcast arrives. */
  onLiveMessage?: (payload: DoubtChatPayload, meta: { isOwn: boolean }) => void
}

export function useDoubtChatLive(
  tenantId: string | undefined,
  classIds: string[],
  threadKey: 'classId' | 'studentId',
  options?: UseDoubtChatLiveOptions,
) {
  const [ephemeralByThread, setEphemeralByThread] = useState<Record<string, DoubtChatMessage[]>>({})
  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  const onLiveMessageRef = useRef(options?.onLiveMessage)
  onLiveMessageRef.current = options?.onLiveMessage

  const threadKeyFromPayload = useCallback(
    (payload: DoubtChatPayload) =>
      threadKey === 'classId' ? payload.classId : payload.studentId,
    [threadKey],
  )

  useEffect(() => {
    if (!supabaseRealtimeEnabled || !tenantId || classIds.length === 0) return

    const onMessage = (payload: DoubtChatPayload) => {
      const recipientId = options?.recipientStudentId
      if (recipientId && payload.studentId && payload.studentId !== recipientId) {
        return
      }

      const isOwn = senderIdsMatch(payload.senderUserId, options?.currentUserId)
      onLiveMessageRef.current?.(payload, { isOwn })

      // Teacher replies are always outgoing on the teacher UI (outbox + API), never incoming.
      if (options?.viewerRole === 'teacher' && payload.kind === 'teacher_reply') {
        return
      }

      // Student doubts from self are shown via outbox, not as a second incoming bubble.
      if (options?.viewerRole === 'student' && payload.kind === 'student_doubt' && isOwn) {
        if (payload.clientId) {
          setEphemeralByThread((prev) => {
            const key = threadKeyFromPayload(payload)
            const list = prev[key] ?? []
            const idx = list.findIndex((m) => m.clientId === payload.clientId)
            if (idx < 0) return prev
            const next = [...list]
            next[idx] = {
              ...next[idx],
              deliveryStatus: 'delivered',
              pending: false,
            }
            return { ...prev, [key]: next }
          })
        }
        return
      }

      const key = threadKeyFromPayload(payload)
      const receivedAt = new Date().toISOString()
      const msg = {
        ...chatMessageFromBroadcast(payload),
        receivedAt,
        createdAt: receivedAt,
      }
      setEphemeralByThread((prev) => {
        const list = prev[key] ?? []
        if (list.some((m) => m.clientId === msg.clientId)) return prev
        return { ...prev, [key]: [...list, msg] }
      })
    }

    const map = channelsRef.current

    for (const classId of classIds) {
      if (map.has(classId)) continue
      const ch = supabase.channel(channelName(tenantId, classId), {
        config: { broadcast: { self: true } },
      })
      ch.on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
        const normalized = normalizeDoubtChatPayload(payload)
        if (normalized) onMessage(normalized)
      })
      ch.subscribe()
      map.set(classId, ch)
    }

    for (const id of [...map.keys()]) {
      if (!classIds.includes(id)) {
        void supabase.removeChannel(map.get(id)!)
        map.delete(id)
      }
    }

    return () => {
      map.forEach((ch) => void supabase.removeChannel(ch))
      map.clear()
    }
  }, [
    tenantId,
    classIds.join(','),
    threadKeyFromPayload,
    options?.recipientStudentId,
    options?.currentUserId,
    options?.viewerRole,
  ])

  const addOptimistic = useCallback(
    (key: string, message: DoubtChatMessage) => {
      setEphemeralByThread((prev) => ({
        ...prev,
        [key]: [...(prev[key] ?? []), message],
      }))
    },
    [],
  )

  const publish = useCallback(
    async (payload: DoubtChatPayload) => {
      if (!tenantId || !payload.classId) return false
      const ch = channelsRef.current.get(payload.classId)
      if (ch && ch.state === 'joined') {
        try {
          await ch.send({ type: 'broadcast', event: BROADCAST_EVENT, payload })
          return true
        } catch {
          /* fall through to one-shot channel */
        }
      }
      return publishDoubtChatMessage(tenantId, payload.classId, payload)
    },
    [tenantId],
  )

  const removeEphemeralClient = useCallback((threadId: string, clientId: string) => {
    setEphemeralByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).filter((m) => m.clientId !== clientId),
    }))
  }, [])

  const clearEphemeralThread = useCallback((threadId: string) => {
    setEphemeralByThread((prev) => {
      if (!prev[threadId]?.length) return prev
      const next = { ...prev }
      delete next[threadId]
      return next
    })
  }, [])

  const markDelivered = useCallback((threadId: string, clientId: string) => {
    setEphemeralByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).map((m) =>
        m.clientId === clientId
          ? { ...m, deliveryStatus: 'delivered' as const, pending: false }
          : m,
      ),
    }))
  }, [])

  const markFailed = useCallback((threadId: string, clientId: string) => {
    setEphemeralByThread((prev) => ({
      ...prev,
      [threadId]: (prev[threadId] ?? []).map((m) =>
        m.clientId === clientId
          ? { ...m, failed: true, pending: false, deliveryStatus: 'failed' as const }
          : m,
      ),
    }))
  }, [])

  return {
    ephemeralByThread,
    newClientMessageId,
    addOptimistic,
    publish,
    markDelivered,
    markFailed,
    removeEphemeralClient,
    clearEphemeralThread,
    liveEnabled: supabaseRealtimeEnabled,
    mergeChatMessages,
    pruneEphemeralAgainstServer,
  }
}
