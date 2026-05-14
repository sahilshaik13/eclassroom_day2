import { useEffect, useState } from 'react'
import { 
  Loader2, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  ArrowRight,
  BookOpen,
  Headphones,
  FileText,
  HelpCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { clsx } from 'clsx'
import TaskSubmissionModal from '@/components/student/TaskSubmissionModal'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'

interface Task {
  id: string
  title: string
  description?: string
  task_type: string
  period_title: string
  plan_name: string
  scheduled_date?: string
  day_number: number
  status: string
  completed: boolean
  config?: any
}

const TASK_ICONS: Record<string, any> = {
  memorise: BookOpen,
  review: Clock,
  recite: Headphones,
  listen: Headphones,
  read: FileText,
  mcq: HelpCircle,
  written: FileText,
  reflection: BookOpen,
}

export default function StudentTodayPlanPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const fetchTasks = async () => {
    try {
      const res = await api.get('/student/tasks/today')
      setTasks(res.data.data || [])
    } catch {
      toast.error('Failed to load today\'s plan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  if (loading) {
    return (
      <DashboardPageLayout title="Today's Goal" description="Your learning path for today.">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardPageLayout>
    )
  }

  return (
    <DashboardPageLayout 
      title="Today's Goal" 
      description="Focus on completing your daily curriculum to stay on track."
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Progress Card */}
        <Card className="bg-slate-900 text-white border-none rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200">
          <CardContent className="p-8 md:p-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-black uppercase tracking-widest text-[10px]">
                  <Calendar className="h-3 w-3" />
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </div>
                <h2 className="text-3xl md:text-4xl font-black">Daily Progress</h2>
                <p className="text-slate-400 font-medium">You've completed {completedCount} out of {totalCount} tasks today.</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="relative h-24 w-24 flex items-center justify-center">
                   <svg className="w-full h-full transform -rotate-90">
                     <circle
                       cx="48" cy="48" r="40"
                       stroke="currentColor" strokeWidth="8"
                       fill="transparent" className="text-slate-800"
                     />
                     <circle
                       cx="48" cy="48" r="40"
                       stroke="currentColor" strokeWidth="8"
                       fill="transparent"
                       strokeDasharray={251.2}
                       strokeDashoffset={251.2 - (progress / 100) * 251.2}
                       className="text-blue-500 transition-all duration-1000 ease-out"
                       strokeLinecap="round"
                     />
                   </svg>
                   <span className="absolute text-xl font-black">{progress}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Task List */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Learning Path</h3>
          {tasks.length === 0 ? (
            <div className="p-12 bg-white rounded-[2rem] border border-dashed border-slate-200 text-center">
              <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                 <Calendar className="h-8 w-8 text-slate-300" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">No tasks scheduled for today</h4>
              <p className="text-sm text-slate-500 mt-1 max-w-xs mx-auto">Enjoy your day! You can check your full study plan in the classes section.</p>
            </div>
          ) : (
            tasks.map((task) => {
              const Icon = TASK_ICONS[task.task_type] || BookOpen
              const isDone = task.completed

              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={clsx(
                    "w-full flex items-center gap-4 p-6 rounded-[2rem] border transition-all duration-300 text-left group",
                    isDone 
                      ? "bg-slate-50/50 border-slate-100 opacity-75" 
                      : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-100/50"
                  )}
                >
                  <div className={clsx(
                    "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300",
                    isDone ? "bg-emerald-100 text-emerald-600" : "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white"
                  )}>
                    {isDone ? <CheckCircle2 className="h-7 w-7" /> : <Icon className="h-7 w-7" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        {formatStudyPlanPeriodLabel(task.period_title, {
                          scheduledDate: task.scheduled_date,
                          dayNumber: task.day_number,
                        })} • {task.plan_name}
                      </span>
                    </div>
                    <h4 className={clsx(
                      "text-lg font-black truncate",
                      isDone ? "text-slate-400 line-through" : "text-slate-900"
                    )}>
                      {task.title}
                    </h4>
                    {task.description && (
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{task.description}</p>
                    )}
                  </div>

                  <div className={clsx(
                    "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                    isDone ? "bg-emerald-50 text-emerald-500" : "bg-slate-50 text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600"
                  )}>
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Submission Modal */}
      {selectedTask && (
        <TaskSubmissionModal 
          task={selectedTask}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onSuccess={() => {
            fetchTasks()
            setSelectedTask(null)
          }}
        />
      )}
    </DashboardPageLayout>
  )
}
