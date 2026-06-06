import { clientIdFromEntityId } from '@/lib/doubtChatBuild'
import {
  normalizeDoubtChatKind,
  type DoubtChatPayload,
} from '@/lib/doubtChatRealtime'
import { doubtPreviewLabel } from '@/lib/doubtChatUtils'

export type DoubtDeliveryStatus = 'sending' | 'delivered' | 'read' | 'failed'

export type DoubtChatMessage = {
  id: string
  side: 'student' | 'teacher'
  /** Sort / legacy timestamp. */
  createdAt: string
  /** When you tapped send (outgoing bubbles). */
  sentAt?: string
  /** When the other party got it (incoming bubbles). */
  receivedAt?: string
  doubtId?: string
  teacherSeen?: boolean
  text?: string | null
  replyType?: 'text' | 'audio' | 'file'
  audioUrl?: string | null
  fileUrl?: string | null
  fileName?: string | null
  clientId?: string
  /** @deprecated use deliveryStatus */
  pending?: boolean
  deliveryStatus?: DoubtDeliveryStatus
  failed?: boolean
}

/** Resolve client id from message id prefixes (outbox, pending, broadcast). */
export function clientIdFromMessageId(id: string): string | undefined {
  if (id.startsWith('outbox-')) return id.slice('outbox-'.length)
  if (id.startsWith('client-')) return id.slice('client-'.length)
  if (id.startsWith('doubt-')) return clientIdFromEntityId(id.slice('doubt-'.length))
  if (id.startsWith('reply-')) return clientIdFromEntityId(id.slice('reply-'.length))
  return undefined
}

export function resolveClientId(message: DoubtChatMessage): string | undefined {
  return message.clientId ?? clientIdFromMessageId(message.id)
}

function isEphemeralMessageId(id: string): boolean {
  return (
    id.startsWith('outbox-') ||
    id.startsWith('client-') ||
    id.includes('pending-')
  )
}

function contentKey(message: DoubtChatMessage): string {
  const label = (message.text ?? '').trim() || doubtPreviewLabel(message)
  return `${message.side}:${message.doubtId ?? ''}:${message.replyType ?? 'text'}:${label}:${message.audioUrl ?? ''}:${message.fileUrl ?? ''}`
}

/** Prefer the most advanced delivery state (failed > read > delivered > sending). */
export function resolveDeliveryStatus(
  a?: DoubtDeliveryStatus,
  b?: DoubtDeliveryStatus,
): DoubtDeliveryStatus {
  const rank: Record<DoubtDeliveryStatus, number> = {
    sending: 0,
    delivered: 1,
    read: 2,
    failed: 3,
  }
  const pick = (x?: DoubtDeliveryStatus, y?: DoubtDeliveryStatus): DoubtDeliveryStatus => {
    if (x === 'failed' || y === 'failed') return 'failed'
    if (!x) return y ?? 'delivered'
    if (!y) return x
    return rank[x] >= rank[y] ? x : y
  }
  return pick(a, b)
}

function mergePair(
  existing: DoubtChatMessage,
  incoming: DoubtChatMessage,
): DoubtChatMessage {
  const existingEphemeral = isEphemeralMessageId(existing.id)
  const incomingEphemeral = isEphemeralMessageId(incoming.id)
  const base =
    existingEphemeral && !incomingEphemeral
      ? incoming
      : !existingEphemeral && incomingEphemeral
        ? existing
        : existing

  const overlay = base === existing ? incoming : existing
  const clientId = resolveClientId(base) ?? resolveClientId(overlay)

  const status = resolveDeliveryStatus(base.deliveryStatus, overlay.deliveryStatus)

  return {
    ...base,
    ...overlay,
    id: base.id,
    clientId,
    sentAt: overlay.sentAt ?? base.sentAt ?? base.createdAt,
    receivedAt: base.receivedAt ?? overlay.receivedAt,
    deliveryStatus: status,
    failed: overlay.failed ?? base.failed,
    pending: status === 'sending',
  }
}

/**
 * Merge server + local rows without duplicate bubbles (same clientId or same content).
 */
export function mergeChatMessages(
  serverMessages: DoubtChatMessage[],
  localMessages: DoubtChatMessage[],
): DoubtChatMessage[] {
  if (!localMessages.length) return serverMessages

  const byClient = new Map<string, DoubtChatMessage>()
  const byContent = new Map<string, DoubtChatMessage>()
  const order: string[] = []

  const remember = (m: DoubtChatMessage) => {
    const cid = resolveClientId(m)
    if (cid) {
      const prev = byClient.get(cid)
      byClient.set(cid, prev ? mergePair(prev, m) : m)
      if (!order.includes(`c:${cid}`)) order.push(`c:${cid}`)
      return
    }
    const key = contentKey(m)
    const prev = byContent.get(key)
    byContent.set(key, prev ? mergePair(prev, m) : m)
    if (!order.includes(`k:${key}`)) order.push(`k:${key}`)
  }

  for (const m of serverMessages) remember(m)
  for (const m of localMessages) remember(m)

  const out: DoubtChatMessage[] = []
  const seen = new Set<DoubtChatMessage>()
  for (const token of order) {
    const m = token.startsWith('c:')
      ? byClient.get(token.slice(2))
      : byContent.get(token.slice(2))
    if (m && !seen.has(m)) {
      seen.add(m)
      out.push(m)
    }
  }
  return out
}

export function chatMessageFromBroadcast(payload: DoubtChatPayload): DoubtChatMessage {
  const replyType = payload.replyType ?? 'text'
  const kind =
    payload.kind ?? normalizeDoubtChatKind(payload as unknown as Record<string, unknown>)
  const base = {
    id: `client-${payload.clientId}`,
    clientId: payload.clientId,
    createdAt: payload.createdAt,
    doubtId: payload.doubtId,
    text: payload.text,
    replyType,
    audioUrl: payload.audioUrl ?? null,
    fileUrl: payload.fileUrl ?? null,
    fileName: payload.fileName ?? null,
  }
  const receivedAt = payload.createdAt
  if (kind === 'teacher_reply') {
    return { ...base, side: 'teacher', receivedAt }
  }
  return { ...base, side: 'student', teacherSeen: false, receivedAt }
}

export function timelineInstant(message: DoubtChatMessage, outgoingSide: 'student' | 'teacher'): number {
  const outgoing = message.side === outgoingSide
  const raw = outgoing
    ? message.sentAt ?? message.createdAt
    : message.receivedAt ?? message.createdAt
  return Date.parse(raw) || 0
}

/** Outgoing: sent time. Incoming: received time. */
export function applyMessageTimestamps(
  messages: DoubtChatMessage[],
  outgoingSide: 'student' | 'teacher',
  sentAtByClientId?: Map<string, string>,
): DoubtChatMessage[] {
  return messages.map((m) => {
    const outgoing = m.side === outgoingSide
    const clientId = resolveClientId(m)

    if (outgoing) {
      const sentAt = (clientId && sentAtByClientId?.get(clientId)) || m.sentAt || m.createdAt
      return {
        ...m,
        clientId,
        sentAt,
        receivedAt: m.receivedAt ?? (m.sentAt ? m.createdAt : undefined),
      }
    }
    return {
      ...m,
      clientId,
      receivedAt: m.receivedAt ?? m.createdAt,
    }
  })
}

/** Apply clock/tick state from in-memory send tracking onto cached/server messages. */
export function applyDeliveryOverlay(
  messages: DoubtChatMessage[],
  ephemeral: DoubtChatMessage[],
): DoubtChatMessage[] {
  if (!ephemeral.length) return messages
  const byClient = new Map<string, DoubtChatMessage>()
  for (const e of ephemeral) {
    const cid = resolveClientId(e)
    if (cid) byClient.set(cid, e)
  }
  return messages.map((m) => {
    const clientId = resolveClientId(m)
    const ep = clientId ? byClient.get(clientId) : undefined
    if (!ep) return m
    const status = resolveDeliveryStatus(m.deliveryStatus, ep.deliveryStatus)
    return {
      ...m,
      clientId,
      deliveryStatus: status,
      failed: ep.failed ?? m.failed,
      pending: status === 'sending',
    }
  })
}

export function pruneEphemeralAgainstServer(
  ephemeral: DoubtChatMessage[],
  serverMessages: DoubtChatMessage[],
): DoubtChatMessage[] {
  const serverClientIds = new Set(
    serverMessages.map((s) => resolveClientId(s)).filter((id): id is string => !!id),
  )
  return ephemeral.filter((e) => {
    const cid = resolveClientId(e)
    if (cid && serverClientIds.has(cid)) return false
    if (e.clientId && e.deliveryStatus && !(e.text ?? '').trim() && !e.audioUrl && !e.fileUrl) {
      return true
    }
    const label = doubtPreviewLabel(e)
    if (!label && !e.audioUrl && !e.fileUrl) return false
    const duplicate = serverMessages.some(
      (s) =>
        s.side === e.side &&
        (s.replyType ?? 'text') === (e.replyType ?? 'text') &&
        (s.audioUrl || '') === (e.audioUrl || '') &&
        (s.fileUrl || '') === (e.fileUrl || '') &&
        ((s.text ?? '').trim() === label ||
          (!!(s.audioUrl || s.fileUrl) && !!(e.audioUrl || e.fileUrl))),
    )
    return !duplicate
  })
}

function isPersistedEntityId(entityId: string): boolean {
  return (
    !entityId.startsWith('pending-reply-') &&
    !entityId.startsWith('pending-')
  )
}

/** True when a persisted server row already represents this outbox send. */
export function serverHasClientMessage(
  serverMessages: DoubtChatMessage[],
  clientId: string,
): boolean {
  return serverMessages.some((m) => {
    if (resolveClientId(m) !== clientId) return false
    const entityId = m.id.startsWith('reply-')
      ? m.id.slice('reply-'.length)
      : m.id.startsWith('doubt-')
        ? m.id.slice('doubt-'.length)
        : m.id
    return isPersistedEntityId(entityId)
  })
}
