import { useState, useEffect } from 'react'
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

async function fetchTodayTasks(): Promise<Task[]> {
  try {
    const res = await api.get('/classroom/tasks/today')
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
}

export default function StudentDashboard() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [pendingDoubts, setPendingDoubts] = useState(1)

  useEffect(() => {
    fetchTodayTasks()
      .then(t => setTasks(t))
      .finally(() => setLoadingTasks(false))

    api.get('/classroom/doubts').then(r => {
      const d = r.data?.data
      if (Array.isArray(d)) setPendingDoubts(d.filter((x: any) => x.status === 'pending').length)
    }).catch(() => { })
  }, [])

  const completedCount = tasks.filter((t) => t.completed).length
  const totalCount = tasks.length
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t))
    setCompletingId(id)
    try {
      await api.patch(`/classroom/tasks/${id}/toggle`)
      if (!task.completed) toast.success('MashaAllah! Progress saved.')
    } catch {
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: task.completed } : t))
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

        <QuickStat label="Assignments" value="2" sub="Pending" from="from-amber-400" to="to-orange-500" />
        <QuickStat label="Attendance" value="92%" sub="This Month" from="from-emerald-400" to="to-teal-500" />
        <QuickStat label="Doubts" value={String(pendingDoubts)} sub="Answered" from="from-blue-400" to="to-indigo-500" />
      </div>

      {/* Today's Plan */}
      <section>
        <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] tracking-widest uppercase mb-4">
          <Calendar className="w-3 h-3" /> Today's Plan: Day 1: Surah An-Naba
        </div>

        {/* Plan Card */}
        <Card className="bg-[#0f4c81] text-white border-0 shadow-lg mb-5 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <TrendingUp className="w-28 h-28" />
          </div>
          <CardContent className="p-6 relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-bold mb-1">Hifz Intensive</h3>
                <p className="text-blue-100/70 text-sm">Juz 30 • Week 1</p>
              </div>
              <div className="bg-white/10 p-2 rounded-xl"><TrendingUp className="w-4 h-4" /></div>
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

        {/* Task List */}
        <div className="space-y-3">
          {loadingTasks ? (
            [1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 animate-pulse rounded-2xl" />)
          ) : (
            tasks.map((task) => {
              const colors = TASK_COLORS[task.task_type]
              const isLoading = completingId === task.id
              return (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task.id)}
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
                      'text-sm font-semibold truncate',
                      task.completed ? 'line-through text-slate-400' : 'text-slate-900'
                    )}>{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border', colors.bg, colors.text)}>
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
