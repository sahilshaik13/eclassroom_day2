/**
 * Persists unsent / failed doubt chat messages in localStorage and retries when online.
 */
import type { DoubtChatReplyType } from '@/lib/doubtChatRealtime'

const OUTBOX_VERSION = 1
const OUTBOX_KEY = `eclassroom-doubt-outbox-v${OUTBOX_VERSION}`

/** Prevent duplicate API sends when flush and sendReply run together. */
const inFlightDeliveries = new Set<string>()

export type StudentOutboxEntry = {
  kind: 'student_doubt'
  clientId: string
  threadKey: string
  sentAt: string
  class_id: string
  student_id: string
  user_id: string
  tenant_id: string
  preview: string
  body?: string
  reply_type: DoubtChatReplyType
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
  attempts: number
  failed?: boolean
  /** API accepted; hide outbox bubble once the same message is in chat cache. */
  synced?: boolean
}

export type TeacherOutboxEntry = {
  kind: 'teacher_reply'
  clientId: string
  threadKey: string
  sentAt: string
  doubt_id: string
  class_id: string
  student_id: string
  user_id: string
  tenant_id: string
  preview: string
  body?: string
  reply_type: DoubtChatReplyType
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
  attempts: number
  failed?: boolean
  synced?: boolean
}

export type DoubtOutboxEntry = StudentOutboxEntry | TeacherOutboxEntry

type OutboxEnvelope = {
  v: number
  entries: DoubtOutboxEntry[]
}

function readOutbox(): DoubtOutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OutboxEnvelope
    if (parsed?.v !== OUTBOX_VERSION || !Array.isArray(parsed.entries)) return []
    return parsed.entries
  } catch {
    return []
  }
}

function writeOutbox(entries: DoubtOutboxEntry[]): void {
  try {
    const envelope: OutboxEnvelope = { v: OUTBOX_VERSION, entries }
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(envelope))
  } catch {
    /* quota */
  }
}

export function listOutbox(kind?: DoubtOutboxEntry['kind']): DoubtOutboxEntry[] {
  const all = readOutbox()
  return kind ? all.filter((e) => e.kind === kind) : all
}

/** Rows that still need an API send (flush / retry). */
export function listDeliverableOutbox(kind?: DoubtOutboxEntry['kind']): DoubtOutboxEntry[] {
  return listOutbox(kind).filter((e) => !e.synced || e.failed)
}

/** Outbox rows still shown as a sending bubble (not yet mirrored in server cache). */
export function listVisibleOutbox(
  kind?: DoubtOutboxEntry['kind'],
  serverHasClient?: (clientId: string) => boolean,
): DoubtOutboxEntry[] {
  return listOutbox(kind).filter((e) => {
    if (e.failed) return true
    if (!e.synced) return true
    if (serverHasClient) return !serverHasClient(e.clientId)
    return true
  })
}

export function getOutboxForThread(
  threadKey: string,
  kind?: DoubtOutboxEntry['kind'],
  serverHasClient?: (clientId: string) => boolean,
): DoubtOutboxEntry[] {
  return listVisibleOutbox(kind, serverHasClient).filter((e) => e.threadKey === threadKey)
}

/** Drop synced outbox rows once the server timeline includes the same client id. */
export function pruneDeliveredOutbox(
  serverHasClient: (clientId: string) => boolean,
): boolean {
  let removed = false
  const kept = readOutbox().filter((e) => {
    if (e.synced && serverHasClient(e.clientId)) {
      removed = true
      return false
    }
    return true
  })
  if (removed) writeOutbox(kept)
  return removed
}

export function markOutboxSynced(clientId: string): void {
  writeOutbox(
    readOutbox().map((e) =>
      e.clientId === clientId ? { ...e, synced: true, failed: false } : e,
    ),
  )
}

export function isOutboxSynced(clientId: string): boolean {
  return readOutbox().some((e) => e.clientId === clientId && !!e.synced)
}

export function claimOutboxDelivery(clientId: string): boolean {
  if (inFlightDeliveries.has(clientId)) return false
  inFlightDeliveries.add(clientId)
  return true
}

export function releaseOutboxDelivery(clientId: string): void {
  inFlightDeliveries.delete(clientId)
}

export function upsertOutbox(entry: DoubtOutboxEntry): void {
  const entries = readOutbox().filter((e) => e.clientId !== entry.clientId)
  entries.push({ ...entry, attempts: entry.attempts ?? 0 })
  writeOutbox(entries)
}

export function removeOutbox(clientId: string): void {
  writeOutbox(readOutbox().filter((e) => e.clientId !== clientId))
}

export function bumpOutboxAttempt(clientId: string): void {
  writeOutbox(
    readOutbox().map((e) =>
      e.clientId === clientId ? { ...e, attempts: (e.attempts ?? 0) + 1 } : e,
    ),
  )
}

export function sentAtByClientId(): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of readOutbox()) {
    map.set(e.clientId, e.sentAt)
  }
  return map
}
