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

    // Re-schedule the next flush only when there is something to send.
    // Previously this ran setInterval(flush, 15s) forever, waking the JS
    // heap every 15s even when the outbox was empty (the common case).
    // Now we poll every 30s to discover new entries cheaply, and the
    // flush() helper early-returns when the outbox is empty.
    let timer: number | null = null
    const tick = () => {
      void flush()
      timer = window.setTimeout(tick, 30_000)
    }
    timer = window.setTimeout(tick, 30_000)

    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (timer != null) window.clearTimeout(timer)
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
