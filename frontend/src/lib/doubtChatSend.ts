import api from '@/services/api'
import type { DoubtChatPayload } from '@/lib/doubtChatRealtime'
import {
  claimOutboxDelivery,
  markOutboxSynced,
  releaseOutboxDelivery,
  type StudentOutboxEntry,
  type TeacherOutboxEntry,
} from '@/lib/doubtOutbox'
import type { QueryClient } from '@tanstack/react-query'

export type StudentSendParams = {
  queryClient: QueryClient
  entry: StudentOutboxEntry
  publish: (payload: DoubtChatPayload) => Promise<boolean>
  liveEnabled: boolean
}

export type TeacherSendParams = {
  queryClient: QueryClient
  entry: TeacherOutboxEntry
  filter: 'all' | 'pending'
  publish: (payload: DoubtChatPayload) => Promise<boolean>
  liveEnabled: boolean
}

export async function deliverStudentOutboxEntry({
  entry,
  publish,
  liveEnabled,
}: StudentSendParams): Promise<boolean> {
  const { clientId, class_id: classId, student_id: studentId, user_id: userId } = entry
  if (entry.synced) return false
  if (!claimOutboxDelivery(clientId)) return false

  try {
  if (liveEnabled && entry.tenant_id) {
    await publish({
      clientId,
      kind: 'student_doubt',
      classId,
      studentId,
      text: entry.preview,
      replyType: entry.reply_type,
      audioUrl: entry.audio_url ?? null,
      fileUrl: entry.file_url ?? null,
      fileName: entry.file_name ?? null,
      createdAt: entry.sentAt,
      senderUserId: userId,
    })
  }

  await api.post(
    '/student/doubts',
    {
      class_id: classId,
      body: entry.body,
      reply_type: entry.reply_type,
      audio_url: entry.audio_url ?? undefined,
      file_url: entry.file_url ?? undefined,
      file_name: entry.file_name ?? undefined,
      client_message_id: clientId,
      client_sent_at: entry.sentAt,
    },
    { timeout: entry.reply_type === 'text' ? 30_000 : 120_000 },
  )

  markOutboxSynced(clientId)
  return true
  } finally {
    releaseOutboxDelivery(clientId)
  }
}

export async function deliverTeacherOutboxEntry({
  entry,
  publish,
  liveEnabled,
}: TeacherSendParams): Promise<boolean> {
  const { clientId, doubt_id: doubtId, class_id: classId, student_id: studentId, user_id: userId } =
    entry
  if (entry.synced) return false
  if (!claimOutboxDelivery(clientId)) return false

  try {
  const payload: Record<string, string | undefined> = {
    reply_type: entry.reply_type,
    body: entry.body,
    audio_url: entry.audio_url ?? undefined,
    file_url: entry.file_url ?? undefined,
    file_name: entry.file_name ?? undefined,
    client_message_id: clientId,
    client_sent_at: entry.sentAt,
  }

  if (liveEnabled && entry.tenant_id && classId) {
    await publish({
      clientId,
      kind: 'teacher_reply',
      classId,
      studentId,
      doubtId,
      text: entry.preview,
      replyType: entry.reply_type,
      audioUrl: entry.audio_url ?? null,
      fileUrl: entry.file_url ?? null,
      fileName: entry.file_name ?? null,
      createdAt: entry.sentAt,
      senderUserId: userId,
    })
  }

  await api.post(`/teacher/doubts/${doubtId}/reply`, payload, {
    timeout: entry.reply_type === 'text' ? 30_000 : 120_000,
  })

  markOutboxSynced(clientId)
  return true
  } finally {
    releaseOutboxDelivery(clientId)
  }
}
