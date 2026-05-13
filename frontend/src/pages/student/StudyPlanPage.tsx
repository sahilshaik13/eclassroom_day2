import { useEffect, useState } from 'react'
import { ChevronDown, CheckCircle2, Circle, BookOpen, Calendar, ArrowRight, Target, Flame, Sparkles, Clock, Send } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import TaskSubmissionModal from '@/components/student/TaskSubmissionModal'
import { StudyPlanCalendarPanel } from '@/components/study-plan/StudyPlanCalendarPanel'

const TASK_ICONS: Record<string, React.ReactNode> = {
  memorise: <Target className="h-3.5 w-3.5" />,
  review: <Sparkles className="h-3.5 w-3.5" />,
  recite: <Flame className="h-3.5 w-3.5" />,
  listen: <BookOpen className="h-3.5 w-3.5" />,
  read: <Calendar className="h-3.5 w-3.5" />,
  mcq: <CheckCircle2 className="h-3.5 w-3.5" />,
}

const TASK_COLORS: Record<string, string> = {
  memorise: 'text-blue-600 bg-blue-50 border-blue-100',
  review: 'text-amber-500 bg-amber-50 border-amber-100',
  recite: 'text-rose-500 bg-rose-50 border-rose-100',
  listen: 'text-indigo-500 bg-indigo-50 border-indigo-100',
  read: 'text-emerald-500 bg-emerald-50 border-emerald-100',
  mcq: 'text-violet-500 bg-violet-50 border-violet-100',
}

interface Task {
  id: string;
  title: string;
  description?: string;
  task_type: string;
  completed?: boolean;
  mcq_config?: unknown;
  config?: Record<string, unknown>;
  study_plan_submissions?: unknown[];
}

function isTaskCompleted(task: Task): boolean {
  if (task.completed) return true
  return Array.isArray(task.study_plan_submissions) && task.study_plan_submissions.length > 0
}

interface Period {
  id: string;
  title: string;
  duration_minutes: number;
  tasks: Task[];
}

interface Day {
  id: string;
  day_number: number;
  scheduled_date?: string;
  periods: Period[];
}

export default function StudyPlanPage() {
  const [days, setDays] = useState<Day[]>([])
  const [loading, setLoading] = useState(true)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [submittingTask, setSubmittingTask] = useState<Task | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/student/study-plan')
      .then(res => {
        const payload = res.data.data
        const sorted = (payload?.days || []).sort((a: Day, b: Day) => a.day_number - b.day_number)
        setDays(sorted)
        
        // Auto-open today or first day
        const todayStr = new Date().toISOString().slice(0, 10)
        const todayDay = sorted.find((d: Day) => d.scheduled_date === todayStr)
        if (todayDay) setOpenDay(todayDay.id)
        else if (sorted.length > 0) setOpenDay(sorted[0].id)
      })
      .catch(() => toast.error('Could not load your curriculum'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleTaskAction = (task: Task) => {
    if (isTaskCompleted(task) && task.task_type === 'mcq') {
       toast.error("MCQ already completed");
       return;
    }
    setSubmittingTask(task);
  }

  return (
    <DashboardPageLayout
      title="Academy Blueprint"
      description="Your personalized learning path, organized into structured daily modules."
      actions={
        <Badge variant="outline" className="px-4 py-2 bg-slate-900 text-white border-none text-[10px] font-black uppercase tracking-widest rounded-xl">
          {days.length} Learning Days
        </Badge>
      }
    >
      <div className="max-w-4xl mx-auto pb-20 space-y-6">
        {!loading && days.length > 0 && (
          <div className="space-y-6">
            <StudyPlanCalendarPanel days={days} readOnly anchorKey="student-plan" />
          </div>
        )}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-20 w-full bg-slate-50 animate-pulse rounded-3xl border border-slate-100" />)}
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[3rem] border border-slate-100 shadow-sm">
            <div className="h-24 w-24 bg-blue-50 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl shadow-blue-100/50">
              <BookOpen className="h-12 w-12 text-blue-400" />
            </div>
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">Curriculum Pending</h3>
            <p className="text-slate-500 max-w-sm mt-4 leading-relaxed font-bold text-lg">
              Your instructor is finalizing your learning journey. Check back shortly for your daily schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {days.map((day) => {
              const isOpen = openDay === day.id
              const todayStr = new Date().toISOString().slice(0, 10)
              const isToday = day.scheduled_date === todayStr
              const allTasks = day.periods.flatMap(p => p.tasks)
              const completedCount = allTasks.filter(t => isTaskCompleted(t)).length
              const totalCount = allTasks.length
              const isComplete = totalCount > 0 && completedCount === totalCount

              return (
                <div
                  key={day.id}
                  className={clsx(
                    'group overflow-hidden rounded-[2rem] border transition-all duration-500',
                    isOpen ? 'border-blue-200 shadow-2xl shadow-slate-200/50 bg-white' : 'border-slate-200/50 bg-white/50 hover:bg-white',
                    isToday && !isOpen && 'ring-2 ring-blue-600 ring-offset-2'
                  )}
                >
                  <button
                    onClick={() => setOpenDay(isOpen ? null : day.id)}
                    className="w-full flex items-center justify-between p-6 text-left transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className={clsx(
                        'h-14 w-14 rounded-2xl text-lg font-black flex items-center justify-center transition-all duration-500 shadow-lg',
                        isOpen ? 'bg-blue-600 text-white shadow-blue-200' : isToday ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200',
                        isComplete && !isOpen && 'bg-emerald-500 text-white shadow-emerald-100'
                      )}>
                        {isComplete ? <CheckCircle2 className="h-6 w-6" /> : day.day_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="text-xl font-black text-slate-900 tracking-tight">Day {day.day_number}</h4>
                          {isToday && (
                            <Badge className="bg-blue-600 text-[9px] font-black uppercase tracking-widest h-5 px-2">Today</Badge>
                          )}
                          {day.scheduled_date && (
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                {new Date(day.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                             </span>
                          )}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1.5 flex items-center gap-2">
                          <Target className="h-3 w-3" />
                          {completedCount} / {totalCount} Modules Completed
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {isComplete && !isOpen && (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[10px] font-black uppercase px-3 py-1">Success</Badge>
                      )}
                      <div className={clsx(
                        "h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300",
                        isOpen ? "bg-blue-50 text-blue-600 rotate-180" : "bg-slate-50 text-slate-300"
                      )}>
                        <ChevronDown className="h-5 w-5" />
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-8 space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="h-px bg-slate-100 w-full" />
                      
                      {day.periods.map((period) => (
                        <div key={period.id} className="space-y-4">
                          <div className="flex items-center gap-2 px-2">
                            <Clock className="h-4 w-4 text-slate-300" />
                            <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                              {period.title} ({period.duration_minutes}m)
                            </span>
                          </div>

                          <div className="grid gap-3">
                            {period.tasks.map((task) => {
                              const done = isTaskCompleted(task)
                              return (
                                <div
                                  key={task.id}
                                  className={clsx(
                                    'group/task flex w-full items-center gap-5 rounded-[1.5rem] border p-5 transition-all duration-300',
                                    done
                                      ? 'border-emerald-100/50 bg-emerald-50/30'
                                      : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-xl hover:shadow-slate-200/50'
                                  )}
                                >
                                  <div
                                    className={clsx(
                                      'flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-all duration-500',
                                      done ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-300 group-hover/task:bg-blue-50 group-hover/task:text-blue-600'
                                    )}
                                  >
                                    {done ? <CheckCircle2 className="h-6 w-6" /> : TASK_ICONS[task.task_type] || <Circle className="h-6 w-6" />}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center gap-2">
                                      <span
                                        className={clsx(
                                          'rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider',
                                          TASK_COLORS[task.task_type] || 'border-slate-200 bg-slate-50 text-slate-500'
                                        )}
                                      >
                                        {task.task_type}
                                      </span>
                                    </div>
                                    <p
                                      className={clsx(
                                        'text-base font-black tracking-tight transition-all',
                                        done ? 'text-slate-400' : 'text-slate-900 group-hover/task:text-blue-600'
                                      )}
                                    >
                                      {task.title}
                                    </p>
                                    {task.description && (
                                      <p className="mt-1.5 text-xs font-bold leading-relaxed text-slate-400">{task.description}</p>
                                    )}
                                  </div>

                                  <Button
                                    size="sm"
                                    variant={done ? 'ghost' : 'default'}
                                    onClick={() => handleTaskAction(task)}
                                    className={clsx(
                                      'h-10 gap-2 rounded-xl px-5 font-black text-xs transition-all',
                                      done ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-900 text-white shadow-lg hover:bg-blue-600'
                                    )}
                                  >
                                    {done ? (
                                      <>
                                        Submitted <ArrowRight className="h-3 w-3" />
                                      </>
                                    ) : (
                                      <>
                                        {task.task_type === 'mcq' ? 'Start Quiz' : 'Submit Work'} <Send className="h-3 w-3" />
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {submittingTask && (
        <TaskSubmissionModal 
          task={submittingTask}
          isOpen={!!submittingTask}
          onClose={() => setSubmittingTask(null)}
          onSuccess={load}
        />
      )}
    </DashboardPageLayout>
  )
}
