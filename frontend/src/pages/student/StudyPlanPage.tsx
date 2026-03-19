import { useEffect, useState } from 'react'
import { ChevronDown, CheckCircle2, Circle, BookOpen, Calendar, ArrowRight, Target, Flame, Sparkles, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Task } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Badge } from '@/components/ui/badge'

const TASK_ICONS: Record<string, React.ReactNode> = {
  memorise: <Target className="h-3.5 w-3.5" />,
  review: <Sparkles className="h-3.5 w-3.5" />,
  recite: <Flame className="h-3.5 w-3.5" />,
  listen: <BookOpen className="h-3.5 w-3.5" />,
  read: <Calendar className="h-3.5 w-3.5" />,
}

const TASK_COLORS: Record<string, string> = {
  memorise: 'text-primary bg-primary/10 border-primary/20',
  review: 'text-amber-500 bg-amber-50 border-amber-100',
  recite: 'text-rose-500 bg-rose-50 border-rose-100',
  listen: 'text-indigo-500 bg-indigo-50 border-indigo-100',
  read: 'text-emerald-500 bg-emerald-50 border-emerald-100',
}

interface DayGroup { day: number; date: string; tasks: Task[] }

export default function StudyPlanPage() {
  const [groups, setGroups] = useState<DayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<number>(1)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    api.get('/classroom/tasks/plan')
      .then(res => {
        const byDay: Record<number, { date: string; tasks: Task[] }> = {}
        for (const t of res.data.data as (Task & { assigned_date: string })[]) {
          if (!byDay[t.day_number]) byDay[t.day_number] = { date: t.assigned_date || '', tasks: [] }
          byDay[t.day_number].tasks.push(t)
        }
        const sorted = Object.entries(byDay)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([day, v]) => ({ day: Number(day), ...v }))
        setGroups(sorted)
        const todayStr = new Date().toISOString().slice(0, 10)
        const todayGroup = sorted.find(g => g.date === todayStr)
        if (todayGroup) setOpenDay(todayGroup.day)
      })
      .catch(() => toast.error('Could not load your curriculum'))
      .finally(() => setLoading(false))
  }, [])

  const toggleTask = async (task: Task) => {
    if (togglingId) return
    setTogglingId(task.id)
    setGroups(prev => prev.map(g => ({
      ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t),
    })))
    try {
      if (!task.completed) await api.post(`/classroom/tasks/${task.id}/complete`)
      else await api.delete(`/classroom/tasks/${task.id}/complete`)
      if (!task.completed) toast.success('Task marked as complete! 🌟')
    } catch {
      setGroups(prev => prev.map(g => ({
        ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, completed: task.completed } : t),
      })))
      toast.error('Connection error. Synchronization failed.')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <DashboardPageLayout
      title="Academy Curriculum"
      description="Your structured learning journey, mapped out day by day."
      actions={
        <Badge variant="outline" className="px-4 py-2 bg-slate-50 text-slate-500 border-slate-200 text-[10px] font-black uppercase tracking-widest">
          {groups.length} Learning Days Total
        </Badge>
      }
    >
      <div className="max-w-4xl mx-auto pb-20">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 w-full bg-slate-50 animate-pulse rounded-2xl border border-slate-100" />)}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <BookOpen className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="text-2xl font-black text-slate-900">Curriculum Pending</h3>
            <p className="text-slate-500 max-w-sm mt-3 leading-relaxed font-medium">
              Your instructor hasn't assigned a study plan to this class yet. Check back soon for your daily tasks.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ day, date: d, tasks }) => {
              const doneCount = tasks.filter(t => t.completed).length
              const isToday = d === new Date().toISOString().slice(0, 10)
              const isOpen = openDay === day
              const allDone = doneCount === tasks.length && tasks.length > 0

              return (
                <div
                  key={day}
                  className={clsx(
                    'group overflow-hidden rounded-[1.5rem] border transition-all duration-500',
                    isOpen ? 'border-primary/20 shadow-2xl shadow-primary/10 bg-white ring-4 ring-primary/5' : 'border-slate-200/50 bg-white/50 hover:bg-white hover:border-slate-300',
                    isToday && !isOpen && 'bg-primary/[0.02] border-primary/20'
                  )}
                >
                  <button
                    onClick={() => setOpenDay(isOpen ? -1 : day)}
                    className="w-full flex items-center justify-between p-5 text-left transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={clsx(
                        'h-12 w-12 rounded-2xl text-xs font-black flex items-center justify-center transition-all duration-500 shadow-sm',
                        isOpen ? 'bg-primary text-white rotate-6' : isToday ? 'bg-primary/20 text-primary' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200',
                        allDone && !isOpen && 'bg-emerald-100 text-emerald-600'
                      )}>
                        {allDone ? <CheckCircle2 className="h-5 w-5" /> : day}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-black text-slate-900 leading-none">Day {day}</h4>
                          {isToday && (
                            <Badge className="bg-primary text-[8px] font-black uppercase tracking-widest h-4 px-1.5 flex items-center">Today</Badge>
                          )}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1.5">
                          {doneCount} / {tasks.length} Modules Completed
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {allDone && !isOpen && (
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                          Complete
                        </div>
                      )}
                      <div className={clsx(
                        "h-8 w-8 rounded-full flex items-center justify-center text-slate-300 transition-all duration-300",
                        isOpen ? "bg-primary/10 text-primary rotate-180" : "bg-slate-50"
                      )}>
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 space-y-3 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="h-px bg-slate-100 w-full mb-4" />
                      {tasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => toggleTask(task)}
                          disabled={togglingId === task.id}
                          className={clsx(
                            'group/btn w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all duration-300 border relative overflow-hidden',
                            task.completed
                              ? 'bg-emerald-50/50 border-emerald-100 opacity-80'
                              : 'bg-white border-slate-200 hover:border-primary/40 hover:shadow-lg hover:shadow-slate-200/40 hover:-translate-y-0.5'
                          )}
                        >
                          <div className={clsx(
                            "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-500",
                            task.completed ? "bg-emerald-500 text-white" : "bg-slate-50 text-slate-300 group-hover/btn:bg-primary/10 group-hover/btn:text-primary"
                          )}>
                            {togglingId === task.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : task.completed ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <Circle className="h-5 w-5" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={clsx(
                                "flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border",
                                TASK_COLORS[task.task_type] || "bg-slate-50 text-slate-500"
                              )}>
                                {TASK_ICONS[task.task_type] || <ArrowRight className="h-3 w-3" />}
                                {task.task_type}
                              </span>
                            </div>
                            <p className={clsx(
                              'text-sm font-bold transition-all',
                              task.completed ? 'line-through text-slate-400' : 'text-slate-900 group-hover/btn:text-primary'
                            )}>
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-xs text-slate-400 mt-1 font-medium italic">{task.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardPageLayout>
  )
}
