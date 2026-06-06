import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { subscribeToTeacherDoubts } from '@/lib/realtime'
import { useDoubtChatLive } from '@/hooks/useDoubtChatLive'
import { useAuthStore } from '@/stores/authStore'
import { buildChatMessagesFromDoubts, sortChatMessagesByTime } from '@/lib/doubtChatBuild'
import {
  applyDeliveryOverlay,
  applyMessageTimestamps,
  serverHasClientMessage,
  type DoubtChatMessage,
} from '@/lib/doubtChatMerge'
import {
  listVisibleOutbox,
  markOutboxSynced,
  pruneDeliveredOutbox,
  sentAtByClientId,
  upsertOutbox,
  type TeacherOutboxEntry,
} from '@/lib/doubtOutbox'
import { deliverTeacherOutboxEntry } from '@/lib/doubtChatSend'
import { useDoubtOutboxFlush, outboxEntriesToMessages } from '@/hooks/useDoubtOutboxFlush'
import {
  Send,
  Paperclip,
  Mic,
  Square,
  Loader2,
  MessageCircle,
  FileText,
  Trash2,
  X,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import {
  appendBroadcastStudentDoubt,
  appendOptimisticTeacherReply,
  clearTeacherDoubtsSessionCache,
  fetchTeacherDoubts,
  isDoubtsInitialLoad,
  clearTeacherStudentChat,
  clearTeacherStudentChatCache,
  softRefetchTeacherDoubts,
  teacherDoubtsQueryOptions,
} from '@/lib/doubtsQueries'
import type { Doubt, DoubtResponse } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DoubtChatBubble } from '@/components/doubts/DoubtChatBubble'
import { LiveWaveform } from '@/components/ui/live-waveform'
import {
  blobToDataUrl,
  doubtPreviewLabel,
  fileToDataUrl,
  scrollChatPaneToBottom,
} from '@/lib/doubtChatUtils'

type ApiDoubt = Doubt & {
  students?: { id?: string; name?: string } | null
  doubt_responses?: DoubtResponse[]
}

type ChatMessage = {
  id: string
  side: 'student' | 'teacher'
  createdAt: string
  doubtId?: string
  title?: string
  text?: string | null
  replyType?: 'text' | 'audio' | 'file'
  audioUrl?: string | null
  fileUrl?: string | null
  fileName?: string | null
}

type StudentThread = {
  studentId: string
  studentName: string
  initials: string
  pendingCount: number
  lastAt: string
  preview: string
  doubts: ApiDoubt[]
  messages: ChatMessage[]
  activeDoubtId: string | null
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatChatTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatListTime(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  if (sameDay) return formatChatTime(dateStr)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return 'Yesterday'
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function previewForMessage(msg: ChatMessage): string {
  if (msg.text?.trim()) return msg.text.trim()
  if (msg.replyType === 'audio' || msg.audioUrl) return '🎤 Voice message'
  if (msg.replyType === 'file' || msg.fileUrl) return `📎 ${msg.fileName || 'File'}`
  return 'New message'
}

function buildMessages(doubts: ApiDoubt[]): ChatMessage[] {
  return buildChatMessagesFromDoubts(doubts, 'teacher') as ChatMessage[]
}

function buildThreads(doubts: ApiDoubt[]): StudentThread[] {
  const byStudent = new Map<string, ApiDoubt[]>()
  for (const doubt of doubts) {
    const studentId =
      (doubt as ApiDoubt).students?.id ??
      (doubt as any).student_id ??
      doubt.students?.name ??
      doubt.id
    const key = String(studentId)
    const list = byStudent.get(key) ?? []
    list.push(doubt)
    byStudent.set(key, list)
  }

  const threads: StudentThread[] = []
  for (const [studentId, studentDoubts] of byStudent) {
    const studentName = studentDoubts[0]?.students?.name ?? 'Student'
    const messages = buildMessages(studentDoubts)
    const last = messages[messages.length - 1]
    const pending = studentDoubts.filter((d) => d.status === 'pending')
    const latestDoubt = [...studentDoubts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]
    const activeDoubtId = latestDoubt?.id ?? null

    threads.push({
      studentId,
      studentName,
      initials: initialsFor(studentName),
      pendingCount: pending.length,
      lastAt: last?.createdAt ?? studentDoubts[0]?.created_at ?? '',
      preview: last ? previewForMessage(last) : 'No messages yet',
      doubts: studentDoubts,
      messages,
      activeDoubtId,
    })
  }

  return threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
}

type TeacherDoubtsChatProps = {
  variant?: 'embedded' | 'full'
  statusFilter?: 'pending' | 'all'
}

export function TeacherDoubtsChat({
  variant = 'embedded',
}: TeacherDoubtsChatProps) {
  const queryClient = useQueryClient()
  const userId = useAuthStore((s) => s.user?.id)
  const tenantId = useAuthStore((s) => s.user?.tenant_id)
  const teacherName = useAuthStore((s) => s.user?.name) ?? 'Teacher'
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [outboxTick, setOutboxTick] = useState(0)
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const lastScrollThreadRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const { data: classes = [] } = useQuery({
    queryKey: queryKeys.teacher.classes(),
    queryFn: async () => (await api.get('/teacher/classes')).data?.data ?? [],
    staleTime: 60_000,
  })

  const classIds = useMemo(
    () => (classes as { id: string }[]).map((c) => c.id).filter(Boolean),
    [classes],
  )

  const doubtsFilter = 'all' as const

  useEffect(() => {
    clearTeacherDoubtsSessionCache()
  }, [])

  const {
    data: doubtsRaw = [],
    isPending: doubtsPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.teacher.doubts(doubtsFilter),
    queryFn: () =>
      fetchTeacherDoubts(
        doubtsFilter,
        queryClient.getQueryData<Doubt[]>(queryKeys.teacher.doubts(doubtsFilter)),
      ),
    ...teacherDoubtsQueryOptions(doubtsFilter),
  })

  const loading = isDoubtsInitialLoad(doubtsPending, doubtsRaw)

  const scheduleRefresh = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null
      softRefetchTeacherDoubts(queryClient)
    }, 600)
  }, [queryClient])

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!classIds.length) return
    return subscribeToTeacherDoubts(classIds, {
      suppressToasts: true,
      onRefresh: scheduleRefresh,
    })
  }, [classIds.join(','), scheduleRefresh])

  const teacherFilter = 'all' as const

  const {
    ephemeralByThread,
    publish,
    newClientMessageId,
    markFailed,
    clearEphemeralThread,
    liveEnabled,
    mergeChatMessages: mergeMsgs,
    pruneEphemeralAgainstServer: pruneEphemeral,
  } = useDoubtChatLive(tenantId, classIds, 'studentId', {
    currentUserId: userId,
    viewerRole: 'teacher',
    onLiveMessage: (payload, { isOwn }) => {
      if (!isOwn && payload.kind === 'student_doubt') {
        appendBroadcastStudentDoubt(queryClient, teacherFilter, {
          clientId: payload.clientId,
          classId: payload.classId,
          studentId: payload.studentId,
          text: payload.text,
          createdAt: payload.createdAt,
          replyType: payload.replyType,
          audioUrl: payload.audioUrl,
          fileUrl: payload.fileUrl,
          fileName: payload.fileName,
        })
      }
    },
  })

  useDoubtOutboxFlush({
    role: 'teacher',
    enabled: !!userId && !sending,
    teacherDeps: {
      queryClient,
      filter: teacherFilter,
      publish,
      liveEnabled: !!(liveEnabled && tenantId),
    },
    onDelivered: (clientId) => {
      markOutboxSynced(clientId)
      setOutboxTick((n) => n + 1)
    },
    onFailed: () => setOutboxTick((n) => n + 1),
  })

  const baseThreads = useMemo(() => buildThreads(doubtsRaw), [doubtsRaw])

  const sentAtMap = useMemo(() => sentAtByClientId(), [outboxTick])

  const threads = useMemo(() => {
    return baseThreads.map((t) => {
      const serverMsgs = t.messages as DoubtChatMessage[]
      const hasClient = (clientId: string) =>
        serverHasClientMessage(serverMsgs, clientId)
      const ephemeral = ephemeralByThread[t.studentId] ?? []
      const threadOutbox = listVisibleOutbox('teacher_reply', hasClient).filter(
        (e) => e.threadKey === t.studentId,
      )
      const statusOverlay = outboxEntriesToMessages(threadOutbox, 'teacher')
      const prunedEphemeral = pruneEphemeral(ephemeral, serverMsgs)
      const merged = mergeMsgs(serverMsgs, prunedEphemeral)
      const messages = sortChatMessagesByTime(
        applyMessageTimestamps(
          applyDeliveryOverlay(merged, statusOverlay),
          'teacher',
          sentAtMap,
        ),
        'teacher',
      )
      const last = messages[messages.length - 1]
      return {
        ...t,
        messages,
        lastAt: last?.sentAt ?? last?.receivedAt ?? last?.createdAt ?? t.lastAt,
        preview: last ? previewForMessage(last) : t.preview,
      }
    })
  }, [baseThreads, ephemeralByThread, mergeMsgs, pruneEphemeral, outboxTick, sentAtMap])
  const displayThreads = threads

  const activeThread =
    displayThreads.find((t) => t.studentId === selectedStudentId) ??
    displayThreads[0] ??
    null

  useEffect(() => {
    if (displayThreads.length && !selectedStudentId) {
      setSelectedStudentId(displayThreads[0].studentId)
    }
  }, [displayThreads, selectedStudentId])

  useEffect(() => {
    if (isError) toast.error('Could not load student doubts')
  }, [isError])

  useEffect(() => {
    const threadId = activeThread?.studentId ?? null
    const behavior: ScrollBehavior =
      lastScrollThreadRef.current === threadId ? 'smooth' : 'auto'
    lastScrollThreadRef.current = threadId
    scrollChatPaneToBottom(messagesScrollRef.current, behavior)
  }, [activeThread?.studentId, activeThread?.messages.length])

  useEffect(() => {
    if (!activeThread?.messages?.length) return
    if (
      pruneDeliveredOutbox((clientId) =>
        serverHasClientMessage(activeThread.messages as DoubtChatMessage[], clientId),
      )
    ) {
      setOutboxTick((n) => n + 1)
    }
  }, [activeThread?.messages, activeThread?.studentId])

  const refresh = () => {
    softRefetchTeacherDoubts(queryClient)
    void queryClient.refetchQueries({
      queryKey: queryKeys.teacher.pulseToday(),
      type: 'active',
    })
  }

  const clearChat = async () => {
    if (!activeThread?.studentId || clearing) return
    const ok = window.confirm(
      `Clear chat with ${activeThread.studentName}? Messages will be hidden from both of you but kept on record.`,
    )
    if (!ok) return
    setClearing(true)
    try {
      await clearTeacherStudentChat(activeThread.studentId)
      clearTeacherStudentChatCache(queryClient, activeThread.studentId)
      clearEphemeralThread(activeThread.studentId)
      refresh()
      toast.success('Chat cleared (archived)')
    } catch {
      toast.error('Could not clear chat')
    } finally {
      setClearing(false)
    }
  }

  useEffect(() => {
    if (!activeThread?.doubts.length) return
    const unseen = activeThread.doubts
      .filter((d) => !d.teacher_seen_at)
      .map((d) => d.id)
    if (!unseen.length) return

    const seenAt = new Date().toISOString()
    void api.post('/teacher/doubts/mark-seen', { doubt_ids: unseen }).then(() => {
      queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts('all'), (old) => {
        const base = old ?? []
        return base.map((d) =>
          unseen.includes(d.id) ? { ...d, teacher_seen_at: seenAt } : d,
        )
      })
      if (teacherFilter === 'pending') {
        queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts('pending'), (old) => {
          const base = old ?? []
          return base.map((d) =>
            unseen.includes(d.id) ? { ...d, teacher_seen_at: seenAt } : d,
          )
        })
      }
    })
  }, [activeThread?.studentId, queryClient, teacherFilter])

  const clearComposer = () => {
    setReplyText('')
    setAudioBlob(null)
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
    setAttachedFile(null)
    setIsRecording(false)
    if (recordingStream) {
      recordingStream.getTracks().forEach((t) => t.stop())
      setRecordingStream(null)
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setRecordingStream(stream)
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioPreviewUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach((t) => t.stop())
        setRecordingStream(null)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
      setAttachedFile(null)
    } catch {
      toast.error('Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const discardAudio = () => {
    setAudioBlob(null)
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl)
    setAudioPreviewUrl(null)
  }

  const sendReply = async () => {
    if (sending) return
    if (!activeThread?.activeDoubtId) {
      toast.error('No chat history with this student yet')
      return
    }
    const text = replyText.trim()
    const hasAudio = !!audioBlob
    const hasFile = !!attachedFile
    if (!text && !hasAudio && !hasFile) {
      toast.error('Type a message, record audio, or attach a file')
      return
    }

    const doubtId = activeThread.activeDoubtId
    const studentId = activeThread.studentId
    const classId =
      activeThread.doubts.find((d) => d.id === doubtId)?.class_id ??
      activeThread.doubts[0]?.class_id ??
      classIds[0] ??
      ''

    let replyType: 'text' | 'audio' | 'file' = 'text'
    let fileName: string | undefined
    if (hasFile && attachedFile) {
      if (attachedFile.size > 8 * 1024 * 1024) {
        toast.error('File must be under 8 MB')
        return
      }
      replyType = 'file'
      fileName = attachedFile.name
    } else if (hasAudio && audioBlob) {
      if (audioBlob.size > 5 * 1024 * 1024) {
        toast.error('Audio must be under 5 MB')
        return
      }
      replyType = 'audio'
    }

    const preview = doubtPreviewLabel({ text, replyType, fileName })
    const clientId = newClientMessageId()
    const sentAt = new Date().toISOString()
    const previewAudioUrl = hasAudio && audioPreviewUrl ? audioPreviewUrl : null
    const blobForSend = audioBlob
    const fileForSend = attachedFile

    clearComposer()

    let entry: TeacherOutboxEntry = {
      kind: 'teacher_reply',
      clientId,
      threadKey: studentId,
      sentAt,
        doubt_id: doubtId,
        class_id: classId,
        student_id: studentId,
        user_id: userId ?? '',
        tenant_id: tenantId ?? '',
        preview,
        body: text || undefined,
        reply_type: replyType,
      audio_url: previewAudioUrl,
      file_url: null,
      file_name: fileName ?? null,
      attempts: 0,
    }
    appendOptimisticTeacherReply(queryClient, teacherFilter, {
      clientId,
      doubtId,
      body: text || preview,
      created_at: sentAt,
      reply_type: replyType,
      audio_url: previewAudioUrl,
      file_url: null,
      file_name: fileName ?? null,
    })
    upsertOutbox(entry)
    setOutboxTick((n) => n + 1)

    setSending(true)
    let audioUrl: string | undefined
    let fileUrl: string | undefined
    try {
      if (hasFile && fileForSend) {
        fileUrl = await fileToDataUrl(fileForSend)
      } else if (hasAudio && blobForSend) {
        audioUrl = await blobToDataUrl(blobForSend)
      }
      entry = { ...entry, audio_url: audioUrl ?? previewAudioUrl, file_url: fileUrl }
      upsertOutbox(entry)
      setOutboxTick((n) => n + 1)

      const sent = await deliverTeacherOutboxEntry({
        queryClient,
        filter: teacherFilter,
        entry,
        publish,
        liveEnabled: !!(liveEnabled && tenantId && classId),
      })
      if (sent) {
        markOutboxSynced(clientId)
        setOutboxTick((n) => n + 1)
        window.setTimeout(() => softRefetchTeacherDoubts(queryClient), 800)
      }
    } catch {
      upsertOutbox({ ...entry, failed: true })
      markFailed(studentId, clientId)
      setOutboxTick((n) => n + 1)
      toast.error(
        navigator.onLine
          ? 'Could not send — will retry when connection is stable'
          : 'Offline — message saved and will send when you are back online',
      )
    } finally {
      setSending(false)
    }
  }

  const shellHeight = variant === 'embedded' ? 'h-[420px]' : 'h-[calc(100vh-220px)] min-h-[520px]'

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm',
        shellHeight,
      )}
    >
      <div className="flex h-full min-h-0">
        {/* Contact list */}
        <div
          className={clsx(
            'flex shrink-0 flex-col border-r border-slate-200 bg-[#f0f2f5]',
            variant === 'embedded' ? 'w-[38%] min-w-[140px]' : 'w-full max-w-sm',
          )}
        >
          <div className="bg-[#f0f2f5] px-4 py-3">
            <p className="text-sm font-bold text-slate-800">Students</p>
            <p className="text-[11px] text-slate-500">Student chats</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-lg bg-white/70" />
                ))}
              </div>
            ) : displayThreads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <MessageCircle className="mb-2 h-8 w-8 text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">No student doubts</p>
              </div>
            ) : (
              displayThreads.map((thread) => {
                const selected = thread.studentId === activeThread?.studentId
                return (
                  <button
                    key={thread.studentId}
                    type="button"
                    onClick={() => setSelectedStudentId(thread.studentId)}
                    className={clsx(
                      'flex w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition-colors hover:bg-white/80',
                      selected && 'bg-white',
                    )}
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-[#dfe5e7] text-xs font-bold text-[#54656f]">
                        {thread.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {thread.studentName}
                        </span>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatListTime(thread.lastAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{thread.preview}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Chat pane */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#efeae2]">
          {activeThread ? (
            <>
              <div className="flex items-center gap-3 border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#dfe5e7] text-xs font-bold text-[#54656f]">
                    {activeThread.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {activeThread.studentName}
                  </p>
                  <p className="text-[11px] text-slate-500">Class doubts chat</p>
                </div>
                <button
                  type="button"
                  onClick={() => void clearChat()}
                  disabled={clearing || activeThread.messages.length === 0}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white/80 hover:text-rose-600 disabled:opacity-40"
                  title="Clear chat"
                >
                  {clearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
                style={{
                  backgroundImage:
                    'radial-gradient(#d9d0c6 0.6px, transparent 0.6px), radial-gradient(#d9d0c6 0.6px, transparent 0.6px)',
                  backgroundSize: '18px 18px',
                  backgroundPosition: '0 0, 9px 9px',
                }}
              >
                {activeThread.messages.map((msg) => (
                  <DoubtChatBubble
                    key={msg.id}
                    message={msg as DoubtChatMessage}
                    outgoingSide="teacher"
                    formatTime={formatChatTime}
                  />
                ))}
              </div>

              <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2">
                  {(audioPreviewUrl || attachedFile) && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {audioPreviewUrl && (
                        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                          <AudioWaveformPlayer src={audioPreviewUrl} height={36} className="flex-1" />
                          <button
                            type="button"
                            onClick={discardAudio}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      {attachedFile && (
                        <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">
                          <FileText className="h-4 w-4 shrink-0 text-[#128c7e]" />
                          <span className="max-w-[180px] truncate">{attachedFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setAttachedFile(null)}
                            className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isRecording && recordingStream && (
                    <div className="mb-2 rounded-lg bg-white px-3 py-2">
                      <LiveWaveform stream={recordingStream} height={32} barColor="#128c7e" />
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setAttachedFile(file)
                          discardAudio()
                        }
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-white/70"
                      title="Attach file"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>

                    <div className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-2 shadow-sm">
                      <textarea
                        rows={1}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void sendReply()
                          }
                        }}
                        disabled={!activeThread.activeDoubtId}
                        placeholder={
                          activeThread.activeDoubtId
                            ? 'Type a message'
                            : 'No messages in this chat yet'
                        }
                        className="max-h-24 w-full resize-none border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
                      />
                    </div>

                    {isRecording ? (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
                        title="Stop recording"
                      >
                        <Square className="h-4 w-4 fill-current" />
                      </button>
                    ) : replyText.trim() || audioBlob || attachedFile ? (
                      <button
                        type="button"
                        onClick={() => void sendReply()}
                        disabled={sending}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white hover:bg-[#0f7a6c] disabled:opacity-60"
                        title="Send"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startRecording()}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#54656f] hover:bg-white/70"
                        title="Record voice"
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <MessageCircle className="mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-semibold text-slate-600">Select a student to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function TeacherDoubtsChatSection({
  variant = 'embedded',
}: {
  variant?: 'embedded' | 'full'
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Students Doubts</h2>
          <p className="text-xs text-slate-500">Reply with a message, voice note, or file.</p>
        </div>
        {variant === 'embedded' && (
          <Link
            to="/teacher/doubts"
            className="text-xs font-semibold uppercase tracking-wider text-[#128c7e] hover:underline"
          >
            Open inbox →
          </Link>
        )}
      </div>
      <TeacherDoubtsChat variant={variant} statusFilter="all" />
    </section>
  )
}

export default TeacherDoubtsChatSection
