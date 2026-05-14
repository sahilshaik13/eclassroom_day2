import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BookOpen, Loader2, Calendar, PlayCircle, ArrowRight,
  MessageCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { Task } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StudyPlanTableView } from '@/components/study-plan/StudyPlanTableView'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { competitionApi } from '@/services/competitionApi'
import { findStudyPlanSourceRow, getDashboardStudyPlanColumns, getDashboardStudyPlanTaskEntries } from '@/lib/studyPlanSource'

async function fetchTodayTasks(): Promise<Task[]> {
  try {
    const res = await api.get('/student/tasks/today')
    return res.data.data
  } catch {
    return []
  }
}

export default function StudentDashboard() {
  const { user } = useAuthStore()

  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: queryKeys.student.tasksToday(),
    queryFn: fetchTodayTasks,
    staleTime: 30_000,
  })

  const { data: studyPlanSource } = useQuery({
    queryKey: queryKeys.student.studyPlanSource(),
    queryFn: async () => (await api.get('/student/study-plan-source')).data?.data,
    staleTime: 120_000,
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
    staleTime: 60_000,
  })

  const todayPlanColumns = useMemo(() => getDashboardStudyPlanColumns(studyPlanSource), [studyPlanSource])
  const todayPlanRow = useMemo(
    () =>
      findStudyPlanSourceRow(studyPlanSource, {
        scheduledDate: tasks[0]?.scheduled_date || new Date().toISOString().slice(0, 10),
        dayNumber: tasks[0]?.day_number,
      }),
    [studyPlanSource, tasks]
  )
  const planName = tasks[0]?.plan_name || 'Study plan'
  const todayTaskEntries = useMemo(
    () => getDashboardStudyPlanTaskEntries(todayPlanRow, todayPlanColumns),
    [todayPlanColumns, todayPlanRow]
  )
  const todayHeading = useMemo(() => {
    const raw = tasks[0]?.scheduled_date || String(todayPlanRow?.Date ?? todayPlanRow?.date ?? '')
    const parsed = raw ? new Date(raw) : new Date()
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  }, [tasks, todayPlanRow])

  const firstName = user?.name?.split(' ')[0] || 'Learner'

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Assalamu'Alaykum, {firstName}! 👋</h1>
        <p className="text-slate-500 text-sm mt-0.5">Ready to continue your learning journey?</p>
      </div>

      {/* Hero: Next Class */}
      <Card className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0 shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <BookOpen className="w-28 h-28" />
        </div>
        <CardContent className="p-6 relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-4 border border-white/20">
            Up Next • Live in 10 mins
          </div>
          <h2 className="text-2xl font-bold mb-2">Tajweed Fundamentals</h2>
          <div className="flex items-center gap-4 mb-5 text-indigo-100 text-sm">
            <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Today</span>
            <span className="flex items-center gap-1.5">🕓 4:00 PM</span>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold gap-2 rounded-xl">
              <PlayCircle className="w-4 h-4" /> Join Class
            </Button>
            <Button variant="outline" className="bg-transparent border-white/40 text-white hover:bg-white/10 rounded-xl">
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Level Progress */}
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
          <h2 className="text-lg font-bold text-slate-900">Today&apos;s curriculum</h2>
          <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-xs font-semibold" asChild>
            <Link to="/student/study-plan">Study plan</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {loadingTasks && !todayPlanRow ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Loading today&apos;s plan…
            </div>
          ) : !todayPlanRow && tasks.length === 0 ? (
            <p className="text-sm text-slate-500">
              No scheduled curriculum day for today yet. Open Study plan for the full calendar.
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{planName}</p>

              {todayPlanRow && todayPlanColumns.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold text-indigo-700">Today&apos;s timetable</p>
                  <StudyPlanTableView
                    columns={todayPlanColumns}
                    rows={[todayPlanRow]}
                    emptyMessage="No timetable row is available for today."
                  />
                </div>
              ) : null}

              {loadingTasks && !todayTaskEntries.length ? (
                <div className="space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-12 bg-slate-100 animate-pulse rounded-2xl" />)}
                </div>
              ) : todayTaskEntries.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-indigo-700">Today&apos;s tasks</p>
                  {todayHeading ? (
                    <p className="text-sm font-semibold text-indigo-700">{todayHeading}</p>
                  ) : null}
                  {todayTaskEntries.map((entry) => (
                    <div
                      key={entry.label}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
                    >
                      <span className="font-semibold">{entry.label}:</span> {entry.value}
                    </div>
                  ))}
                </div>
              ) : todayPlanRow ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  Today&apos;s timetable is shown above. No task details are available below yet.
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  No tasks scheduled for today yet.
                </div>
              )}
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

      {/* My Competitions  */}
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
