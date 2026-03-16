import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, BookOpen, Headphones, RotateCcw, Mic, FileText,
         TrendingUp, Users, Megaphone, ExternalLink, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskType, WeekProgress } from '@/types'

// Placeholder API calls — wired to real endpoints on Day 3
async function fetchTodayTasks(): Promise<Task[]> {
  return [
    { id: '1', title: 'Memorise Surah An-Naba 1–10', task_type: 'memorise', day_number: 1, completed: false },
    { id: '2', title: 'Listen to Surah An-Naba (full audio)', task_type: 'listen', day_number: 1, completed: false },
  ]
}
async function fetchWeekProgress(): Promise<WeekProgress[]> {
  return Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
    completed_count: i < 5 ? Math.floor(Math.random() * 2) + 1 : 0,
    total_count: 2,
  }))
}

const TASK_ICONS: Record<TaskType, React.ElementType> = {
  memorise: BookOpen,
  review:   RotateCcw,
  recite:   Mic,
  listen:   Headphones,
  read:     FileText,
}

const TASK_COLORS: Record<TaskType, string> = {
  memorise: 'text-gold bg-gold/10',
  review:   'text-blue-500 bg-blue-50',
  recite:   'text-violet-500 bg-violet-50',
  listen:   'text-emerald-500 bg-emerald-50',
  read:     'text-amber-500 bg-amber-50',
}

export default function StudentDashboard() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [week, setWeek] = useState<WeekProgress[]>([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchTodayTasks(), fetchWeekProgress()])
      .then(([t, w]) => { setTasks(t); setWeek(w) })
      .finally(() => setLoadingTasks(false))
  }, [])

  const completedCount = tasks.filter((t) => t.completed).length
  const totalCount = tasks.length
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t)
    )
    setCompletingId(id)
    try {
      // Day 3: replace with real API call
      await new Promise((r) => setTimeout(r, 300))
      if (!task.completed) toast.success('Task complete! 🌟')
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => t.id === id ? { ...t, completed: task.completed } : t)
      )
      toast.error('Could not update task')
    } finally {
      setCompletingId(null)
    }
  }

  const today = format(new Date(), 'EEEE, d MMMM')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-fade-up">
        <p className="text-xs text-ink-faint uppercase tracking-widest mb-1">{today}</p>
        <h1 className="font-display text-2xl text-ink">
          Good {getGreeting()}, <span className="text-gold">{user?.name?.split(' ')[0]}</span> 👋
        </h1>
      </div>

      {/* Announcement */}
      <div className="animate-fade-up animate-delay-100 flex items-start gap-3 px-4 py-3
                      bg-gold/5 border border-gold/20 rounded-xl">
        <Megaphone className="w-4 h-4 text-gold shrink-0 mt-0.5" />
        <p className="text-sm text-ink-muted leading-snug">
          🌙 Ramadan Mubarak! Classes continue as scheduled. Complete your daily tasks before Iftar.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Today's Tasks — takes 2 cols */}
        <div className="lg:col-span-2 space-y-4 animate-fade-up animate-delay-200">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-ink">Today's Tasks</h2>
              <span className="text-xs font-medium text-ink-faint">
                {completedCount}/{totalCount} done
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-border rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            {loadingTasks ? (
              <div className="flex items-center justify-center py-10 text-ink-faint">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-ink-faint text-sm">No tasks assigned for today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => {
                  const Icon = TASK_ICONS[task.task_type]
                  const isLoading = completingId === task.id
                  return (
                    <button
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      disabled={isLoading}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left',
                        task.completed
                          ? 'bg-green-50 border-green-200'
                          : 'bg-surface-alt border-border hover:border-gold/40 hover:bg-gold/5'
                      )}
                    >
                      {isLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin text-gold shrink-0" />
                      ) : task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="w-5 h-5 text-ink-faint shrink-0" />
                      )}
                      <span className={clsx(
                        'text-sm font-medium flex-1',
                        task.completed && 'line-through text-ink-faint'
                      )}>
                        {task.title}
                      </span>
                      <span className={clsx(
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0',
                        TASK_COLORS[task.task_type]
                      )}>
                        <Icon className="w-3 h-3" />
                        {task.task_type}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Weekly progress */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-gold" />
              <h2 className="font-display text-base text-ink">This Week</h2>
            </div>
            <div className="flex items-end justify-between gap-1.5 h-16">
              {week.map((day) => {
                const dayPct = day.total_count ? day.completed_count / day.total_count : 0
                const isToday = day.date === new Date().toISOString().slice(0, 10)
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-border rounded-sm overflow-hidden" style={{ height: 40 }}>
                      <div
                        className={clsx(
                          'w-full rounded-sm transition-all duration-500',
                          dayPct === 1 ? 'bg-gold' : dayPct > 0 ? 'bg-gold/50' : 'bg-transparent'
                        )}
                        style={{ height: `${dayPct * 100}%`, marginTop: `${(1 - dayPct) * 100}%` }}
                      />
                    </div>
                    <span className={clsx(
                      'text-[10px]',
                      isToday ? 'text-gold font-semibold' : 'text-ink-faint'
                    )}>
                      {format(new Date(day.date + 'T12:00:00'), 'EEE').slice(0, 2)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4 animate-fade-up animate-delay-300">
          {/* Accountability Partner */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gold" />
              <h2 className="font-display text-base text-ink">Study Partner</h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-gold">F</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Fatima Hassan</p>
                <p className="text-xs text-ink-faint">Your accountability partner</p>
              </div>
            </div>
            <a
              href="https://wa.me/971501234568"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg
                         bg-emerald-50 text-emerald-600 text-xs font-medium border border-emerald-200
                         hover:bg-emerald-100 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Message on WhatsApp
            </a>
          </div>

          {/* Quick stats */}
          <div className="card p-5 space-y-3">
            <h2 className="font-display text-base text-ink">Your Stats</h2>
            <Stat label="Today's progress" value={`${pct}%`} color="text-gold" />
            <Stat label="Tasks completed" value={`${completedCount}/${totalCount}`} color="text-ink" />
            <Stat label="Streak" value="4 days 🔥" color="text-amber-500" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-faint">{label}</span>
      <span className={clsx('text-sm font-semibold', color)}>{value}</span>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
