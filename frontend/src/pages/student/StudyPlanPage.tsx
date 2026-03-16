import { useEffect, useState } from 'react'
import { ChevronDown, CheckCircle2, Circle, BookOpen } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Task } from '@/types'

const TASK_ICONS: Record<string, string> = {
  memorise: '🧠', review: '🔄', recite: '🎙️', listen: '👂', read: '📖',
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
        // Open today's day by default
        const todayStr = new Date().toISOString().slice(0, 10)
        const todayGroup = sorted.find(g => g.date === todayStr)
        if (todayGroup) setOpenDay(todayGroup.day)
      })
      .catch(() => toast.error('Could not load study plan'))
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
    } catch {
      setGroups(prev => prev.map(g => ({
        ...g, tasks: g.tasks.map(t => t.id === task.id ? { ...t, completed: task.completed } : t),
      })))
      toast.error('Could not update task')
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) return (
    <div className="p-6 space-y-3 max-w-2xl mx-auto">
      {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Study Plan</h1>
        <p className="text-sm text-ink-muted mt-0.5">Your full day-by-day curriculum</p>
      </div>

      {groups.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
          <p className="text-sm text-ink-muted">No study plan assigned yet.</p>
          <p className="text-xs text-ink-faint mt-1">Ask your admin to apply a template to your class.</p>
        </div>
      ) : (
        <div className="space-y-2 stagger">
          {groups.map(({ day, date: d, tasks }) => {
            const done = tasks.filter(t => t.completed).length
            const isToday = d === new Date().toISOString().slice(0, 10)
            const isOpen = openDay === day
            return (
              <div key={day} className={clsx(
                'rounded-2xl border transition-all',
                isOpen ? 'border-gold/30 shadow-sm' : 'border-border bg-white',
                isToday && !isOpen && 'border-gold/20 bg-gold/[0.01]',
              )}>
                <button
                  onClick={() => setOpenDay(isOpen ? -1 : day)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      'w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0',
                      isOpen ? 'bg-gold text-white' : isToday ? 'bg-gold/10 text-gold' : 'bg-surface-alt text-ink-muted',
                    )}>
                      {day}
                    </span>
                    <div>
                      <span className="text-sm font-semibold text-ink">Day {day}</span>
                      {isToday && <span className="ml-2 badge badge-gold text-[10px]">Today</span>}
                    </div>
                    <span className="text-xs text-ink-faint">{done}/{tasks.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {done === tasks.length && tasks.length > 0 && (
                      <span className="badge badge-green text-[10px]">✓ Done</span>
                    )}
                    <ChevronDown className={clsx(
                      'w-4 h-4 text-ink-faint transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 animate-fade-in">
                    {tasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => toggleTask(task)}
                        disabled={togglingId === task.id}
                        className={clsx(
                          'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all',
                          task.completed
                            ? 'bg-emerald-50 border border-emerald-100'
                            : 'bg-surface-alt border border-border hover:border-gold/30 hover:bg-gold/5',
                          togglingId === task.id && 'opacity-50 cursor-wait',
                        )}
                      >
                        {task.completed
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          : <Circle className="w-4 h-4 text-ink-faint mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={clsx(
                            'text-sm font-medium',
                            task.completed ? 'line-through text-ink-faint' : 'text-ink',
                          )}>
                            {TASK_ICONS[task.task_type] ?? '📌'} {task.title}
                          </p>
                          {task.description && (
                            <p className="text-xs text-ink-faint mt-0.5">{task.description}</p>
                          )}
                        </div>
                        <span className={clsx(
                          'badge shrink-0 mt-0.5 capitalize text-[10px]',
                          task.task_type === 'memorise' ? 'badge-gold'
                          : task.task_type === 'recite' ? 'badge-blue'
                          : task.task_type === 'review' ? 'badge-amber' : 'badge-green',
                        )}>
                          {task.task_type}
                        </span>
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
  )
}
