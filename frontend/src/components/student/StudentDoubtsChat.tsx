import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import {
  appendBroadcastTeacherReply,
  appendOptimisticStudentDoubt,
  fetchStudentDoubts,
  isDoubtsInitialLoad,
  clearStudentClassChat,
  clearStudentClassChatCache,
  softRefetchStudentDoubts,
  studentDoubtsQueryOptions,
} from '@/lib/doubtsQueries'
import { subscribeToStudentDoubts } from '@/lib/realtime'
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
  type StudentOutboxEntry,
} from '@/lib/doubtOutbox'
import { deliverStudentOutboxEntry } from '@/lib/doubtChatSend'
import { useDoubtOutboxFlush, outboxEntriesToMessages } from '@/hooks/useDoubtOutboxFlush'
import type { Doubt, DoubtResponse, EnrolledClass } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DoubtChatBubble } from '@/components/doubts/DoubtChatBubble'
import { LiveWaveform } from '@/components/ui/live-waveform'
import { AudioWaveformPlayer } from '@/components/ui/audio-waveform-player'
import {
  blobToDataUrl,
  doubtPreviewLabel,
  fileToDataUrl,
  scrollChatPaneToBottom,
} from '@/lib/doubtChatUtils'

type ApiDoubt = Doubt & {
  doubt_responses?: DoubtResponse[]
}

type ChatMessage = {
  id: string
  side: 'student' | 'teacher'
  createdAt: string
  doubtId?: string
  title?: string
  teacherSeen?: boolean
  text?: string | null
  teacherName?: string
  replyType?: 'text' | 'audio' | 'file'
  audioUrl?: string | null
  fileUrl?: string | null
  fileName?: string | null
}

type ClassThread = {
  classId: string
  className: string
  initials: string
  pendingCount: number
  lastAt: string
  preview: string
  doubts: ApiDoubt[]
  messages: ChatMessage[]
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

function formatListTime(dateStr: string, yesterdayLabel: string): string {
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
    return yesterdayLabel
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function previewForMessage(msg: ChatMessage, t: (key: string) => string): string {
  if (msg.text?.trim()) return msg.text.trim()
  if (msg.replyType === 'audio' || msg.audioUrl) return t('chat.voiceMessage')
  if (msg.replyType === 'file' || msg.fileUrl) return `📎 ${msg.fileName || t('chat.file')}`
  return t('chat.newMessage')
}

function buildMessages(doubts: ApiDoubt[]): ChatMessage[] {
  return buildChatMessagesFromDoubts(doubts, 'student') as ChatMessage[]
}

function buildClassThreads(doubts: ApiDoubt[], classes: EnrolledClass[], t: (key: string) => string): ClassThread[] {
  const byClass = new Map<string, ApiDoubt[]>()
  for (const doubt of doubts) {
    const key = doubt.class_id || 'general'
    const list = byClass.get(key) ?? []
    list.push(doubt)
    byClass.set(key, list)
  }

  const classMeta = new Map(classes.map((c) => [c.id, c]))
  const threadClassIds = new Set<string>([...classes.map((c) => c.id), ...byClass.keys()])

  const threads: ClassThread[] = []
  for (const classId of threadClassIds) {
    const classDoubts = byClass.get(classId) ?? []
    const meta = classMeta.get(classId)
    const className = meta?.name ?? classDoubts[0]?.class_name ?? t('chat.general')
    const messages = buildMessages(classDoubts)
    const last = messages[messages.length - 1]
    const pendingCount = classDoubts.filter((d) => d.status === 'pending').length

    threads.push({
      classId,
      className,
      initials: initialsFor(className),
      pendingCount,
      lastAt: last?.createdAt ?? classDoubts[0]?.created_at ?? '',
      preview: last ? previewForMessage(last, t) : `${t('chat.noMessagesYet')} — ${t('chat.askFirstQuestion')}`,
      doubts: classDoubts,
      messages,
    })
  }

  return threads.sort((a, b) => {
    if (a.lastAt && b.lastAt) return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    if (a.lastAt) return -1
    if (b.lastAt) return 1
    return a.className.localeCompare(b.className)
  })
}

type StudentDoubtsChatProps = {
  variant?: 'embedded' | 'full'
  statusFilter?: 'pending' | 'all'
}

export function StudentDoubtsChat({
  variant = 'embedded',
}: StudentDoubtsChatProps) {
  const { t } = useTranslation()
  const studentId = useAuthStore((s) => s.user?.student_id)
  const userId = useAuthStore((s) => s.user?.id)
  const tenantId = useAuthStore((s) => s.user?.tenant_id)
  const queryClient = useQueryClient()
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [messageText, setMessageText] = useState('')
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

  const { data: classes = [], isPending: classesPending } = useQuery({
    queryKey: queryKeys.student.classesMy(),
    queryFn: async () =>
      ((await api.get('/student/classes/my')).data?.data ?? []) as EnrolledClass[],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: doubtsRaw = [],
    isPending: doubtsPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.student.doubts(),
    queryFn: () =>
      fetchStudentDoubts(
        queryClient.getQueryData<Doubt[]>(queryKeys.student.doubts()),
      ),
    ...studentDoubtsQueryOptions(),
  })

  const loading =
    (classesPending && classes.length === 0) ||
    isDoubtsInitialLoad(doubtsPending, doubtsRaw)

  const scheduleRefresh = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    refetchTimerRef.current = window.setTimeout(() => {
      refetchTimerRef.current = null
      softRefetchStudentDoubts(queryClient)
    }, 600)
  }, [queryClient])

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!studentId) return
    return subscribeToStudentDoubts(studentId, {
      suppressToasts: true,
      onRefresh: scheduleRefresh,
    })
  }, [studentId, scheduleRefresh])

  const classIds = useMemo(() => classes.map((c) => c.id).filter(Boolean), [classes])
  const {
    ephemeralByThread,
    publish,
    newClientMessageId,
    markFailed,
    clearEphemeralThread,
    liveEnabled,
    mergeChatMessages: mergeMsgs,
    pruneEphemeralAgainstServer: pruneEphemeral,
  } = useDoubtChatLive(tenantId ?? undefined, classIds, 'classId', {
    recipientStudentId: studentId ?? undefined,
    currentUserId: userId,
    viewerRole: 'student',
    onLiveMessage: (payload, { isOwn }) => {
      if (payload.kind === 'teacher_reply') {
        appendBroadcastTeacherReply(queryClient, {
          clientId: payload.clientId,
          classId: payload.classId,
          doubtId: payload.doubtId,
          text: payload.text,
          createdAt: payload.createdAt,
          replyType: payload.replyType,
          audioUrl: payload.audioUrl,
          fileUrl: payload.fileUrl,
          fileName: payload.fileName,
        })
      } else if (isOwn && payload.kind === 'student_doubt') {
        markOutboxSynced(payload.clientId)
        setOutboxTick((n) => n + 1)
      }
    },
  })

  useDoubtOutboxFlush({
    role: 'student',
    enabled: !!studentId && !!userId && !sending,
    studentDeps: {
      queryClient,
      publish,
      liveEnabled: !!(liveEnabled && tenantId),
    },
    onDelivered: (clientId) => {
      markOutboxSynced(clientId)
      setOutboxTick((n) => n + 1)
    },
    onFailed: () => setOutboxTick((n) => n + 1),
  })

  const baseThreads = useMemo(
    () => (loading ? [] : buildClassThreads(doubtsRaw, classes, t)),
    [doubtsRaw, classes, loading, t],
  )

  const sentAtMap = useMemo(() => sentAtByClientId(), [outboxTick])

  const threads = useMemo(() => {
    return baseThreads.map((th) => {
      const serverMsgs = th.messages as DoubtChatMessage[]
      const hasClient = (clientId: string) =>
        serverHasClientMessage(serverMsgs, clientId)
      const ephemeral = ephemeralByThread[th.classId] ?? []
      const threadOutbox = listVisibleOutbox('student_doubt', hasClient).filter(
        (e) => e.threadKey === th.classId,
      )
      const statusOverlay = outboxEntriesToMessages(threadOutbox, 'student')
      const prunedEphemeral = pruneEphemeral(ephemeral, serverMsgs)
      const merged = mergeMsgs(serverMsgs, prunedEphemeral)
      const messages = sortChatMessagesByTime(
        applyMessageTimestamps(
          applyDeliveryOverlay(merged, statusOverlay),
          'student',
          sentAtMap,
        ),
        'student',
      )
      const last = messages[messages.length - 1]
      return {
        ...th,
        messages,
        lastAt: last?.sentAt ?? last?.receivedAt ?? last?.createdAt ?? th.lastAt,
        preview: last ? previewForMessage(last, t) : th.preview,
      }
    })
  }, [baseThreads, ephemeralByThread, mergeMsgs, pruneEphemeral, outboxTick, sentAtMap, t])
  const displayThreads = threads

  const activeThread =
    displayThreads.find((t) => t.classId === selectedClassId) ?? displayThreads[0] ?? null

  useEffect(() => {
    if (loading) return
    if (displayThreads.length && !selectedClassId) {
      setSelectedClassId(displayThreads[0].classId)
    }
  }, [displayThreads, selectedClassId, loading])

  useEffect(() => {
    if (isError) toast.error(t('chat.couldNotLoad'))
  }, [isError, t])

  // Combined: scroll-to-bottom + outbox-prune both depend on the
  // active thread. Previously split into two effects that each
  // re-ran on any message change, doubling the work per update.
  const activeThreadId = activeThread?.classId ?? null
  const activeMessageCount = activeThread?.messages.length ?? 0

  useEffect(() => {
    if (activeThreadId == null) return
    const behavior: ScrollBehavior =
      lastScrollThreadRef.current === activeThreadId ? 'smooth' : 'auto'
    lastScrollThreadRef.current = activeThreadId
    scrollChatPaneToBottom(messagesScrollRef.current, behavior)

    if (activeMessageCount > 0 && activeThread) {
      if (
        pruneDeliveredOutbox((clientId) =>
          serverHasClientMessage(activeThread.messages as DoubtChatMessage[], clientId),
        )
      ) {
        setOutboxTick((n) => n + 1)
      }
    }
    // activeMessageCount is sufficient as a proxy for the messages
    // array reference; the actual messages are read via activeThread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, activeMessageCount])

  const refresh = () => {
    softRefetchStudentDoubts(queryClient)
  }

  const clearChat = async () => {
    if (!activeThread?.classId || clearing) return
    const ok = window.confirm(
      t('chat.clearConfirm', { class: activeThread.className }),
    )
    if (!ok) return
    setClearing(true)
    try {
      await clearStudentClassChat(activeThread.classId)
      clearStudentClassChatCache(queryClient, activeThread.classId)
      clearEphemeralThread(activeThread.classId)
      refresh()
      toast.success(t('chat.chatCleared'))
    } catch {
      toast.error(t('chat.clearFailed'))
    } finally {
      setClearing(false)
    }
  }

  const clearComposer = () => {
    setMessageText('')
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
      toast.error(t('chat.micDenied'))
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

  const sendDoubt = async () => {
    if (sending) return
    if (!activeThread?.classId || !studentId || !userId) {
      toast.error(t('chat.selectClassFirst'))
      return
    }
    const text = messageText.trim()
    const hasAudio = !!audioBlob
    const hasFile = !!attachedFile
    if (!text && !hasAudio && !hasFile) {
      toast.error(t('chat.emptyMessage'))
      return
    }

    const classId = activeThread.classId
    let replyType: 'text' | 'audio' | 'file' = 'text'
    let fileName: string | undefined
    if (hasFile && attachedFile) {
      if (attachedFile.size > 8 * 1024 * 1024) {
        toast.error(t('chat.fileTooLarge'))
        return
      }
      replyType = 'file'
      fileName = attachedFile.name
    } else if (hasAudio && audioBlob) {
      if (audioBlob.size > 5 * 1024 * 1024) {
        toast.error(t('chat.audioTooLarge'))
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

    let entry: StudentOutboxEntry = {
      kind: 'student_doubt',
      clientId,
      threadKey: classId,
      sentAt,
      class_id: classId,
      student_id: studentId,
      user_id: userId,
      tenant_id: tenantId ?? '',
      preview,
      body: text || undefined,
      reply_type: replyType,
      audio_url: previewAudioUrl,
      file_url: null,
      file_name: fileName ?? null,
      attempts: 0,
    }
    appendOptimisticStudentDoubt(queryClient, {
      clientId,
      class_id: classId,
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
      entry = {
        ...entry,
        audio_url: audioUrl ?? previewAudioUrl,
        file_url: fileUrl,
      }
      upsertOutbox(entry)
      setOutboxTick((n) => n + 1)

      const sent = await deliverStudentOutboxEntry({
        queryClient,
        entry,
        publish,
        liveEnabled: !!(liveEnabled && tenantId),
      })
      if (sent) {
        markOutboxSynced(clientId)
        setOutboxTick((n) => n + 1)
        window.setTimeout(() => softRefetchStudentDoubts(queryClient), 800)
      }
    } catch {
      upsertOutbox({ ...entry, failed: true })
      markFailed(classId, clientId)
      setOutboxTick((n) => n + 1)
      toast.error(
        navigator.onLine
          ? t('chat.sendFailed')
          : t('chat.offlineSaved'),
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
        {/* Class list */}
        <div
          className={clsx(
            'flex shrink-0 flex-col border-r border-slate-200 bg-[#f0f2f5]',
            variant === 'embedded' ? 'w-[38%] min-w-[140px]' : 'w-full max-w-sm',
          )}
        >
          <div className="bg-[#f0f2f5] px-4 py-3">
            <p className="text-sm font-bold text-slate-800">{t('chat.myClasses')}</p>
            <p className="text-[11px] text-slate-500">{t('chat.chatWithTeachers')}</p>
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
                <p className="text-xs font-semibold text-slate-600">{t('chat.noClasses')}</p>
                <p className="mt-1 text-[11px] text-slate-400">{t('chat.enrollToAsk')}</p>
              </div>
            ) : (
              displayThreads.map((thread) => {
                const selected = thread.classId === activeThread?.classId
                return (
                  <button
                    key={thread.classId}
                    type="button"
                    onClick={() => setSelectedClassId(thread.classId)}
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
                          {thread.className}
                        </span>
                        {thread.lastAt && (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {formatListTime(thread.lastAt, t('chat.yesterday'))}
                          </span>
                        )}
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
          {loading ? (
            <DoubtsChatPaneSkeleton />
          ) : activeThread ? (
            <>
              <div className="flex items-center gap-3 border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#dfe5e7] text-xs font-bold text-[#54656f]">
                    {activeThread.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {activeThread.className}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {activeThread.messages.length > 0
                      ? t('chat.chatWithTeacher')
                      : t('chat.askAnything')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void clearChat()}
                  disabled={clearing || activeThread.messages.length === 0}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white/80 hover:text-rose-600 disabled:opacity-40"
                  title={t('chat.clearChat')}
                >
                  {clearing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">{t('common.clear')}</span>
                </button>
              </div>

              <div
                ref={messagesScrollRef}
                className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2"
                style={chatWallpaperStyle}
              >
                {activeThread.messages.length === 0 ? (
                  <div className="flex h-full min-h-[120px] flex-col items-center justify-center text-center">
                    <MessageCircle className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">{t('chat.noMessagesChat')}</p>
                    <p className="mt-1 max-w-[200px] text-[11px] text-slate-400">
                      {t('chat.typeBelow')}
                    </p>
                  </div>
                ) : (
                  activeThread.messages.map((msg) => (
                    <DoubtChatBubble
                      key={msg.id}
                      message={msg as DoubtChatMessage}
                      outgoingSide="student"
                      formatTime={formatChatTime}
                    />
                  ))
                )}
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
                    title={t('chat.attachFile')}
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>

                  <div className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-2 shadow-sm">
                    <textarea
                      rows={1}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void sendDoubt()
                        }
                      }}
                      placeholder={t('chat.askPlaceholder')}
                      className="max-h-24 w-full resize-none border-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />
                  </div>

                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
                      title={t('chat.stopRecording')}
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  ) : messageText.trim() || audioBlob || attachedFile ? (
                    <button
                      type="button"
                      onClick={() => void sendDoubt()}
                      disabled={sending}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#128c7e] text-white hover:bg-[#0f7a6c] disabled:opacity-60"
                      title={t('chat.sendBtn')}
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
                      title={t('chat.recordVoice')}
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
              <p className="text-sm font-semibold text-slate-600">{t('chat.selectClass')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const chatWallpaperStyle = {
  backgroundImage:
    'radial-gradient(#d9d0c6 0.6px, transparent 0.6px), radial-gradient(#d9d0c6 0.6px, transparent 0.6px)',
  backgroundSize: '18px 18px',
  backgroundPosition: '0 0, 9px 9px',
} as const

/** Matches teacher doubts chat — no partial class list / empty previews while loading. */
function DoubtsChatPaneSkeleton() {
  return (
    <>
      <div className="flex items-center gap-3 border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200" />
          <div className="h-2.5 w-40 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-3 py-4" style={chatWallpaperStyle}>
        <div className="flex justify-start">
          <div className="h-14 w-[72%] max-w-xs animate-pulse rounded-lg bg-white/80" />
        </div>
        <div className="flex justify-end">
          <div className="h-10 w-[58%] max-w-[240px] animate-pulse rounded-lg bg-white/80" />
        </div>
        <div className="flex justify-start">
          <div className="h-11 w-[64%] max-w-xs animate-pulse rounded-lg bg-white/80" />
        </div>
      </div>
      <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2">
        <div className="flex items-end gap-2">
          <div className="h-10 min-w-0 flex-1 animate-pulse rounded-2xl bg-white/80" />
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-200" />
        </div>
      </div>
    </>
  )
}

export function StudentDoubtsChatSection({
  variant = 'embedded',
}: {
  variant?: 'embedded' | 'full'
}) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('chat.askTeacher')}</h2>
          <p className="text-xs text-slate-500">
            {t('chat.messageTeacher')}
          </p>
        </div>
        {variant === 'embedded' && (
          <Link
            to="/student/doubts"
            className="text-xs font-semibold uppercase tracking-wider text-[#128c7e] hover:underline"
          >
            {t('chat.openInbox')}
          </Link>
        )}
      </div>
      <StudentDoubtsChat variant={variant} statusFilter="all" />
    </section>
  )
}

export default StudentDoubtsChatSection
