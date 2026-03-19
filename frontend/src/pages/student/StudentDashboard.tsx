import { useState, useEffect } from 'react'
import {
  CheckCircle2, Circle, BookOpen, Headphones, RotateCcw, Mic, FileText,
  TrendingUp, Users, Megaphone, ExternalLink, Loader2, Calendar, Target, Flame
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'
import type { Task, TaskType, WeekProgress } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

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
  memorise: 'text-indigo-600 bg-indigo-50 border-indigo-100',
  review:   'text-blue-600 bg-blue-50 border-blue-100',
  recite:   'text-violet-600 bg-violet-50 border-violet-100',
  listen:   'text-emerald-600 bg-emerald-50 border-emerald-100',
  read:     'text-amber-600 bg-amber-50 border-amber-100',
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
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t))
    setCompletingId(id)
    try {
      await new Promise((r) => setTimeout(r, 300))
      if (!task.completed) toast.success('MashaAllah! Progress saved.')
    } catch {
      setTasks((prev) => prev.map((t) => t.id === id ? { ...t, completed: task.completed } : t))
      toast.error('Connection error. Try again.')
    } finally {
      setCompletingId(null)
    }
  }

  const todayStr = format(new Date(), 'EEEE, d MMMM')

  return (
    <DashboardPageLayout
      title={`Good ${getGreeting()}, ${user?.name?.split(' ')[0] || 'Learner'}`}
      description={todayStr}
      actions={
        <Button variant="outline" className="gap-2 bg-white border-slate-200 text-slate-600 shadow-sm h-10 px-4 font-bold text-xs">
          <Calendar className="h-4 w-4" /> View Schedule
        </Button>
      }
    >
      <div className="space-y-8 pb-12">
        {/* Banner */}
        <div className="group relative overflow-hidden bg-gradient-to-r from-primary to-indigo-600 rounded-[2rem] p-8 text-white shadow-2xl shadow-primary/20 border border-white/10">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <Megaphone className="h-32 w-32 -rotate-12" />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-white/20">
              <Megaphone className="h-3 w-3" /> Latest Announcement
            </div>
            <h2 className="text-3xl font-black tracking-tight mb-2">Ramadan Mubarak! 🌙</h2>
            <p className="text-white/80 text-lg leading-relaxed font-medium">
              Classes continue as scheduled. Complete your daily tasks before Iftar to maintain your 4-day learning streak!
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Daily Workspace */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm">
              <CardHeader className="border-b border-slate-100 bg-slate-50/30 p-6 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-black text-slate-900">Today's Pulse</CardTitle>
                  <CardDescription>Stay on track with your daily learning goals.</CardDescription>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Completion</span>
                  <span className="text-sm font-black text-primary">{pct}%</span>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="h-3 bg-slate-100 rounded-full mb-8 overflow-hidden shadow-inner p-0.5 border border-slate-200/50">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-indigo-500 rounded-full transition-all duration-1000 ease-out shadow-lg shadow-primary/40 relative"
                    style={{ width: `${pct}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                  </div>
                </div>

                {loadingTasks ? (
                  <div className="space-y-4 py-4">
                    {[1, 2].map(i => <div key={i} className="h-20 w-full bg-slate-50 animate-pulse rounded-2xl" />)}
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="text-center py-16 bg-slate-50/50 rounded-[2rem] border border-dashed border-slate-200">
                    <CheckCircle2 className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h4 className="text-lg font-bold text-slate-900">All Done!</h4>
                    <p className="text-sm text-slate-500">You've completed all tasks for today.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {tasks.map((task) => {
                      const Icon = TASK_ICONS[task.task_type]
                      const isLoading = completingId === task.id
                      return (
                        <button
                          key={task.id}
                          onClick={() => toggleTask(task.id)}
                          disabled={isLoading}
                          className={clsx(
                            'group w-full flex items-center gap-5 p-5 rounded-[1.5rem] border transition-all duration-300 text-left relative overflow-hidden',
                            task.completed
                              ? 'bg-emerald-50/30 border-emerald-100 opacity-75'
                              : 'bg-white border-slate-200 hover:border-primary/40 hover:shadow-xl hover:shadow-slate-200/40 hover:-translate-y-0.5'
                          )}
                        >
                          <div className={clsx(
                            "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                            task.completed ? "bg-emerald-500 text-white rotate-[360deg]" : "bg-slate-50 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary"
                          )}>
                            {isLoading ? (
                              <Loader2 className="h-6 w-6 animate-spin" />
                            ) : task.completed ? (
                              <CheckCircle2 className="h-6 w-6" />
                            ) : (
                              <Circle className="h-6 w-6" />
                            )}
                          </div>

                          <div className="flex-1">
                            <h4 className={clsx(
                              "text-sm font-bold transition-all",
                              task.completed ? "text-slate-400 line-through" : "text-slate-900"
                            )}>
                              {task.title}
                            </h4>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className={clsx(
                                "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                                TASK_COLORS[task.task_type]
                              )}>
                                <Icon className="h-3 w-3" />
                                {task.task_type}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Day {task.day_number}</span>
                            </div>
                          </div>
                          
                          {!task.completed && (
                            <ChevronRight className="h-5 w-5 text-slate-200 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly Activity */}
            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm">
              <CardHeader className="p-6 pb-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 border border-indigo-100">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-slate-900">Consistency View</CardTitle>
                    <CardDescription>Visualizing your daily completion rate.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <div className="flex items-end justify-between gap-4 h-32 px-2">
                  {week.map((day) => {
                    const dayPct = day.total_count ? day.completed_count / day.total_count : 0
                    const isToday = day.date === new Date().toISOString().slice(0, 10)
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-4 group">
                        <div className="relative w-full max-w-[40px] bg-slate-100/50 rounded-[12px] h-32 overflow-hidden border border-slate-200/50 flex flex-col justify-end p-1">
                          {dayPct > 0 && (
                            <div
                              className={clsx(
                                'w-full rounded-[8px] transition-all duration-1000 shadow-sm relative',
                                dayPct === 1 ? 'bg-primary' : 'bg-primary/40'
                              )}
                              style={{ height: `${dayPct * 100}%` }}
                            >
                              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          )}
                        </div>
                        <span className={clsx(
                          'text-[10px] font-black uppercase tracking-wider transition-colors',
                          isToday ? 'text-primary scale-110' : 'text-slate-400'
                        )}>
                          {format(new Date(day.date + 'T12:00:00'), 'EEE')}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Side Panels */}
          <div className="space-y-8">
            {/* Quick Stats */}
            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white">
              <CardHeader className="p-6 flex flex-row items-center gap-3 space-y-0">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-black text-slate-900">Your Stats</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 space-y-6">
                <StatItem label="Completion Rate" value={`${pct}%`} color="text-primary" />
                <StatItem label="Tasks Closed" value={`${completedCount} / ${totalCount}`} color="text-slate-900" />
                <StatItem label="Active Streak" value="4 Days" color="text-amber-500" icon={<Flame className="h-4 w-4 fill-amber-500" />} />
              </CardContent>
            </Card>

            {/* Accountability Partner */}
            <Card className="border-none shadow-2xl shadow-emerald-200/40 bg-gradient-to-br from-emerald-600 to-teal-700 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Users className="h-24 w-24 translate-x-1/2 -translate-y-1/2" />
              </div>
              <CardContent className="p-8 relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight">Support Circle</h3>
                </div>
                
                <div className="flex items-center gap-5 mb-8">
                  <Avatar className="h-16 w-16 border-4 border-white/20 shadow-2xl ring-1 ring-white/10">
                     <AvatarFallback className="bg-white/10 text-white font-black text-xl">
                       FH
                     </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-black tracking-tight truncate">Fatima Hassan</p>
                    <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-0.5">Accountability Partner</p>
                  </div>
                </div>

                <a
                  href="https://wa.me/971501234568"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-center gap-3 w-full py-4 rounded-2xl bg-white text-emerald-700 text-sm font-black uppercase tracking-widest hover:bg-emerald-50 transition-all shadow-xl shadow-black/10 active:scale-95 border border-white"
                >
                  <ExternalLink className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                  Chat on WhatsApp
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  )
}

function StatItem({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-xs font-black uppercase text-slate-400 tracking-wider group-hover:text-slate-600 transition-colors uppercase">{label}</span>
      <div className="flex items-center gap-2">
        {icon}
        <span className={clsx('text-base font-black tabular-nums', color)}>{value}</span>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

const ChevronRight = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)
