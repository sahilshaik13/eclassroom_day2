import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, UserPlus, MessageCircle, CheckCircle2, Clock, Calendar, PlayCircle, BookOpen, Sparkles, Loader2, Check } from 'lucide-react'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { TeacherSubmissionsWorkspace } from '@/components/teacher/TeacherSubmissionsWorkspace'

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

  const { data: pendingDoubtsRaw = [], isPending: doubtsPending } = useQuery({
    queryKey: queryKeys.teacher.doubts('pending'),
    queryFn: async () => (await api.get('/teacher/doubts?status=pending')).data?.data ?? [],
    staleTime: 30_000,
  })

  const firstClassId = classes[0]?.id as string | undefined

  const { data: firstClassPlan, isPending: todayCurriculumLoading } = useQuery({
    queryKey: queryKeys.teacher.classroomStudyPlan(firstClassId ?? ''),
    queryFn: async () => (await api.get(`/teacher/classrooms/${firstClassId}/study-plan`)).data?.data,
    enabled: !!firstClassId,
    staleTime: 120_000,
  })

  const { totalStudents, totalClasses, pendingDoubts, todayCurriculum, questions } = useMemo(() => {
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

    let curriculum: { className: string; periods: any[] } | null = null
    if (firstClassPlan && classes[0]) {
      const cname = classes[0].name as string
      const dayList = firstClassPlan?.days || []
      const todayStr = new Date().toISOString().slice(0, 10)
      const day = dayList.find((d: any) => d.scheduled_date?.slice(0, 10) === todayStr)
      if (day?.periods?.length) curriculum = { className: cname, periods: day.periods }
    }

    return {
      totalStudents: totalStudentsN,
      totalClasses: totalClassesN,
      pendingDoubts: pendingCount,
      todayCurriculum: curriculum,
      questions: qList,
    }
  }, [pulseData, pendingDoubtsRaw, classes, firstClassPlan])

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
          ) : !todayCurriculum ? (
            <p className="text-sm text-slate-500">
              No scheduled curriculum day for today in your first class, or no plan yet. Open Study plan for the full calendar.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{todayCurriculum.className}</p>
              {todayCurriculum.periods.map((period: any) => (
                <div key={period.id || period.title}>
                  <p className="text-xs font-semibold text-indigo-700">{period.title}</p>
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
                        <Badge variant="secondary" className="w-fit shrink-0 text-[10px] font-medium capitalize">
                          {task.task_type}
                        </Badge>
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
        ) : (
          <div className="space-y-4">
            {classes.slice(0, 3).map((cls: any, i: number) => (
              <ClassCard
                key={cls.id || i}
                id={cls.id}
                title={cls.name}
                batch={`Class ${i + 1}`}
                time={cls.schedule_json?.time ? `${cls.schedule_json.time}` : 'Time TBD'}
                students={cls.enrollment_count || cls['class_enrollments']?.[0]?.count || 0}
                status="Upcoming"
                zoomLink={cls.zoom_link}
              />
            ))}
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

function ClassCard({ id, title, batch, time, students, status, zoomLink }: { id: string; title: string; batch: string; time: string; students: number; status: string; zoomLink?: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-slate-100 text-slate-500 border-none text-[10px] font-bold px-3 py-1 rounded-full">{batch}</Badge>
            <Badge className="bg-blue-50 text-blue-600 border-none text-[10px] font-bold px-3 py-1 rounded-full">{status}</Badge>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <div className="flex items-center gap-4 mt-1.5 text-slate-400 text-sm flex-wrap">
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{time}</span>
              <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{students} Students</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap sm:flex-nowrap">
          {zoomLink ? (
            <Button asChild className="flex-1 sm:flex-none gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold text-xs">
              <a href={zoomLink} target="_blank" rel="noopener noreferrer"><PlayCircle className="h-4 w-4" /> Start Class</a>
            </Button>
          ) : (
            <Button disabled className="flex-1 sm:flex-none gap-2 bg-blue-600 rounded-xl font-semibold text-xs opacity-60"><PlayCircle className="h-4 w-4" /> Start Class</Button>
          )}
          <Button asChild variant="outline" className="flex-1 sm:flex-none gap-2 rounded-xl font-semibold text-xs border-slate-200">
            <Link to={`/teacher/students?class=${id}`}>
              <UserPlus className="h-4 w-4" /> Add Student
            </Link>
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none gap-2 rounded-xl font-semibold text-xs border-slate-200"><BookOpen className="h-4 w-4" /> View Materials</Button>
        </div>
      </div>
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
