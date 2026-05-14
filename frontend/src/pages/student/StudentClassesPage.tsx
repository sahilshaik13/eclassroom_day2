import { useEffect, useState } from 'react'
import { User, Video, Calendar, ChevronRight, Loader2, Search, Layers, Clock, CheckCircle2, Circle, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanPdfImport } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'
import TaskSubmissionModal from '@/components/student/TaskSubmissionModal'
import { StudyPlanSourceCard } from '@/components/study-plan/StudyPlanSourceCard'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'

interface Teacher {
  name: string
}

interface ClassItem {
  id: string
  name: string
  zoom_link?: string
  teacher: Teacher
}

export default function StudentClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null)
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [openDay, setOpenDay] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [planSource, setPlanSource] = useState<StudyPlanPdfImport | null>(null)

  useEffect(() => {
    api.get('/student/classes/my')
      .then(r => {
        setClasses(r.data.data || [])
        if (r.data.data?.length > 0) {
          handleSelectClass(r.data.data[0])
        }
      })
      .catch(() => toast.error('Could not load classes'))
      .finally(() => setLoading(false))
  }, [])

  const handleSelectClass = async (cls: ClassItem) => {
    setSelectedClass(cls)
    setLoadingPlan(true)
    setPlan(null)
    setPlanSource(null)
    setOpenDay(null)
    try {
      const [planRes, sourceRes] = await Promise.all([
        api.get(`/student/classes/${cls.id}/study-plan`),
        api.get(`/student/classes/${cls.id}/study-plan-source`).catch(() => ({ data: { data: null } })),
      ])
      setPlan(planRes.data.data)
      setPlanSource((sourceRes as any).data?.data || null)
      if (planRes.data.data?.days?.length > 0) {
        setOpenDay(planRes.data.data.days[0].id)
      }
    } catch {
      toast.error("Failed to load study plan")
    } finally {
      setLoadingPlan(false)
    }
  }

  if (loading) {
    return (
      <DashboardPageLayout title="My Learning Circles" description="Browse your enrolled classes and study plans.">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardPageLayout>
    )
  }

  return (
    <DashboardPageLayout
      title="My Learning Circles"
      description="View your enrolled classes and detailed multi-day study plans."
      className="space-y-3 sm:space-y-4"
    >
      <div className="space-y-4">
        {/* Class picker — same density pattern as Progress page */}
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Enrolled classes
          </h3>
          {classes.length === 0 ? (
            <Card className="rounded-xl border border-dashed border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-6 text-center">
                <Layers className="mb-2 h-8 w-8 text-slate-200" />
                <p className="text-xs font-bold text-slate-500">Not enrolled in any classes yet.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {classes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectClass(c)}
                    className={clsx(
                      'h-9 max-w-[85vw] shrink-0 truncate rounded-lg px-3 text-left text-xs font-black transition-all sm:max-w-none',
                      selectedClass?.id === c.id
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-500 hover:bg-slate-50',
                    )}
                    title={`${c.name} · ${c.teacher.name}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              {selectedClass && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                  <User className="h-3 w-3 shrink-0 text-slate-400" />
                  <span className="truncate">{selectedClass.teacher.name}</span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Study plan — aligned with Progress / Report card scale */}
        <div className="space-y-4">
          {!selectedClass ? (
            <Card className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-10 text-center">
                <Search className="mb-2 h-9 w-9 text-slate-200" />
                <h3 className="text-sm font-black text-slate-900">Select a class</h3>
                <p className="mt-1 max-w-xs text-xs font-semibold text-slate-500">
                  Choose a class above to view its study plan.
                </p>
              </CardContent>
            </Card>
          ) : loadingPlan ? (
            <Card className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <CardContent className="flex items-center justify-center py-14">
                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              </CardContent>
            </Card>
          ) : !plan ? (
            <Card className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <CardContent className="flex flex-col items-center px-4 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="text-base font-black text-slate-900">No study plan available</h3>
                <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-relaxed text-slate-500">
                  The teacher hasn&apos;t assigned a structured study plan for{' '}
                  <strong className="text-slate-700">{selectedClass.name}</strong> yet.
                </p>
                {selectedClass.zoom_link && (
                  <Button
                    className="mt-5 min-h-0 h-10 gap-2 rounded-xl bg-blue-600 px-5 text-xs font-black text-white shadow-md hover:bg-blue-700"
                    onClick={() => window.open(selectedClass.zoom_link, '_blank')}
                  >
                    <Video className="h-4 w-4 shrink-0" /> Join live class
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                    <Layers className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-slate-900">{plan.name}</h3>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      {plan.days.length} days · curriculum timeline
                    </p>
                  </div>
                </div>
                {selectedClass.zoom_link && (
                  <Button
                    variant="outline"
                    className="min-h-0 h-10 shrink-0 rounded-xl border-blue-200 px-4 text-xs font-black text-blue-600 hover:bg-blue-50"
                    onClick={() => window.open(selectedClass.zoom_link, '_blank')}
                  >
                    <Video className="h-4 w-4 shrink-0" /> Live Zoom
                  </Button>
                )}
              </div>

              <StudyPlanSourceCard
                source={planSource}
                title="Complete Study Plan"
                description="Full imported table and PDF for the selected class."
                emptyMessage="No PDF-backed study plan is available for this class yet."
              />

              <div className="space-y-3">
                {plan.days.map((day: any) => {
                  const isOpen = openDay === day.id
                  const taskCount = day.periods.reduce((acc: number, p: any) => acc + p.tasks.length, 0)
                  const completedTasks = day.periods.reduce((acc: number, p: any) => 
                    acc + p.tasks.filter((t: any) => t.study_plan_submissions?.length > 0).length, 0
                  )
                  const progress = taskCount > 0 ? Math.round((completedTasks / taskCount) * 100) : 0

                  return (
                    <div
                      key={day.id}
                      className={clsx(
                        'overflow-hidden rounded-xl border bg-white transition-all duration-200',
                        isOpen ? 'border-blue-200 shadow-md' : 'border-slate-100 shadow-sm',
                      )}
                    >
                      <div
                        className="flex cursor-pointer items-center justify-between px-3 py-3 sm:px-4"
                        onClick={() => setOpenDay(isOpen ? null : day.id)}
                      >
                        <div className="flex items-center gap-3">
                           <div className={clsx(
                             "h-9 w-9 rounded-lg flex items-center justify-center font-black text-xs",
                             day.is_locked ? "bg-slate-100 text-slate-300" : (progress === 100 ? "bg-emerald-500 text-white" : isOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400")
                           )}>
                              {day.is_locked ? <Lock className="h-3.5 w-3.5" /> : day.day_number}
                           </div>
                           <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <h4 className={clsx("text-sm font-black", day.is_locked ? "text-slate-400" : "text-slate-900")}>Day {day.day_number}</h4>
                                {day.scheduled_date && (
                                  <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-bold text-[10px] uppercase">
                                    {new Date(day.scheduled_date).toLocaleDateString()}
                                  </Badge>
                                )}
                                {day.is_locked && (
                                  <Badge className="bg-amber-50 text-amber-600 border-amber-100 font-black text-[9px] uppercase tracking-tighter">
                                    Locked
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">
                                {day.is_locked ? day.lock_reason : `${taskCount} Tasks • ${progress}% Completed`}
                              </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {!day.is_locked && progress > 0 && (
                             <div className="hidden md:block w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={clsx("h-full transition-all duration-1000", progress === 100 ? "bg-emerald-500" : "bg-blue-600")}
                                  style={{ width: `${progress}%` }}
                                />
                             </div>
                           )}
                           <div className={clsx(
                             "h-7 w-7 rounded-md flex items-center justify-center transition-all shrink-0",
                             day.is_locked ? "bg-slate-50 text-slate-200" : (isOpen ? "bg-blue-50 text-blue-600 rotate-180" : "bg-slate-50 text-slate-400")
                           )}>
                              <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                           </div>
                        </div>
                      </div>

                      {isOpen && !day.is_locked && (
                        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-3 pb-4 pt-3 sm:px-4">
                           {day.periods.map((period: any) => (
                             <div key={period.id} className="space-y-2 pt-2 first:pt-0">
                                <div className="flex items-center gap-2">
                                   <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                     {formatStudyPlanPeriodLabel(period.title, {
                                       scheduledDate: day.scheduled_date,
                                       dayNumber: day.day_number,
                                     })} ({period.duration_minutes}m)
                                   </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                   {period.tasks.map((task: any) => {
                                     const isDone = task.study_plan_submissions?.length > 0
                                     return (
                                       <button
                                         key={task.id}
                                         onClick={() => {
                                           if (!isDone) setSelectedTask(task)
                                         }}
                                         className={clsx(
                                           "flex w-full items-center gap-2.5 rounded-xl border p-3 text-left transition-all",
                                           isDone ? "cursor-default border-emerald-100 bg-emerald-50/30 opacity-60" : "cursor-pointer border-slate-100 bg-white shadow-sm hover:border-blue-200 hover:shadow"
                                         )}
                                       >
                                          <div className={clsx(
                                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                                            isDone ? "bg-emerald-100 text-emerald-600" : "bg-slate-50 text-slate-300"
                                          )}>
                                             {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                                          </div>
                                          <div className="min-w-0">
                                             <p className={clsx(
                                               "truncate text-[11px] font-bold sm:text-xs",
                                               isDone ? "text-emerald-700" : "text-slate-700"
                                             )}>{task.title}</p>
                                          </div>
                                       </button>
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
            </div>
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
            // Re-fetch plan to update checkmarks
            if (selectedClass) handleSelectClass(selectedClass)
            setSelectedTask(null)
          }}
        />
      )}
    </DashboardPageLayout>
  )
}
