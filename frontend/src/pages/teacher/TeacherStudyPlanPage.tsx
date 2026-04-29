// TeacherStudyPlanPage component
import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, Circle, Calendar, Layers, Target, Sparkles, Flame, Clock, CheckCircle2, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ClassItem { id: string; name: string }
interface Task {
    id: string
    title: string
    description?: string
    task_type: string
    order_index: number
}
interface Period {
    id: string
    title: string
    duration_minutes: number
    tasks: Task[]
}
interface Day {
    id: string
    day_number: number
    scheduled_date?: string
    periods: Period[]
}

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

export default function TeacherStudyPlanPage() {
    const [classes, setClasses] = useState<ClassItem[]>([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [loadingClasses, setLoadingClasses] = useState(true)
    const [openDay, setOpenDay] = useState<string | null>(null)

    // Load teacher's classes
    useEffect(() => {
        api.get('/teacher/classes')
            .then(r => {
                const data = r.data.data || []
                setClasses(data)
                if (data.length > 0) setSelectedClassId(data[0].id)
            })
            .catch(() => toast.error('Could not load classes'))
            .finally(() => setLoadingClasses(false))
    }, [])

    // Load tasks when class changes
    useEffect(() => {
        if (!selectedClassId) return
        setLoading(true)
        setPlan(null)

        api.get(`/teacher/classrooms/${selectedClassId}/study-plan`)
            .then(r => {
                setPlan(r.data.data)
                if (r.data.data?.days?.length > 0) {
                    setOpenDay(r.data.data.days[0].id)
                }
            })
            .catch(() => toast.error("Failed to load study plan"))
            .finally(() => setLoading(false))
    }, [selectedClassId])

    const updateDayDate = async (dayId: string, dateStr: string) => {
        try {
            await api.patch(`/teacher/study-plans/days/${dayId}`, { scheduled_date: dateStr })
            setPlan((prev: any) => ({
                ...prev,
                days: prev.days.map((d: Day) => d.id === dayId ? { ...d, scheduled_date: dateStr } : d)
            }))
            toast.success("Date updated")
        } catch {
            toast.error("Failed to update date")
        }
    }

    const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || ''

    return (
        <DashboardPageLayout
            title="Classroom Curriculum"
            description="Manage your class's multi-day study schedule and assign dates."
            actions={
                classes.length > 1 ? (
                    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                        <SelectTrigger className="w-52 h-9 border-slate-200 bg-white text-sm">
                            <SelectValue placeholder="Select class">
                                {classes.find(c => c.id === selectedClassId)?.name}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {classes.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : undefined
            }
        >
            <div className="space-y-5">
                {loadingClasses ? (
                    <div className="space-y-3">
                        {[1, 2].map(i => <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-2xl" />)}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                            <Layers className="h-8 w-8 text-slate-300" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">No classes assigned</h3>
                        <p className="text-sm text-slate-400 max-w-xs mt-2 leading-relaxed">
                            Your admin needs to assign you to a class before you can view the study plan.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Class header */}
                        <div className="flex items-center gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-slate-900">{plan?.name || selectedClassName}</p>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                    {plan ? `${plan.days.length} Days • Classroom Blueprint` : 'No plan assigned yet'}
                                </p>
                            </div>
                            {plan && (
                                <Badge className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-black uppercase px-3 py-1">
                                    Live Curriculum
                                </Badge>
                            )}
                        </div>

                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-2xl" />
                                ))}
                            </div>
                        ) : !plan ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
                                <h3 className="text-sm font-bold text-slate-700">No study plan assigned</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                                    Ask your admin to apply a study plan template to this class.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {plan.days.map((day: Day) => {
                                    const isOpen = openDay === day.id
                                    return (
                                        <div
                                            key={day.id}
                                            className={clsx(
                                                'bg-white rounded-3xl border overflow-hidden transition-all duration-300',
                                                isOpen ? 'border-blue-200 shadow-xl shadow-slate-200/50' : 'border-slate-200 shadow-sm'
                                            )}
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center justify-between p-4 px-6 gap-4">
                                                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setOpenDay(isOpen ? null : day.id)}>
                                                    <div className={clsx(
                                                        'h-12 w-12 rounded-2xl text-base font-black flex items-center justify-center transition-all',
                                                        isOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                                    )}>
                                                        {day.day_number}
                                                    </div>
                                                    <div>
                                                        <p className="text-base font-black text-slate-900">Day {day.day_number}</p>
                                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                                                            {day.periods.length} Periods • {day.periods.reduce((acc, p) => acc + p.tasks.length, 0)} Tasks
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                                                        <Calendar className="h-3.5 w-3.5 text-slate-400 ml-2" />
                                                        <Input 
                                                            type="date"
                                                            value={day.scheduled_date || ''}
                                                            onChange={(e) => updateDayDate(day.id, e.target.value)}
                                                            className="h-8 border-none bg-transparent font-bold text-xs focus-visible:ring-0 w-32"
                                                        />
                                                    </div>
                                                    <Button 
                                                      variant="ghost" 
                                                      size="icon" 
                                                      className={clsx(
                                                        'h-10 w-10 rounded-xl transition-all',
                                                        isOpen ? 'bg-blue-50 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-400'
                                                      )}
                                                      onClick={() => setOpenDay(isOpen ? null : day.id)}
                                                    >
                                                        <ChevronDown className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {isOpen && (
                                                <div className="px-6 pb-6 space-y-6 bg-slate-50/50">
                                                    <div className="h-px bg-slate-100" />
                                                    {day.periods.map(period => (
                                                        <div key={period.id} className="space-y-3">
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">{period.title} ({period.duration_minutes}m)</h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                {period.tasks.map(task => (
                                                                    <div
                                                                        key={task.id}
                                                                        className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
                                                                    >
                                                                        <div className={clsx(
                                                                            'h-9 w-9 rounded-xl flex items-center justify-center border shrink-0',
                                                                            TASK_COLORS[task.task_type] || 'bg-slate-100 text-slate-400 border-slate-200'
                                                                        )}>
                                                                            {TASK_ICONS[task.task_type] || <Circle className="h-3.5 w-3.5" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-sm font-bold text-slate-900 truncate">{task.title}</p>
                                                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{task.task_type}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    
                                                    <div className="pt-2">
                                                       <Button 
                                                         className="w-full h-12 bg-white border border-slate-200 text-slate-900 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300"
                                                         onClick={() => toast.success("Opening Submissions Dashboard...")}
                                                       >
                                                          View Student Submissions for Day {day.day_number}
                                                          <ChevronRight className="h-4 w-4" />
                                                       </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardPageLayout>
    )
}