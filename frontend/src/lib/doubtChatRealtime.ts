/**
 * Low-latency doubt chat via Supabase Realtime Broadcast (no DB round-trip for delivery).
 */
import { supabase, supabaseRealtimeEnabled } from '@/lib/supabase'

export type DoubtChatKind = 'student_doubt' | 'teacher_reply'
export type DoubtChatReplyType = 'text' | 'audio' | 'file'

export type DoubtChatPayload = {
  clientId: string
  kind: DoubtChatKind
  classId: string
  studentId: string
  doubtId?: string
  replyId?: string
  /** Display label / caption (not a separate subject line). */
  text: string
  replyType?: DoubtChatReplyType
  audioUrl?: string | null
  fileUrl?: string | null
  fileName?: string | null
  createdAt: string
  senderUserId: string
  persisted?: boolean
}

function readStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v) return v
  }
  return ''
}

/** Infer message kind when broadcast payload omits or renames `kind`. */
export function normalizeDoubtChatKind(raw: Record<string, unknown>): DoubtChatKind {
  const k = raw.kind ?? raw.Kind
  if (k === 'teacher_reply') return 'teacher_reply'
  if (k === 'student_doubt') return 'student_doubt'
  if (readStr(raw, 'replyId', 'reply_id')) return 'teacher_reply'
  return 'student_doubt'
}

/** Normalize Supabase/Redis broadcast bodies (camelCase or snake_case). */
export function normalizeDoubtChatPayload(raw: unknown): DoubtChatPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const clientId = readStr(p, 'clientId', 'client_id')
  if (!clientId) return null

  const classId = readStr(p, 'classId', 'class_id')
  const studentId = readStr(p, 'studentId', 'student_id')
  const doubtId = readStr(p, 'doubtId', 'doubt_id') || undefined
  const replyId = readStr(p, 'replyId', 'reply_id') || undefined
  const senderUserId = readStr(p, 'senderUserId', 'sender_user_id')
  const createdAt = readStr(p, 'createdAt', 'created_at') || new Date().toISOString()
  const text = readStr(p, 'text') || ''
  const replyType = (readStr(p, 'replyType', 'reply_type') || 'text') as DoubtChatReplyType

  return {
    clientId,
    kind: normalizeDoubtChatKind(p),
    classId,
    studentId,
    doubtId,
    replyId,
    text,
    replyType,
    audioUrl: readStr(p, 'audioUrl', 'audio_url') || null,
    fileUrl: readStr(p, 'fileUrl', 'file_url') || null,
    fileName: readStr(p, 'fileName', 'file_name') || null,
    createdAt,
    senderUserId,
    persisted: Boolean(p.persisted),
  }
}

const CHANNEL_PREFIX = 'doubt-chat'
const BROADCAST_EVENT = 'message'

function channelName(tenantId: string, classId: string): string {
  return `${CHANNEL_PREFIX}:${tenantId}:${classId}`
}

export function newClientMessageId(): string {
  return crypto.randomUUID()
}

export async function publishDoubtChatMessage(
  tenantId: string,
  classId: string,
  payload: DoubtChatPayload,
): Promise<boolean> {
  if (!supabaseRealtimeEnabled || !tenantId || !classId) return false

  const ch = supabase.channel(channelName(tenantId, classId), {
    config: { broadcast: { self: true, ack: false } },
  })

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      void supabase.removeChannel(ch)
      resolve(false)
    }, 4000)

    ch.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      void ch
        .send({ type: 'broadcast', event: BROADCAST_EVENT, payload })
        .then(() => {
          window.clearTimeout(timeout)
          void supabase.removeChannel(ch)
          resolve(true)
        })
        .catch(() => {
          window.clearTimeout(timeout)
          void supabase.removeChannel(ch)
          resolve(false)
        })
    })
  })
}

export function subscribeDoubtChatMessages(
  tenantId: string,
  classIds: string[],
  onMessage: (payload: DoubtChatPayload) => void,
): () => void {
  if (!supabaseRealtimeEnabled || !tenantId || classIds.length === 0) {
    return () => {}
  }

  const channels = classIds.map((classId) => {
    const ch = supabase.channel(channelName(tenantId, classId), {
      config: { broadcast: { self: true } },
    })
    ch.on('broadcast', { event: BROADCAST_EVENT }, ({ payload }) => {
      const normalized = normalizeDoubtChatPayload(payload)
      if (normalized) onMessage(normalized)
    }).subscribe()
    return ch
  })

  return () => {
    channels.forEach((ch) => void supabase.removeChannel(ch))
  }
}
