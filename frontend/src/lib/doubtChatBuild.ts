import { timelineInstant, type DoubtChatMessage } from '@/lib/doubtChatMerge'
import { doubtPreviewLabel } from '@/lib/doubtChatUtils'
import { isOutboxSynced } from '@/lib/doubtOutbox'
import type { Doubt, DoubtResponse } from '@/types'

type ApiDoubt = Doubt & {
  doubt_responses?: DoubtResponse[]
}

const PENDING_DOUBT_PREFIX = 'pending-'
const PENDING_REPLY_PREFIX = 'pending-reply-'

/** Stable client id from optimistic DB row ids. */
export function clientIdFromEntityId(entityId: string): string | undefined {
  if (entityId.startsWith(PENDING_DOUBT_PREFIX)) {
    return entityId.slice(PENDING_DOUBT_PREFIX.length)
  }
  if (entityId.startsWith(PENDING_REPLY_PREFIX)) {
    return entityId.slice(PENDING_REPLY_PREFIX.length)
  }
  return undefined
}

function doubtResponses(doubt: ApiDoubt): DoubtResponse[] {
  const list = doubt.responses ?? doubt.doubt_responses ?? []
  return [...list].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
}

/** Chronological order for chat bubbles (oldest → newest). */
export function sortChatMessagesByTime(
  messages: DoubtChatMessage[],
  outgoingSide: 'student' | 'teacher' = 'student',
): DoubtChatMessage[] {
  return [...messages].sort((a, b) => {
    const ta = timelineInstant(a, outgoingSide)
    const tb = timelineInstant(b, outgoingSide)
    if (ta !== tb) return ta - tb
    if (a.side !== b.side) return a.side === 'student' ? -1 : 1
    return a.id.localeCompare(b.id)
  })
}

/**
 * Flatten doubts + replies into one timeline (not grouped per doubt row).
 * Fixes out-of-order UI when multiple student messages and replies interleave.
 */
export function buildChatMessagesFromDoubts(
  doubts: ApiDoubt[],
  outgoingSide: 'student' | 'teacher' = 'student',
): DoubtChatMessage[] {
  const messages: DoubtChatMessage[] = []

  for (const doubt of doubts) {
    const doubtReplyType = doubt.reply_type ?? 'text'
    const doubtSentAt =
      (doubt as ApiDoubt & { client_sent_at?: string }).client_sent_at ?? doubt.created_at
    const doubtClientId = clientIdFromEntityId(String(doubt.id))
    const doubtPending = !!doubtClientId && !isOutboxSynced(doubtClientId)
    messages.push({
      id: `doubt-${doubt.id}`,
      clientId: doubtClientId,
      side: 'student',
      createdAt: doubt.created_at,
      sentAt: doubtSentAt,
      receivedAt: doubt.created_at,
      doubtId: doubt.id,
      text:
        doubt.body ||
        doubtPreviewLabel({
          text: doubt.body,
          replyType: doubtReplyType,
          fileName: doubt.file_name,
        }),
      replyType: doubtReplyType,
      audioUrl: doubt.audio_url,
      fileUrl: doubt.file_url,
      fileName: doubt.file_name,
      teacherSeen: !!doubt.teacher_seen_at,
      deliveryStatus: doubtPending
        ? 'sending'
        : doubt.teacher_seen_at
          ? 'read'
          : 'delivered',
    })

    for (const r of doubtResponses(doubt)) {
      const replySentAt =
        (r as DoubtResponse & { client_sent_at?: string }).client_sent_at ?? r.created_at
      const replyClientId = clientIdFromEntityId(String(r.id))
      const replyPending = !!replyClientId && !isOutboxSynced(replyClientId)
      messages.push({
        id: `reply-${r.id}`,
        clientId: replyClientId,
        side: 'teacher',
        createdAt: r.created_at,
        sentAt: replySentAt,
        receivedAt: r.created_at,
        doubtId: doubt.id,
        text:
          r.body ||
          doubtPreviewLabel({
            text: r.body,
            replyType: r.reply_type ?? 'text',
            fileName: r.file_name,
          }),
        replyType: r.reply_type ?? 'text',
        audioUrl: r.audio_url,
        fileUrl: r.file_url,
        fileName: r.file_name,
        deliveryStatus: replyPending ? 'sending' : 'delivered',
      })
    }
  }

  return sortChatMessagesByTime(messages, outgoingSide)
}
