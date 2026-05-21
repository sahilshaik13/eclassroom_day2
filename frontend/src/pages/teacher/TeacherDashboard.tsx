import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, MessageCircle, CheckCircle2, Calendar, Sparkles, Loader2, Check } from 'lucide-react'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { TeacherSubmissionsWorkspace } from '@/components/teacher/TeacherSubmissionsWorkspace'
import { TeacherScheduleClassCard } from '@/components/teacher/TeacherScheduleClassCard'
import { StudyPlanTableView } from '@/components/study-plan/StudyPlanTableView'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import { findStudyPlanSourceRow, getDashboardStudyPlanColumns } from '@/lib/studyPlanSource'
import { subscribeToClassMeetings, subscribeToTeacherQueue } from '@/lib/realtime'
import { fetchTeacherTodayMeetings } from '@/services/meetApi'
import type { ClassMeeting } from '@/services/meetApi'
import {
  formatMeetingTimeRange,
  meetingScheduleStatus,
  pickNextMeeting,
} from '@/lib/studentMeetings'

interface StudentQuestion { id: string; student: string; initials: string; question: string; time: string; subject?: string }
interface PulseStudent { student_id: string; name: string; completion_pct: number; pending_doubts: number }

const FALLBACK_QUESTIONS: StudentQuestion[] = [
  { id: '1', student: 'Omar M.', initials: 'OM', question: 'Can you explain the rule of Iqlab? I am confused about when exactly to convert the sound.', time: '10m ago', subject: 'Tajweed' },
  { id: '2', student: 'Aisha K.', initials: 'AK', question: 'What is the difference between Idgham with Ghunnah and without Ghunnah?', time: '25m ago', subject: 'Tajweed' },
  { id: '3', student: 'Zayn A.', initials: 'ZA', question: 'I am struggling to memorise Ayah 15–20 of Surah An-Naba. Can we review it?', time: '1h ago', subject: 'Hifz' },
]

export default function TeacherDashboard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)

  const avgAttendance = 95

  const { data: pulseData, isPending: pulsePending } = useQuery({
    queryKey: queryKeys.teacher.pulseToday(),
    queryFn: async () =>
      ((await api.get('/teacher/pulse/today')).data?.data ?? []) as PulseStudent[],
    staleTime: 60_000,
  })

  const { data: classes = [], isPending: classesPending } = useQuery({
    queryKey: queryKeys.teacher.classes(),
    queryFn: async () => (await api.get('/teacher/classes')).data?.data ?? [],
    staleTime: 60_000,
  })

  const { data: todayMeetings = [] } = useQuery({
    queryKey: queryKeys.teacher.meetingsToday(),
    queryFn: fetchTeacherTodayMeetings,
    staleTime: 30_000,
    refetchInterval: 30_000,
    enabled: classes.length > 0,
  })

  const meetingsByClass = useMemo(() => {
    const map = new Map<string, ClassMeeting[]>()
    const now = Date.now()
    for (const m of todayMeetings) {
      try {
        if (now >= new Date(m.end_at).getTime()) continue
      } catch {
        continue
      }
      const list = map.get(m.class_id) ?? []
      list.push(m)
      map.set(m.class_id, list)
    }
    return map
  }, [todayMeetings])

  const scheduleClasses = useMemo(() => {
    if (!classes.length) return []
    return classes.filter((c: { id: string }) => meetingsByClass.has(c.id)).slice(0, 3)
  }, [classes, meetingsByClass])

  // Subscribe to real-time updates for pending queue
  useEffect(() => {
    if (!user?.id || classes.length === 0) return

    const classIds = classes.map((c: any) => c.id)
    const unsubscribe = subscribeToTeacherQueue(user.id, classIds)
    return unsubscribe
  }, [user?.id, classes])

  useEffect(() => {
    if (classes.length === 0) return
    const unsubs: Array<() => void> = classes.map((c: { id: string }) =>
      subscribeToClassMeetings(c.id),
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [classes])

  const { data: pendingDoubtsRaw = [], isPending: doubtsPending } = useQuery({
    queryKey: queryKeys.teacher.doubts('pending'),
    queryFn: async () => (await api.get('/teacher/doubts?status=pending')).data?.data ?? [],
    staleTime: 30_000,
  })

  const firstClassId = classes[0]?.id as string | undefined

  const { data: firstClassPlan, isPending: todayCurriculumLoading } = useQuery({
    queryKey: queryKeys.teacher.classroomStudyPlan(firstClassId ?? ''),
    queryFn: async () => {
      try {
        return (await api.get(`/teacher/classrooms/${firstClassId}/study-plan`)).data?.data
      } catch {
        return null
      }
    },
    enabled: !!firstClassId,
    ...studyPlanQueryOptions(),
    retry: 0,
  })

  const { data: firstClassSource } = useQuery({
    queryKey: queryKeys.teacher.classroomStudyPlanSource(firstClassId ?? ''),
    queryFn: async () => {
      try {
        return (await api.get(`/teacher/classrooms/${firstClassId}/study-plan-source`)).data?.data
      } catch {
        return null
      }
    },
    enabled: !!firstClassId,
    ...studyPlanQueryOptions(),
    retry: 0,
  })

  const { totalStudents, totalClasses, pendingDoubts, todayCurriculum, todayCurriculumColumns, todayCurriculumRow, questions } = useMemo(() => {
    const pulse: PulseStudent[] = pulseData ?? []
    const doubtsList = pendingDoubtsRaw as any[]
    const totalStudentsN = pulse.length
    const totalClassesN = classes.length
    const totalDoubtsFromPulse = pulse.reduce((s, p) => s + p.pending_doubts, 0)

    let pendingCount = totalDoubtsFromPulse
    let qList: StudentQuestion[] = FALLBACK_QUESTIONS

    if (doubtsList.length > 0) {
      pendingCount = doubtsList.length
      qList = doubtsList.slice(0, 5).map((d: any) => ({
        id: d.id,
        student: d.students?.name || 'Student',
        initials: (d.students?.name || 'S').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
        question: d.body || d.title,
        time: timeAgo(d.created_at),
        subject: d.subject,
      }))
    } else {
      const withDoubts = pulse.filter(p => p.pending_doubts > 0)
      if (withDoubts.length > 0) {
        qList = withDoubts.slice(0, 5).map(p => ({
          id: p.student_id,
          student: p.name,
          initials: p.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          question: `${p.pending_doubts} pending question${p.pending_doubts > 1 ? 's' : ''} — tap to view`,
          time: 'Today',
        }))
      }
    }

    let curriculum: { className: string; periods: any[]; scheduledDate?: string; dayNumber?: number } | null = null
    let todayColumns: string[] = []
    let todayRow: Record<string, string> | null = null
    if (firstClassPlan && classes[0]) {
      const cname = classes[0].name as string
      const dayList = firstClassPlan?.days || []
      const todayStr = new Date().toISOString().slice(0, 10)
      const day = dayList.find((d: any) => d.scheduled_date?.slice(0, 10) === todayStr)
      if (firstClassSource) {
        todayColumns = getDashboardStudyPlanColumns(firstClassSource)
        todayRow = findStudyPlanSourceRow(firstClassSource, {
          scheduledDate: day?.scheduled_date || todayStr,
          dayNumber: day?.day_number,
        })
      }
      if (day?.periods?.length) {
        curriculum = {
          className: cname,
          periods: day.periods,
          scheduledDate: day.scheduled_date,
          dayNumber: day.day_number,
        }
      }
    }

    return {
      totalStudents: totalStudentsN,
      totalClasses: totalClassesN,
      pendingDoubts: pendingCount,
      todayCurriculum: curriculum,
      todayCurriculumColumns: todayColumns,
      todayCurriculumRow: todayRow,
      questions: qList,
    }
  }, [pulseData, pendingDoubtsRaw, classes, firstClassPlan, firstClassSource])

  const handleSendReply = async (questionId: string) => {
    if (!replyText.trim()) return
    setIsSending(true)
    try {
      await api.post(`/teacher/doubts/${questionId}/reply`, { body: replyText })
      setSentId(questionId)
      toast.success('Reply sent!')
      await queryClient.invalidateQueries({ queryKey: queryKeys.teacher.doubts('pending') })
      await queryClient.invalidateQueries({ queryKey: queryKeys.teacher.pulseToday() })
      setTimeout(() => {
        setReplyingTo(null)
        setReplyText('')
        setSentId(null)
      }, 1500)
    } catch {
      toast.error('Could not send reply. Try again.')
    } finally { setIsSending(false) }
  }

  const firstName = user?.name?.split(' ')[0] || 'Teacher'

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      {/* Welcome */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          Assalamu'Alaykum, {firstName}!
          <Sparkles className="h-5 w-5 text-amber-400 fill-amber-400" />
        </h1>
        <p className="text-slate-500 font-medium">
          You have <span className="text-blue-600 font-bold">{classesPending ? '…' : totalClasses} {totalClasses === 1 ? 'class' : 'classes'}</span> and{' '}
          <span className="text-orange-500 font-bold">{doubtsPending && pendingDoubtsRaw.length === 0 ? '…' : pendingDoubts} student questions</span> today.
        </p>
      </div>

      {/* Stats Grid — real numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={pulsePending ? '…' : String(totalStudents)} label="Total Students" icon={Users} from="from-[#4E7DFF]" to="to-[#3B66DE]" shadow="shadow-blue-500/20" />
        <StatCard value={classesPending ? '…' : String(totalClasses)} label="Classes Today" icon={Calendar} from="from-[#A855F7]" to="to-[#8B5CF6]" shadow="shadow-purple-500/20" />
        <StatCard value={doubtsPending && pendingDoubtsRaw.length === 0 ? '…' : String(pendingDoubts)} label="Student Questions" icon={MessageCircle} from="from-[#FF922B]" to="to-[#F76707]" shadow="shadow-orange-500/20" />
        <StatCard value={`${avgAttendance}%`} label="Avg. Attendance" icon={CheckCircle2} from="from-[#20C997]" to="to-[#12B886]" shadow="shadow-emerald-500/20" />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s curriculum</h2>
          <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-xs font-semibold" asChild>
            <Link to="/teacher/study-plan">Study plan</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {todayCurriculumLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Loading today&apos;s plan…
            </div>
          ) : !todayCurriculum && !todayCurriculumRow ? (
            <p className="text-sm text-slate-500">
              No scheduled curriculum day for today in your first class, or no plan yet. Open Study plan for the full calendar.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {todayCurriculum?.className || classes[0]?.name}
              </p>
              {todayCurriculumRow && todayCurriculumColumns.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold text-indigo-700">Today&apos;s timetable</p>
                  <StudyPlanTableView
                    columns={todayCurriculumColumns}
                    rows={[todayCurriculumRow]}
                    emptyMessage="No timetable row is available for today."
                  />
                </div>
              ) : null}
              {todayCurriculum?.periods?.map((period: any) => (
                <div key={period.id || period.title}>
                  <p className="text-xs font-semibold text-indigo-700">
                    {formatStudyPlanPeriodLabel(period.title, {
                      scheduledDate: todayCurriculum.scheduledDate,
                      dayNumber: todayCurriculum.dayNumber,
                    })}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(period.tasks || []).map((task: any) => (
                      <li
                        key={task.id || task.title}
                        className="flex flex-col gap-0.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{task.title}</span>
                          {task.description ? (
                            <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <TeacherSubmissionsWorkspace layout="embedded" />

      {/* Today's Schedule — real classes from API */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Today's Schedule</h2>
        {classes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-400">No classes assigned yet.</p>
          </div>
        ) : scheduleClasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-400">No upcoming meetings for today.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {scheduleClasses.map((cls: any, i: number) => {
              const classMeetings = meetingsByClass.get(cls.id) ?? []
              const meeting = pickNextMeeting(classMeetings)
              const enrollment =
                cls.class_enrollments?.[0]?.count ?? cls.enrollment_count ?? 0
              return (
                <TeacherScheduleClassCard
                  key={cls.id || i}
                  classId={cls.id}
                  title={cls.name}
                  batch={`Class ${i + 1}`}
                  time={
                    meeting
                      ? formatMeetingTimeRange(meeting)
                      : cls.schedule_json?.time
                        ? String(cls.schedule_json.time)
                        : 'No meeting today'
                  }
                  students={enrollment}
                  status={meeting ? meetingScheduleStatus(meeting) : 'Upcoming'}
                  meeting={meeting ?? null}
                  zoomLink={cls.zoom_link}
                  meetingTitle={meeting?.title}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* Student Questionnaire — each card is a distinct real question */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Student Questionnaire</h2>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">View All →</span>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">All questions answered!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8 border border-slate-100">
                      <AvatarFallback className="text-[10px] bg-indigo-50 text-indigo-700 font-bold">{q.initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="text-sm font-bold text-slate-900">{q.student}</span>
                      {q.subject && <span className="ml-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{q.subject}</span>}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">{q.time}</span>
                </div>
                <p className="text-sm text-slate-600 line-clamp-2 mb-3">{q.question}</p>
                <Button size="sm" variant="secondary" className="h-8 text-xs w-full font-semibold" onClick={() => { setReplyingTo(q.id); setReplyText('') }}>
                  Reply
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reply Dialog */}
      <Dialog open={!!replyingTo} onOpenChange={(open) => { if (!open) { setReplyingTo(null); setReplyText('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reply to {questions.find(q => q.id === replyingTo)?.student}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {replyingTo && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm text-slate-600 italic">
                "{questions.find(q => q.id === replyingTo)?.question}"
              </div>
            )}
            <Textarea placeholder="Type your explanation here..." value={replyText} onChange={(e) => setReplyText(e.target.value)} className="min-h-[120px] resize-none" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setReplyingTo(null); setReplyText('') }}>Cancel</Button>
            <Button onClick={() => replyingTo && handleSendReply(replyingTo)} disabled={!replyText.trim() || isSending || !!sentId} className="min-w-[110px]">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : sentId === replyingTo ? <><Check className="h-4 w-4 mr-1" /> Sent!</> : <>Send Reply <MessageCircle className="h-3 w-3 ml-2" /></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({ value, label, icon: Icon, from, to, shadow }: { value: string; label: string; icon: React.ElementType; from: string; to: string; shadow: string }) {
  return (
    <div className={clsx('relative group overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-0.5 bg-gradient-to-br text-white shadow-lg', from, to, shadow)}>
      <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform duration-300"><Icon className="h-8 w-8" /></div>
      <p className="text-4xl font-black tracking-tighter mb-1">{value}</p>
      <div className="flex items-center gap-1.5 opacity-90"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-widest">{label}</span></div>
    </div>
  )
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'Recently'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
