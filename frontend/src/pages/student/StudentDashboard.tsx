import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, Circle, BookOpen, Headphones,
  Loader2, Calendar, PlayCircle, ArrowRight,
  MessageCircle, TrendingUp
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskType } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { competitionApi } from '@/services/competitionApi'
import TaskSubmissionModal from '@/components/student/TaskSubmissionModal'

async function fetchTodayTasks(): Promise<Task[]> {
  try {
    const res = await api.get('/student/tasks/today')
    return res.data.data
  } catch {
    return [
      { id: '1', title: 'Memorize Ayah 1-10', task_type: 'memorise', day_number: 1, completed: false },
      { id: '2', title: 'Revision: Al-Mulk (Tajweed focus: Noon Sakinah)', task_type: 'review', day_number: 1, completed: false },
      { id: '3', title: 'Reflection — What is the main message?', task_type: 'read', day_number: 1, completed: false },
      { id: '4', title: 'Audio Recitation — Listen to Sheikh Hussary', task_type: 'listen', day_number: 1, completed: false },
    ]
  }
}

const TASK_COLORS: Record<TaskType, { bg: string; text: string; tag: string }> = {
  memorise: { bg: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-600', tag: 'New' },
  review: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', tag: 'Review' },
  recite: { bg: 'bg-violet-50 border-violet-100', text: 'text-violet-600', tag: 'Recite' },
  listen: { bg: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-600', tag: 'Audio' },
  read: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600', tag: 'Read' },
  mcq: { bg: 'bg-orange-50 border-orange-100', text: 'text-orange-600', tag: 'Quiz' },
  written: { bg: 'bg-rose-50 border-rose-100', text: 'text-rose-600', tag: 'Write' },
  reflection: { bg: 'bg-teal-50 border-teal-100', text: 'text-teal-600', tag: 'Reflect' },
}

export default function StudentDashboard() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<any>(null)

  const { data: tasks = [], isPending: loadingTasks } = useQuery({
    queryKey: queryKeys.student.tasksToday(),
    queryFn: fetchTodayTasks,
    staleTime: 30_000,
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

  const completedCount = tasks.filter((t) => t.completed).length
  const totalCount = tasks.length
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const key = queryKeys.student.tasksToday()
    queryClient.setQueryData<Task[]>(key, (prev = []) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
    setCompletingId(id)
    try {
      await api.patch(`/student/tasks/${id}/toggle`)
      if (!task.completed) toast.success('MashaAllah! Progress saved.')
    } catch {
      await queryClient.invalidateQueries({ queryKey: key })
    } finally {
      setCompletingId(null)
    }
  }

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
      <section>
        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-4">
          <Calendar className="w-3 h-3" /> Today&apos;s plan
          {tasks[0]?.plan_name ? (
            <span className="normal-case font-semibold text-slate-600">— {tasks[0].plan_name}</span>
          ) : null}
        </div>

        {/* Plan Card */}
        <Link to="/student/study-plan">
          <Card className="bg-[#0f4c81] hover:bg-[#0c3d69] transition-colors cursor-pointer text-white border-0 shadow-lg mb-5 overflow-hidden relative group">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-28 h-28" />
            </div>
            <CardContent className="p-6 relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold mb-1">{tasks[0]?.plan_name || 'Study plan'}</h3>
                  <p className="text-blue-100/70 text-sm">
                    {totalCount ? `${totalCount} scheduled ${totalCount === 1 ? 'item' : 'items'} today` : 'Open calendar for details'}
                  </p>
                </div>
                <div className="bg-white/10 p-2 rounded-xl flex items-center gap-2">
                   <span className="text-[10px] font-black uppercase">View All</span>
                   <ArrowRight className="w-3 h-3" />
                </div>
              </div>
              <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden mb-3">
                <div className="bg-white h-full rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-blue-100/80">
                <span>{pct}% Complete</span>
                <span>{totalCount - completedCount} tasks left</span>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Task List */}
        <div className="space-y-3">
          {loadingTasks ? (
            [1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-2xl" />)
          ) : tasks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-500">
              No tasks scheduled for today yet.
            </div>
          ) : (
            tasks.map((task) => {
              const colors = TASK_COLORS[task.task_type]
              const isLoading = completingId === task.id
              const isSubmissionTask = ['mcq', 'written', 'reflection'].includes(task.task_type)

              return (
                <button
                  key={task.id}
                  onClick={() => {
                    if (isSubmissionTask && !task.completed) {
                      setSelectedTask(task)
                    } else {
                      toggleTask(task.id)
                    }
                  }}
                  disabled={isLoading}
                  className={clsx(
                    'w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-200',
                    task.completed
                      ? 'bg-slate-50 border-slate-100 opacity-60'
                      : 'bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm'
                  )}
                >
                  <div className={clsx(
                    'h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 border',
                    task.completed ? 'bg-emerald-500 border-emerald-500 text-white' : `${colors.bg} ${colors.text}`
                  )}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
                      task.completed ? <CheckCircle2 className="h-4 w-4" /> :
                        <Circle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx(
                      'text-sm font-semibold',
                      task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                    )}>{task.title}</p>
                    {task.description ? (
                      <p className={clsx(
                        'mt-0.5 line-clamp-2 text-xs text-slate-500',
                        task.completed && 'line-through'
                      )}>{task.description}</p>
                    ) : null}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border max-w-[10rem] truncate', colors.bg, colors.text)}>
                        {colors.tag}
                      </span>
                      {task.task_type === 'listen' && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Headphones className="w-3 h-3" /> Audio
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-medium shrink-0">
                    {task.task_type === 'memorise' ? '30m' : task.task_type === 'review' ? '15m' : task.task_type === 'listen' ? '20m' : '10m'}
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* Submission Modal */}
        {selectedTask && (
          <TaskSubmissionModal 
            task={selectedTask}
            isOpen={!!selectedTask}
            onClose={() => setSelectedTask(null)}
            onSuccess={() => {
              const key = queryKeys.student.tasksToday()
              queryClient.setQueryData<Task[]>(key, (prev = []) =>
                prev.map((t) =>
                  t.id === selectedTask.id ? { ...t, completed: true } : t
                )
              )
              setSelectedTask(null)
            }}
          />
        )}
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
