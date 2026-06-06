import { keepPreviousData } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Doubt } from '@/types'

/** Stale-while-revalidate: show cached chat, refresh quietly in background. */
export const DOUBTS_STALE_MS = 2 * 60_000
export const DOUBTS_GC_MS = 30 * 60_000
const CACHE_VERSION = 2

type DoubtsCacheEnvelope = {
  v: number
  at: number
  data: Doubt[]
}

type DoubtsCacheSlot = 'student' | 'teacher-all' | 'teacher-pending'

function cacheStorageKey(slot: DoubtsCacheSlot): string {
  return `eclassroom-doubts-v${CACHE_VERSION}:${slot}`
}

function readDoubtsCache(slot: DoubtsCacheSlot): Doubt[] | undefined {
  try {
    const raw = sessionStorage.getItem(cacheStorageKey(slot))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as DoubtsCacheEnvelope
    if (parsed?.v !== CACHE_VERSION || !Array.isArray(parsed.data)) return undefined
    return parsed.data
  } catch {
    return undefined
  }
}

function readDoubtsCacheUpdatedAt(slot: DoubtsCacheSlot): number | undefined {
  try {
    const raw = sessionStorage.getItem(cacheStorageKey(slot))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as DoubtsCacheEnvelope
    return typeof parsed?.at === 'number' ? parsed.at : undefined
  } catch {
    return undefined
  }
}

function writeDoubtsCache(slot: DoubtsCacheSlot, data: Doubt[]): void {
  try {
    const envelope: DoubtsCacheEnvelope = {
      v: CACHE_VERSION,
      at: Date.now(),
      data,
    }
    sessionStorage.setItem(cacheStorageKey(slot), JSON.stringify(envelope))
  } catch {
    /* quota / private mode */
  }
}

export function doubtsQueryOptions() {
  return {
    staleTime: DOUBTS_STALE_MS,
    gcTime: DOUBTS_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    placeholderData: keepPreviousData,
  }
}

export function studentDoubtsQueryOptions() {
  const slot: DoubtsCacheSlot = 'student'
  return {
    ...doubtsQueryOptions(),
    initialData: () => readDoubtsCache(slot),
    initialDataUpdatedAt: () => readDoubtsCacheUpdatedAt(slot),
  }
}

/** Teacher portal: live API only (no sessionStorage pre-hydration). */
export function teacherDoubtsQueryOptions(_filter: 'all' | 'pending' = 'all') {
  return {
    ...doubtsQueryOptions(),
    refetchOnMount: 'always' as const,
  }
}

/** Remove stale teacher doubt rows from sessionStorage (legacy cache). */
export function clearTeacherDoubtsSessionCache(): void {
  try {
    sessionStorage.removeItem(cacheStorageKey('teacher-all'))
    sessionStorage.removeItem(cacheStorageKey('teacher-pending'))
  } catch {
    /* private mode */
  }
}

const PENDING_DOUBT_PREFIX = 'pending-'
const PENDING_REPLY_PREFIX = 'pending-reply-'

/** Drop local pending rows once the server returns a matching real row. */
export function reconcilePendingDoubts(rows: Doubt[]): Doubt[] {
  const real = rows.filter((d) => !String(d.id).startsWith(PENDING_DOUBT_PREFIX))
  const pending = rows.filter((d) => String(d.id).startsWith(PENDING_DOUBT_PREFIX))
  const kept = pending.filter((p) => {
    const body = (p.body ?? '').trim()
    const created = new Date(p.created_at).getTime()
    const pSent = (p as Doubt & { client_sent_at?: string }).client_sent_at
    return !real.some((r) => {
      const rSent = (r as Doubt & { client_sent_at?: string }).client_sent_at
      if (pSent && rSent && pSent === rSent) return true
      return (
        r.class_id === p.class_id &&
        (Math.abs(new Date(r.created_at).getTime() - created) < 2 * 60_000 ||
          ((r.body ?? '').trim() === body && body.length > 0))
      )
    })
  })
  return [...real, ...kept]
}

function doubtResponsesList(d: Doubt): NonNullable<Doubt['responses']> {
  return (
    d.responses ??
    (d as Doubt & { doubt_responses?: Doubt['responses'] }).doubt_responses ??
    []
  )
}

/** Keep optimistic rows across API refetch until the server returns persisted data. */
export function mergeStudentDoubtsOnFetch(
  previous: Doubt[] | undefined,
  fresh: Doubt[],
): Doubt[] {
  if (!previous?.length) return fresh
  const pendingRows = previous.filter((d) =>
    String(d.id).startsWith(PENDING_DOUBT_PREFIX),
  )
  if (!pendingRows.length) return fresh
  return reconcilePendingDoubts([...fresh, ...pendingRows])
}

export function mergeTeacherDoubtsOnFetch(
  previous: Doubt[] | undefined,
  fresh: Doubt[],
): Doubt[] {
  if (!previous?.length) return fresh

  const byId = new Map(fresh.map((d) => [String(d.id), { ...d }]))

  for (const old of previous) {
    const pendingReplies = doubtResponsesList(old).filter((r) =>
      String(r.id).startsWith(PENDING_REPLY_PREFIX),
    )
    if (!pendingReplies.length) continue

    const target = byId.get(String(old.id))
    if (!target) continue

    const existing = doubtResponsesList(target)
    const mergedResponses = [...existing]
    for (const pr of pendingReplies) {
      if (!mergedResponses.some((r) => r.id === pr.id)) {
        mergedResponses.push(pr)
      }
    }
    byId.set(String(old.id), {
      ...target,
      responses: mergedResponses,
    } as Doubt)
  }

  return reconcilePendingTeacherDoubts([...byId.values()])
}

export function dropPendingStudentDoubt(queryClient: QueryClient, clientId: string): void {
  const pendingId = `${PENDING_DOUBT_PREFIX}${clientId}`
  queryClient.setQueryData<Doubt[]>(queryKeys.student.doubts(), (old) => {
    const base = old ?? readDoubtsCache('student') ?? []
    const next = base.filter((d) => d.id !== pendingId)
    writeDoubtsCache('student', next)
    return next
  })
}

export function clearStudentClassChatCache(queryClient: QueryClient, classId: string): void {
  queryClient.setQueryData<Doubt[]>(queryKeys.student.doubts(), (old) => {
    const base = old ?? readDoubtsCache('student') ?? []
    const next = base.filter((d) => d.class_id !== classId)
    writeDoubtsCache('student', next)
    return next
  })
}

export function clearTeacherStudentChatCache(
  queryClient: QueryClient,
  studentId: string,
): void {
  const strip = (list: Doubt[]) =>
    list.filter((d) => {
      const sid =
        (d as Doubt & { student_id?: string }).student_id ??
        (d as Doubt & { students?: { id?: string } }).students?.id
      return String(sid) !== studentId
    })

  for (const filter of ['all', 'pending'] as const) {
    queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts(filter), (old) => {
      const base = old ?? []
      return strip(base)
    })
  }
}

export async function clearStudentClassChat(classId: string): Promise<number> {
  const res = await api.delete(`/student/classes/${classId}/doubts/chat`)
  return (res.data?.data?.archived as number) ?? (res.data?.data?.deleted as number) ?? 0
}

export async function clearTeacherStudentChat(studentId: string): Promise<number> {
  const res = await api.delete(`/teacher/doubts/students/${studentId}/chat`)
  return (res.data?.data?.archived as number) ?? (res.data?.data?.deleted as number) ?? 0
}

export function reconcilePendingTeacherDoubts(rows: Doubt[]): Doubt[] {
  return rows.map((d) => {
    const responses = d.responses ?? (d as Doubt & { doubt_responses?: Doubt['responses'] }).doubt_responses ?? []
    const real = responses.filter((r) => !String(r.id).startsWith(PENDING_REPLY_PREFIX))
    const pending = responses.filter((r) => String(r.id).startsWith(PENDING_REPLY_PREFIX))
    const kept = pending.filter((p) => {
      const body = (p.body ?? '').trim()
      const created = new Date(p.created_at).getTime()
      const pSent = (p as { client_sent_at?: string }).client_sent_at
      return !real.some((r) => {
        const rSent = (r as { client_sent_at?: string }).client_sent_at
        if (pSent && rSent && pSent === rSent) return true
        return (
          (r.body ?? '').trim() === body &&
          Math.abs(new Date(r.created_at).getTime() - created) < 3 * 60_000
        )
      })
    })
    const merged = [...real, ...kept]
    return { ...d, responses: merged, doubt_responses: merged }
  })
}

export type OptimisticStudentDoubtInput = {
  clientId: string
  class_id: string
  body: string | null
  created_at: string
  reply_type?: 'text' | 'audio' | 'file'
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
}

/** Show sent message immediately in chat + sessionStorage (before API finishes). */
export function appendOptimisticStudentDoubt(
  queryClient: QueryClient,
  input: OptimisticStudentDoubtInput,
): void {
  const row = {
    id: `${PENDING_DOUBT_PREFIX}${input.clientId}`,
    title: '',
    body: input.body ?? '',
    status: 'pending' as const,
    class_id: input.class_id,
    created_at: input.created_at,
    client_sent_at: input.created_at,
    reply_type: input.reply_type,
    audio_url: input.audio_url,
    file_url: input.file_url,
    file_name: input.file_name,
  } as Doubt & { client_sent_at: string }
  queryClient.setQueryData<Doubt[]>(queryKeys.student.doubts(), (old) => {
    const base = old ?? readDoubtsCache('student') ?? []
    if (base.some((d) => d.id === row.id)) return base
    const next = [...base, row as Doubt]
    writeDoubtsCache('student', next)
    return next
  })
}

export type OptimisticTeacherReplyInput = {
  clientId: string
  doubtId: string
  body: string | null
  created_at: string
  reply_type?: 'text' | 'audio' | 'file'
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
}

/** Instant incoming teacher reply on student chat (Supabase broadcast). */
export function appendBroadcastTeacherReply(
  queryClient: QueryClient,
  payload: {
    clientId: string
    classId: string
    doubtId?: string
    text: string
    createdAt: string
    replyType?: 'text' | 'audio' | 'file'
    audioUrl?: string | null
    fileUrl?: string | null
    fileName?: string | null
  },
): void {
  const reply = {
    id: `${PENDING_REPLY_PREFIX}${payload.clientId}`,
    body: payload.text,
    created_at: payload.createdAt,
    client_sent_at: payload.createdAt,
    reply_type: payload.replyType ?? 'text',
    audio_url: payload.audioUrl,
    file_url: payload.fileUrl,
    file_name: payload.fileName,
  }

  const patchList = (list: Doubt[]) => {
    let targetId = payload.doubtId
    if (!targetId) {
      const inClass = list.filter((d) => d.class_id === payload.classId)
      const latest = [...inClass].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )[0]
      targetId = latest?.id
    }
    if (!targetId) return list

    return list.map((d) => {
      if (d.id !== targetId) return d
      const responses = doubtResponsesList(d)
      if (responses.some((r) => r.id === reply.id)) return d
      const merged = [...responses, reply]
      return { ...d, responses: merged, doubt_responses: merged }
    })
  }

  queryClient.setQueryData<Doubt[]>(queryKeys.student.doubts(), (old) => {
    const base = old ?? readDoubtsCache('student') ?? []
    const next = patchList(base)
    writeDoubtsCache('student', next)
    return next
  })
}

/** Instant incoming student message on teacher chat (Supabase broadcast). */
export function appendBroadcastStudentDoubt(
  queryClient: QueryClient,
  filter: 'all' | 'pending',
  payload: {
    clientId: string
    classId: string
    studentId: string
    text: string
    createdAt: string
    replyType?: 'text' | 'audio' | 'file'
    audioUrl?: string | null
    fileUrl?: string | null
    fileName?: string | null
  },
): void {
  const pendingId = `${PENDING_DOUBT_PREFIX}${payload.clientId}`
  const patch = (old: Doubt[] | undefined) => {
    const base = old ?? []
    if (base.some((d) => d.id === pendingId)) return base
    const prior = base.find(
      (d) =>
        String((d as Doubt & { student_id?: string }).student_id) === payload.studentId ||
        String(d.students?.id) === payload.studentId,
    )
    const studentName = prior?.students?.name ?? 'Student'
    const row = {
      id: pendingId,
      title: '',
      body: payload.text,
      status: 'pending' as const,
      class_id: payload.classId,
      student_id: payload.studentId,
      created_at: payload.createdAt,
      client_sent_at: payload.createdAt,
      reply_type: payload.replyType ?? 'text',
      audio_url: payload.audioUrl,
      file_url: payload.fileUrl,
      file_name: payload.fileName,
      students: { id: payload.studentId, name: studentName },
    } as Doubt & { client_sent_at: string; student_id: string }
    return [...base, row as Doubt]
  }

  queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts(filter), patch)
  if (filter !== 'all') {
    queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts('all'), patch)
  }
}

export function appendOptimisticTeacherReply(
  queryClient: QueryClient,
  filter: 'all' | 'pending',
  input: OptimisticTeacherReplyInput,
): void {
  const reply = {
    id: `${PENDING_REPLY_PREFIX}${input.clientId}`,
    body: input.body,
    created_at: input.created_at,
    client_sent_at: input.created_at,
    reply_type: input.reply_type ?? 'text',
    audio_url: input.audio_url,
    file_url: input.file_url,
    file_name: input.file_name,
  }
  const patchList = (list: Doubt[]) =>
    list.map((d) => {
      if (d.id !== input.doubtId) return d
      const responses = d.responses ?? (d as Doubt & { doubt_responses?: Doubt['responses'] }).doubt_responses ?? []
      if (responses.some((r) => r.id === reply.id)) return d
      const merged = [...responses, reply]
      return { ...d, responses: merged, doubt_responses: merged }
    })

  const patch = (old: Doubt[] | undefined) => {
    const base = old ?? []
    return patchList(base)
  }
  queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts(filter), patch)
  if (filter !== 'all') {
    queryClient.setQueryData<Doubt[]>(queryKeys.teacher.doubts('all'), patch)
  }
}

export async function fetchStudentDoubts(previous?: Doubt[]): Promise<Doubt[]> {
  const res = await api.get('/student/doubts')
  const merged = mergeStudentDoubtsOnFetch(previous, (res.data?.data ?? []) as Doubt[])
  const data = reconcilePendingDoubts(merged)
  writeDoubtsCache('student', data)
  return data
}

export async function fetchTeacherDoubts(
  filter: 'all' | 'pending' = 'all',
  previous?: Doubt[],
): Promise<Doubt[]> {
  const url =
    filter === 'pending' ? '/teacher/doubts?status=pending' : '/teacher/doubts'
  const res = await api.get(url)
  return reconcilePendingTeacherDoubts(
    mergeTeacherDoubtsOnFetch(previous, (res.data?.data ?? []) as Doubt[]),
  )
}

export function softRefetchStudentDoubts(queryClient: QueryClient) {
  void queryClient.refetchQueries({
    queryKey: queryKeys.student.doubts(),
    type: 'active',
  })
}

export function softRefetchTeacherDoubts(queryClient: QueryClient) {
  void queryClient.refetchQueries({
    queryKey: ['teacher', 'doubts'],
    type: 'active',
  })
}

/** True only when there is nothing to show yet (no memory or session cache). */
export function isDoubtsInitialLoad(
  isPending: boolean,
  data: Doubt[] | undefined,
): boolean {
  return isPending && !(data && data.length > 0)
}
