import { useCallback, useEffect, useRef } from 'react'
import {
  listDeliverableOutbox,
  bumpOutboxAttempt,
  type DoubtOutboxEntry,
} from '@/lib/doubtOutbox'
import {
  deliverStudentOutboxEntry,
  deliverTeacherOutboxEntry,
  type StudentSendParams,
  type TeacherSendParams,
} from '@/lib/doubtChatSend'

type UseDoubtOutboxFlushOptions = {
  role: 'student' | 'teacher'
  enabled?: boolean
  studentDeps?: Omit<StudentSendParams, 'entry'> | null
  teacherDeps?: Omit<TeacherSendParams, 'entry'> | null
  onDelivered?: (clientId: string) => void
  onFailed?: (clientId: string) => void
}

export function useDoubtOutboxFlush({
  role,
  enabled = true,
  studentDeps,
  teacherDeps,
  onDelivered,
  onFailed,
}: UseDoubtOutboxFlushOptions) {
  const flushingRef = useRef(false)

  const flush = useCallback(async () => {
    if (!enabled || flushingRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return

    const kind = role === 'student' ? 'student_doubt' : 'teacher_reply'
    const entries = listDeliverableOutbox(kind)
    if (!entries.length) return

    if (role === 'student' && !studentDeps) return
    if (role === 'teacher' && !teacherDeps) return

    flushingRef.current = true
    try {
      for (const entry of entries) {
        try {
          let sent = false
          if (entry.kind === 'student_doubt' && studentDeps) {
            sent = await deliverStudentOutboxEntry({ ...studentDeps, entry })
          } else if (entry.kind === 'teacher_reply' && teacherDeps) {
            sent = await deliverTeacherOutboxEntry({ ...teacherDeps, entry })
          }
          if (sent) onDelivered?.(entry.clientId)
        } catch {
          bumpOutboxAttempt(entry.clientId)
          onFailed?.(entry.clientId)
        }
      }
    } finally {
      flushingRef.current = false
    }
  }, [enabled, role, studentDeps, teacherDeps, onDelivered, onFailed])

  useEffect(() => {
    if (!enabled) return
    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    const interval = window.setInterval(() => void flush(), 15_000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(interval)
    }
  }, [enabled, flush])

  return { flushOutbox: flush }
}

export function outboxEntriesToMessages(
  entries: DoubtOutboxEntry[],
  outgoingSide: 'student' | 'teacher',
): import('@/lib/doubtChatMerge').DoubtChatMessage[] {
  return entries.map((e) => {
    const side: 'student' | 'teacher' = e.kind === 'student_doubt' ? 'student' : 'teacher'
    const deliveryStatus: 'sending' | 'delivered' | 'failed' = e.failed
      ? 'failed'
      : e.synced
        ? 'delivered'
        : 'sending'
    return {
      id: `outbox-${e.clientId}`,
      clientId: e.clientId,
      side,
      sentAt: e.sentAt,
      createdAt: e.sentAt,
      text: e.preview,
      replyType: e.reply_type,
      audioUrl: e.audio_url ?? null,
      fileUrl: e.file_url ?? null,
      fileName: e.file_name ?? null,
      doubtId: e.kind === 'teacher_reply' ? e.doubt_id : undefined,
      deliveryStatus,
      teacherSeen: false,
    }
  }).filter((m) => m.side === outgoingSide)
}
