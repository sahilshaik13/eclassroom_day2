import { useEffect, useState } from 'react'
import { BookOpen, User, Video, Calendar, ChevronRight, Loader2, Search, Layers, Clock, CheckCircle2, Circle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'

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
    setOpenDay(null)
    try {
      const res = await api.get(`/student/classes/${cls.id}/study-plan`)
      setPlan(res.data.data)
      if (res.data.data?.days?.length > 0) {
        setOpenDay(res.data.data.days[0].id)
      }
    } catch {
      toast.error("Failed to load study plan")
    } finally {
      setLoadingPlan(false)
    }
  }

  if (loading) {
    return (
      <DashboardPageLayout title="My Classes" description="Browse your enrolled classes and study plans.">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </DashboardPageLayout>
    )
  }

  return (
    <DashboardPageLayout 
      title="My Learning Circles" 
      description="View your enrolled classes and detailed multi-day study plans."
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Classes List */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">Enrolled Classes</h3>
          {classes.length === 0 ? (
            <div className="p-8 bg-white rounded-3xl border border-dashed border-slate-200 text-center">
              <Layers className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500">Not enrolled in any classes yet.</p>
            </div>
          ) : (
            classes.map(c => (
              <Card 
                key={c.id}
                onClick={() => handleSelectClass(c)}
                className={clsx(
                  "cursor-pointer transition-all duration-300 border-none rounded-3xl overflow-hidden",
                  selectedClass?.id === c.id 
                    ? "ring-2 ring-blue-600 shadow-xl shadow-blue-100 bg-white" 
                    : "hover:bg-slate-50 bg-white border border-slate-100 shadow-sm"
                )}
              >
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={clsx(
                    "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors",
                    selectedClass?.id === c.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-slate-900 truncate">{c.name}</h4>
                    <div className="flex items-center gap-1 text-xs text-slate-400 font-bold mt-0.5">
                      <User className="h-3 w-3" />
                      <span>{c.teacher.name}</span>
                    </div>
                  </div>
                  <ChevronRight className={clsx(
                    "h-5 w-5 transition-transform",
                    selectedClass?.id === c.id ? "text-blue-600 translate-x-1" : "text-slate-200"
                  )} />
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Study Plan View */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedClass ? (
            <div className="flex flex-col items-center justify-center py-32 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 text-center">
               <Search className="h-12 w-12 text-slate-200 mb-4" />
               <h3 className="text-lg font-bold text-slate-900">Select a class</h3>
               <p className="text-sm text-slate-500 mt-1">Choose a class from the left to view its study plan.</p>
            </div>
          ) : loadingPlan ? (
            <div className="flex items-center justify-center py-32 bg-white rounded-3xl border border-slate-100 shadow-sm">
               <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : !plan ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100 shadow-sm text-center px-6">
               <div className="h-16 w-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-4">
                  <Calendar className="h-8 w-8" />
               </div>
               <h3 className="text-lg font-black text-slate-900">No Study Plan Available</h3>
               <p className="text-sm text-slate-500 max-w-xs mx-auto mt-2 leading-relaxed">
                  The teacher hasn't assigned a structured study plan for <strong>{selectedClass.name}</strong> yet.
               </p>
               {selectedClass.zoom_link && (
                 <Button 
                   className="mt-8 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-14 px-8 gap-3 font-black shadow-lg shadow-blue-100"
                   onClick={() => window.open(selectedClass.zoom_link, '_blank')}
                 >
                    <Video className="h-5 w-5" /> Join Live Class
                 </Button>
               )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                   <div className="h-14 w-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner">
                      <Layers className="h-7 w-7" />
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-slate-900">{plan.name}</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {plan.days.length} Days • Curriculum Timeline
                      </p>
                   </div>
                </div>
                {selectedClass.zoom_link && (
                  <Button 
                    variant="outline"
                    className="rounded-2xl h-11 border-blue-200 text-blue-600 hover:bg-blue-50 font-bold gap-2"
                    onClick={() => window.open(selectedClass.zoom_link, '_blank')}
                  >
                    <Video className="h-4 w-4" /> Live Zoom
                  </Button>
                )}
              </div>

              {/* Days List */}
              <div className="space-y-4">
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
                        "bg-white rounded-3xl border transition-all duration-300 overflow-hidden",
                        isOpen ? "border-blue-200 shadow-xl shadow-slate-200/50" : "border-slate-100 shadow-sm"
                      )}
                    >
                      <div 
                        className="p-5 px-6 flex items-center justify-between cursor-pointer"
                        onClick={() => setOpenDay(isOpen ? null : day.id)}
                      >
                        <div className="flex items-center gap-4">
                           <div className={clsx(
                             "h-10 w-10 rounded-xl flex items-center justify-center font-black text-sm",
                             progress === 100 ? "bg-emerald-500 text-white" : isOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400"
                           )}>
                              {day.day_number}
                           </div>
                           <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-black text-slate-900">Day {day.day_number}</h4>
                                {day.scheduled_date && (
                                  <Badge className="bg-slate-50 text-slate-400 border-slate-100 font-bold text-[10px] uppercase">
                                    {new Date(day.scheduled_date).toLocaleDateString()}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">
                                {taskCount} Tasks • {progress}% Completed
                              </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-4">
                           {progress > 0 && (
                             <div className="hidden md:block w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={clsx("h-full transition-all duration-1000", progress === 100 ? "bg-emerald-500" : "bg-blue-600")}
                                  style={{ width: `${progress}%` }}
                                />
                             </div>
                           )}
                           <div className={clsx(
                             "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                             isOpen ? "bg-blue-50 text-blue-600 rotate-180" : "bg-slate-50 text-slate-400"
                           )}>
                              <ChevronRight className="h-4 w-4 rotate-90" />
                           </div>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="px-6 pb-6 space-y-6 bg-slate-50/50 border-t border-slate-50">
                           {day.periods.map((period: any) => (
                             <div key={period.id} className="space-y-3 pt-5">
                                <div className="flex items-center gap-2">
                                   <Clock className="h-3 w-3 text-slate-400" />
                                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                     {period.title} ({period.duration_minutes}m)
                                   </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   {period.tasks.map((task: any) => {
                                     const isDone = task.study_plan_submissions?.length > 0
                                     return (
                                       <div 
                                         key={task.id}
                                         className={clsx(
                                           "p-4 rounded-2xl border transition-all flex items-center gap-3",
                                           isDone ? "bg-emerald-50/30 border-emerald-100" : "bg-white border-slate-100"
                                         )}
                                       >
                                          <div className={clsx(
                                            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                            isDone ? "bg-emerald-100 text-emerald-600" : "bg-slate-50 text-slate-300"
                                          )}>
                                             {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                                          </div>
                                          <div className="min-w-0">
                                             <p className={clsx(
                                               "text-xs font-bold truncate",
                                               isDone ? "text-emerald-700" : "text-slate-700"
                                             )}>{task.title}</p>
                                             <p className="text-[9px] text-slate-400 font-bold uppercase">{task.task_type}</p>
                                          </div>
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
            </div>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  )
}
