import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Loader2, ArrowRight,
  MessageCircle, CheckCircle2, Upload, Mic, Square, Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import type { Task } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LiveWaveform } from '@/components/ui/live-waveform'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { competitionListQueryOptions } from '@/lib/competitionQueries'
import { softRefetchStudyPlan, studentTasksTodayQueryOptions } from '@/lib/studyPlanQueries'
import { useStudentCompetitionRealtime } from '@/hooks/useCompetitionRealtime'
import { competitionApi } from '@/services/competitionApi'
import { requiresAudioOnToggle } from '@/lib/studentStudyPlanTasks'
import { fetchStudentUpcomingMeetings } from '@/services/meetApi'
import { pickNextMeeting } from '@/lib/studentMeetings'
import { StudentUpcomingMeetHero } from '@/components/student/StudentUpcomingMeetHero'
import { subscribeToClassMeetings, subscribeToStudyPlan } from '@/lib/realtime'

async function fetchTodayTasks(): Promise<Task[]> {
  try {
    const res = await api.get('/student/tasks/today')
    return res.data.data
  } catch {
    return []
  }
}

type StudentClassItem = { id: string; name?: string }

async function fetchMyClasses(): Promise<StudentClassItem[]> {
  try {
    const res = await api.get('/student/classes/my')
    return Array.isArray(res.data?.data) ? res.data.data : []
  } catch {
    return []
  }
}

function displayPeriodTitle(raw?: string): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized.includes('flat_schedule')) return null
  if (normalized.includes('flat schedule')) return null
  return value
}

export default function StudentDashboard() {
  useStudentCompetitionRealtime()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [audioTaskId, setAudioTaskId] = useState<string | null>(null)
  const [recordingTaskId, setRecordingTaskId] = useState<string | null>(null)
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null)
  const [audioDataUrls, setAudioDataUrls] = useState<Record<string, { name: string; dataUrl: string }>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])

  const {
    data: tasks = [],
    isLoading: loadingTasks,
    isFetching: tasksFetching,
  } = useQuery({
    queryKey: queryKeys.student.tasksToday(),
    queryFn: fetchTodayTasks,
    ...studentTasksTodayQueryOptions(),
  })

  const { data: doubtsRaw = [] } = useQuery({
    queryKey: queryKeys.student.doubts(),
    queryFn: async () => (await api.get('/student/doubts')).data?.data ?? [],
    staleTime: 30_000,
  })

  const pendingDoubts = useMemo(
    () => (doubtsRaw as any[]).filter((x) => x.status === 'pending').length,
    [doubtsRaw]
  )

  const { data: competitions = [] } = useQuery({
    queryKey: queryKeys.competitions.studentRegistrations(),
    queryFn: async () => {
      const r = await competitionApi.getStudentCompetitions()
      return r.success ? r.data : []
    },
    ...competitionListQueryOptions(),
  })

  const { data: myClasses = [] } = useQuery({
    queryKey: queryKeys.student.classesMy(),
    queryFn: fetchMyClasses,
    staleTime: 60_000,
  })

  const { data: upcomingMeetings = [] } = useQuery({
    queryKey: queryKeys.student.upcomingMeetings(),
    queryFn: fetchStudentUpcomingMeetings,
    staleTime: 30_000,
    retry: false,
  })

  const nextMeeting = useMemo(() => pickNextMeeting(upcomingMeetings), [upcomingMeetings])

  useEffect(() => {
    if (!myClasses.length) return
    const unsubs = myClasses.map((c) =>
      subscribeToClassMeetings(c.id, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.student.upcomingMeetings() })
      }),
    )
    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [myClasses, queryClient])

  const studentUserId = useAuthStore((s) => s.user?.id)
  const tenantId = useAuthStore((s) => s.user?.tenant_id ?? undefined)

  useEffect(() => {
    const firstClassId = myClasses[0]?.id
    if (!firstClassId || !studentUserId) return
    return subscribeToStudyPlan(firstClassId, studentUserId, 'student', { tenantId })
  }, [myClasses, studentUserId, tenantId])

  useEffect(() => {
    if (!myClasses.length) return
    const firstClassId = myClasses[0]?.id
    if (!firstClassId) return
    void queryClient.prefetchQuery({
      queryKey: ['student', 'classes', firstClassId, 'study-plan'],
      queryFn: async () => (await api.get(`/student/classes/${firstClassId}/study-plan`)).data?.data ?? null,
      staleTime: 60_000,
    })
    void queryClient.prefetchQuery({
      queryKey: ['student', 'classes', firstClassId, 'study-plan-source'],
      queryFn: async () =>
        (await api.get(`/student/classes/${firstClassId}/study-plan-source`).catch(() => ({ data: { data: null } })))
          .data?.data ?? null,
      staleTime: 60_000,
    })
  }, [myClasses, queryClient])

  const planName = tasks[0]?.plan_name || 'Study plan'
  const todayHeading = useMemo(() => {
    const raw = tasks[0]?.scheduled_date
    if (!raw) return null
    const parsed = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }, [tasks])

  const firstName = user?.name?.split(' ')[0] || 'Learner'

  const handleAudioPick = async (taskId: string, file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read audio file'))
      reader.readAsDataURL(file)
    })
    setAudioDataUrls((prev) => ({ ...prev, [taskId]: { name: file.name, dataUrl } }))
  }

  const stopRecorderStream = () => {
    if (recorderStreamRef.current) {
      recorderStreamRef.current.getTracks().forEach((t) => t.stop())
      recorderStreamRef.current = null
    }
    setRecordingStream(null)
  }

  const startRecording = async (taskId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderStreamRef.current = stream
      setRecordingStream(stream)
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderChunksRef.current = []
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) recorderChunksRef.current.push(evt.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(recorderChunksRef.current, { type: 'audio/webm' })
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('Could not read recording'))
          reader.readAsDataURL(blob)
        })
        setAudioDataUrls((prev) => ({ ...prev, [taskId]: { name: 'Recorded audio.webm', dataUrl } }))
        stopRecorderStream()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingTaskId(taskId)
    } catch {
      toast.error('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return
    mediaRecorderRef.current.stop()
    setRecordingTaskId(null)
  }

  const refreshTodayTasks = () => {
    softRefetchStudyPlan(queryClient, queryKeys.student.tasksToday())
  }

  const patchTodayTask = (taskId: string, completed: boolean) => {
    queryClient.setQueryData(
      queryKeys.student.tasksToday(),
      (old: Task[] | undefined) =>
        old?.map((t) => (t.id === taskId ? { ...t, completed } : t)),
    )
  }

  const handleToggleTask = async (task: Task, withAudio = false) => {
    setBusyTaskId(task.id)
    const previousCompleted = task.completed
    const nextCompleted = !previousCompleted
    if (!withAudio) {
      patchTodayTask(task.id, nextCompleted)
    }
    try {
      if (!task.completed && withAudio) {
        const audio = audioDataUrls[task.id]?.dataUrl
        if (!audio) {
          toast.error('Please upload audio first')
          return
        }
        await api.post(`/student/tasks/${task.id}/submit`, {
          content: {
            toggled: true,
            task_label: task.title,
            submission_mode: 'dashboard_toggle_with_audio',
          },
          audio_url: audio,
        })
        toast.success('Task submitted with audio')
        patchTodayTask(task.id, true)
        setAudioTaskId(null)
        setRecordingTaskId(null)
        setAudioDataUrls((prev) => {
          const next = { ...prev }
          delete next[task.id]
          return next
        })
      } else {
        const res = await api.patch(`/student/tasks/${task.id}/toggle`)
        const completed = !!res.data?.data?.completed
        patchTodayTask(task.id, completed)
        toast.success(completed ? 'Task marked complete' : 'Task unmarked')
      }
      refreshTodayTasks()
    } catch {
      patchTodayTask(task.id, previousCompleted)
      toast.error('Could not update task')
    } finally {
        stopRecorderStream()
      setBusyTaskId(null)
    }
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Assalamu'Alaykum, {firstName}! 👋</h1>
        <p className="text-slate-500 text-sm mt-0.5">Ready to continue your learning journey?</p>
      </div>

      {nextMeeting ? <StudentUpcomingMeetHero meeting={nextMeeting} /> : null}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-md bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-xs opacity-90">Level Progress</span>
              <span className="text-base font-bold">65%</span>
            </div>
            <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
                <div className="bg-white h-full rounded-full" style={{ width: '65%' }} />
            </div>
            <span className="text-xs opacity-70 mt-2">Level 2</span>
          </CardContent>
        </Card>

        <Link to="/student/report" className="block h-full">
          <QuickStat label="My Report" value="View" sub="Full Monthly" from="from-blue-400" to="to-indigo-500" />
        </Link>
        <QuickStat label="Attendance" value="92%" sub="This Month" from="from-emerald-400" to="to-teal-500" />
        <QuickStat label="Doubts" value={String(pendingDoubts)} sub="Answered" from="from-violet-500" to="to-purple-600" />
      </div>

      {/* Today's Plan */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">
            Today&apos;s curriculum
            {tasksFetching && !loadingTasks && (
              <span className="ml-2 text-[10px] font-medium text-slate-400">· Updating…</span>
            )}
          </h2>
          <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-xs font-semibold" asChild>
            <Link to="/student/classes">My Classes</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {loadingTasks ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Loading today&apos;s plan…
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              No tasks scheduled for today yet.{' '}
              <Link to="/student/classes" className="font-semibold text-blue-600 hover:underline">
                Open My Classes
              </Link>{' '}
              for your full study plan.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{planName}</p>
              {todayHeading ? (
                <p className="text-sm font-semibold text-indigo-700">{todayHeading}</p>
              ) : null}
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={clsx(
                      'rounded-xl border px-4 py-3 text-sm',
                      task.completed
                        ? 'border-emerald-100 bg-emerald-50/40 text-emerald-800'
                        : 'border-slate-200 bg-slate-50 text-slate-800',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2
                        className={clsx(
                          'h-4 w-4 shrink-0',
                          task.completed ? 'text-emerald-600' : 'text-slate-300',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{task.title}</p>
                        {displayPeriodTitle(task.period_title) ? (
                          <p className="text-[10px] font-medium text-slate-400">
                            {displayPeriodTitle(task.period_title)}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyTaskId === task.id}
                        onClick={() => {
                          if (!task.completed && requiresAudioOnToggle(task)) {
                            setAudioTaskId((prev) => (prev === task.id ? null : task.id))
                            return
                          }
                          void handleToggleTask(task)
                        }}
                        className={clsx(
                          'h-8 rounded-lg px-2.5 text-[10px] font-black',
                          task.completed
                            ? 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                            : 'bg-blue-600 text-white hover:bg-blue-700',
                        )}
                      >
                        {busyTaskId === task.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : task.completed ? (
                          'Undo'
                        ) : (
                          'Done'
                        )}
                      </Button>
                    </div>
                    {!task.completed && audioTaskId === task.id && requiresAudioOnToggle(task) && (
                      <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-violet-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-violet-700 hover:bg-violet-50">
                          <Upload className="h-3.5 w-3.5" />
                          <span className="truncate">
                            {audioDataUrls[task.id]?.name || 'Upload audio (optional fallback)'}
                          </span>
                          <input
                            type="file"
                            accept="audio/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) void handleAudioPick(task.id, file)
                            }}
                          />
                        </label>
                        {recordingTaskId === task.id ? (
                          <LiveWaveform
                            active
                            mode="scrolling"
                            stream={recordingStream}
                            height={52}
                            className="mt-2 rounded-md bg-white"
                          />
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {recordingTaskId === task.id ? (
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyTaskId === task.id}
                              onClick={stopRecording}
                              className="h-8 rounded-md bg-rose-600 px-2.5 text-[10px] font-black text-white hover:bg-rose-700"
                            >
                              <Square className="mr-1 h-3.5 w-3.5 fill-current" />
                              Stop
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyTaskId === task.id}
                              onClick={() => void startRecording(task.id)}
                              className="h-8 rounded-md px-2.5 text-[10px] font-bold text-violet-700"
                            >
                              <Mic className="mr-1 h-3.5 w-3.5" />
                              Record audio
                            </Button>
                          )}
                          {audioDataUrls[task.id]?.dataUrl && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyTaskId === task.id}
                              onClick={() =>
                                setAudioDataUrls((prev) => {
                                  const next = { ...prev }
                                  delete next[task.id]
                                  return next
                                })
                              }
                              className="h-8 rounded-md px-2.5 text-[10px] font-bold"
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              Clear
                            </Button>
                          )}
                        </div>
                        {audioDataUrls[task.id]?.dataUrl && (
                          <audio className="mt-2 h-8 w-full" controls src={audioDataUrls[task.id].dataUrl} />
                        )}
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!audioDataUrls[task.id]?.dataUrl || busyTaskId === task.id}
                            onClick={() => void handleToggleTask(task, true)}
                            className="h-8 rounded-md bg-violet-600 px-2.5 text-[10px] font-black text-white hover:bg-violet-700"
                          >
                            Submit with audio
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAudioTaskId(null)
                              setRecordingTaskId(null)
                              stopRecorderStream()
                              setAudioDataUrls((prev) => {
                                const next = { ...prev }
                                delete next[task.id]
                                return next
                              })
                            }}
                            className="h-8 rounded-md px-2.5 text-[10px] font-bold"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full rounded-xl text-xs font-semibold" asChild>
                <Link to="/student/classes">View full study plan in My Classes</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Recent Doubts */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Recent Doubts</h2>
          <Link to="/student/doubts" className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:underline">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-3">
          <DoubtCard
            title="Pronunciation of 'Qalqalah'"
            preview="I'm struggling to pronounce the Qalqalah letters properly when stopping..."
            subject="Tajweed"
            status="answered"
            time="2h ago"
          />
        </div>
      </section>

      {/* Upcoming Classes */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Upcoming Classes</h2>
          <span className="text-xs text-blue-600 font-semibold cursor-pointer hover:underline">Full Schedule</span>
        </div>
        <div className="space-y-3">
          <UpcomingClass name="Advanced Hifz" day="Tomorrow" time="5:00 PM" teacher="Sheikh Abdullah" />
          <UpcomingClass name="Islamic History" day="Wed" time="4:00 PM" teacher="Dr. Ahmed" />
        </div>
      </section>

      {competitions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900">My Competitions</h2>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:gap-3">
            {competitions.map(reg => {
              const comp = reg.competitions
              return (
                <div key={reg.id} className="min-w-0 bg-white rounded-xl border border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-2.5 sm:gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{comp?.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {comp?.start_date ? new Date(comp?.start_date).toLocaleDateString() : ''}
                    </p>
                    <div className="mt-2 inline-flex items-center">
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                        {reg.status}
                      </span>
                    </div>
                  </div>
                  {reg.competition_results &&
                    reg.competition_results.length > 0 &&
                    reg.results_released && (
                    <div className="bg-green-50 px-3 py-2 rounded-lg border border-green-100 text-right shrink-0 self-start sm:self-auto">
                      <p className="text-3xl leading-none font-bold text-green-700">{reg.competition_results[0].score}/100</p>
                      {reg.competition_results[0].remarks && <p className="text-[10px] text-green-600 mt-0.5 max-w-[130px] truncate">{reg.competition_results[0].remarks}</p>}
                    </div>
                  )}
                  {reg.competition_results &&
                    reg.competition_results.length > 0 &&
                    !reg.results_released && (
                    <div className="bg-amber-50 px-3 py-2 rounded-lg border border-amber-100 text-right shrink-0 self-start sm:self-auto">
                      <p className="text-[11px] font-bold text-amber-700 uppercase">Under review</p>
                      <p className="text-[10px] text-amber-600 mt-0.5 max-w-[120px]">Results appear after grading.</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function QuickStat({ label, value, sub, from, to }: { label: string; value: string; sub: string; from: string; to: string }) {
  return (
    <Card className={clsx('border-0 shadow-md text-white bg-gradient-to-br', from, to)}>
      <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full gap-0.5">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-xs font-semibold opacity-90">{label}</span>
        <span className="text-[10px] opacity-70">{sub}</span>
      </CardContent>
    </Card>
  )
}

function DoubtCard({ title, preview, subject, status, time }: {
  title: string; preview: string; subject: string; status: 'answered' | 'pending'; time: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <MessageCircle className="w-5 h-5 text-slate-300 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900 truncate">{title}</span>
            <span className="text-[10px] text-slate-400 shrink-0">{time}</span>
          </div>
          <p className="text-xs text-slate-500 line-clamp-1 mb-2">{preview}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{subject}</span>
            <span className={clsx(
              'text-[10px] font-bold px-2 py-0.5 rounded-full',
              status === 'answered' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'
            )}>
              {status === 'answered' ? 'Answered' : 'Pending'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function UpcomingClass({ name, day, time, teacher }: { name: string; day: string; time: string; teacher: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-900">{name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{day}, {time} • {teacher}</p>
      </div>
      <Button size="sm" variant="outline" className="rounded-xl text-xs font-semibold border-slate-200 shrink-0">
        Remind Me
      </Button>
    </div>
  )
}
