import { useEffect, useState } from 'react'
import { BookOpen, Layers, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import StudyPlanBuilder, { Day, TaskType } from '@/components/study-plan/StudyPlanBuilder'
import { cn } from "@/lib/utils"

interface ClassItem { id: string; name: string }

export default function TeacherStudyPlanPage() {
    const [classes, setClasses] = useState<ClassItem[]>([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState<Day[]>([])
    const [className, setClassName] = useState('')

    // 1. Initial Load: Teacher's Classes
    useEffect(() => {
        api.get('/teacher/classes')
            .then(r => {
                const data = r.data.data || []
                setClasses(data)
                if (data.length > 0) setSelectedClassId(data[0].id)
                else setLoading(false)
            })
            .catch(() => {
                toast.error('Could not load classes')
                setLoading(false)
            })
    }, [])

    // 2. Load Plan when Class changes
    useEffect(() => {
        if (!selectedClassId) return
        loadPlanData()
    }, [selectedClassId])

    const loadPlanData = async () => {
        setLoading(true)
        try {
            const cls = classes.find(c => c.id === selectedClassId)
            if (cls) setClassName(cls.name)

            const res = await api.get(`/teacher/classrooms/${selectedClassId}/study-plan`)
            setPlan(res.data.data)
            setDays(res.data.data?.days || [])
        } catch (err) {
            toast.error("Failed to load study plan")
        } finally {
            setLoading(false)
        }
    }

    // ── CRUD Handlers (Cloned from Admin for perfect stability) ────────────────

    const handleAddDay = async () => {
        if (!plan) return
        const nextDay = (days.length + 1)
        try {
            const res = await api.post('/teacher/study-plans/days', {
                plan_id: plan.id,
                day_number: nextDay,
                scheduled_date: null
            })
            setDays([...days, { ...res.data.data, periods: [] }])
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success(`Day ${nextDay} added`)
        } catch { toast.error("Failed to add day") }
    }

    const handleAddPeriod = async (dayIdx: number) => {
        const day = days[dayIdx]
        const nextOrder = (day.periods?.length || 0)
        try {
            const res = await api.post('/teacher/study-plans/periods', {
                day_id: day.id,
                title: 'New Period',
                duration_minutes: 30,
                order_index: nextOrder
            })
            const newDays = [...days]
            newDays[dayIdx].periods = [...(newDays[dayIdx].periods || []), { ...res.data.data, tasks: [] }]
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
        } catch { toast.error("Failed to add period") }
    }

    const handleUpdatePeriod = async (dayIdx: number, pIdx: number, updates: any) => {
        const period = days[dayIdx].periods[pIdx]
        try {
            await api.patch(`/teacher/study-plans/periods/${period.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx] = { ...period, ...updates }
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
        } catch { toast.error("Failed to update period") }
    }

    const handleDeletePeriod = async (dayIdx: number, pIdx: number) => {
        const period = days[dayIdx].periods[pIdx]
        if (!confirm("Delete this period and all its tasks?")) return
        try {
            await api.delete(`/teacher/study-plans/periods/${period.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods.splice(pIdx, 1)
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success("Period deleted")
        } catch { toast.error("Failed to delete period") }
    }

    const handleAddTask = async (dayIdx: number, pIdx: number, type: TaskType) => {
        const period = days[dayIdx].periods[pIdx]
        const nextOrder = (period.tasks?.length || 0)
        try {
            const res = await api.post('/teacher/study-plans/tasks', {
                period_id: period.id,
                title: `New ${type} Task`,
                task_type: type,
                required: true,
                order_index: nextOrder,
                config: type === 'mcq' ? { questions: [] } : {}
            })
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks = [...(newDays[dayIdx].periods[pIdx].tasks || []), res.data.data]
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
        } catch { toast.error("Failed to add task") }
    }

    const handleUpdateTask = async (dayIdx: number, pIdx: number, tIdx: number, updates: any) => {
        const task = days[dayIdx].periods[pIdx].tasks[tIdx]
        try {
            await api.patch(`/teacher/study-plans/tasks/${task.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks[tIdx] = { ...task, ...updates }
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
        } catch { toast.error("Failed to update task") }
    }

    const handleDeleteTask = async (dayIdx: number, pIdx: number, tIdx: number) => {
        const task = days[dayIdx].periods[pIdx].tasks[tIdx]
        try {
            await api.delete(`/teacher/study-plans/tasks/${task.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks.splice(tIdx, 1)
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success("Task deleted")
        } catch { toast.error("Failed to delete task") }
    }

    const handleUpdateDayDate = async (dayIdx: number, dateStr: string) => {
        const day = days[dayIdx]
        try {
            await api.patch(`/teacher/study-plans/days/${day.id}`, { 
                scheduled_date: dateStr || null 
            })
            const newDays = [...days]
            newDays[dayIdx].scheduled_date = dateStr
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success("Date updated")
        } catch { toast.error("Failed to update date") }
    }

    const handleUpdateDayAccessibility = async (dayIdx: number, isAccessible: boolean) => {
        const day = days[dayIdx]
        try {
            await api.patch(`/teacher/study-plans/days/${day.id}`, { 
                is_accessible: isAccessible 
            })
            const newDays = [...days]
            newDays[dayIdx].is_accessible = isAccessible
            setDays(newDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success(isAccessible ? "Day unlocked for students" : "Day locked")
        } catch { toast.error("Failed to update accessibility") }
    }

    return (
        <DashboardPageLayout
            title="Classroom Curriculum"
            description="Manage the live study schedule and tasks assigned to your students."
            actions={
                <div className="flex items-center gap-3">
                    {classes.length > 1 && (
                        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                            <SelectTrigger className="w-52 h-11 border-slate-200 bg-white text-sm rounded-xl">
                                <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                            <SelectContent>
                                {classes.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {plan && (
                        <>
                            <Button 
                                onClick={async () => {
                                    try {
                                        await api.post(`/teacher/classrooms/${selectedClassId}/publish`);
                                        const now = new Date().toISOString();
                                        setPlan({ ...plan, status: 'active', published_at: now, updated_at: now });
                                        toast.success("Curriculum published to students!");
                                    } catch {
                                        toast.error("Failed to publish curriculum");
                                    }
                                }}
                                disabled={plan.status === 'active' && plan.published_at && new Date(plan.updated_at) <= new Date(plan.published_at)}
                                className={cn(
                                    "rounded-xl gap-2 h-11 px-5 font-bold transition-all",
                                    plan.status === 'active' 
                                        ? (plan.published_at && new Date(plan.updated_at) <= new Date(plan.published_at)
                                            ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                                            : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100")
                                        : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100"
                                )}
                            >
                                <BookOpen className="h-4 w-4" />
                                {plan.status === 'active' 
                                    ? (plan.published_at && new Date(plan.updated_at) <= new Date(plan.published_at) ? 'Synced' : 'Sync Updates') 
                                    : 'Publish to Students'}
                            </Button>

                            <Button 
                                onClick={handleAddDay}
                                className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl gap-2 h-11 px-5 font-bold"
                            >
                                <Plus className="h-4 w-4" /> Add Day
                            </Button>
                        </>
                    )}
                </div>
            }
        >
            <div className="space-y-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <p className="text-slate-400 text-sm font-medium">Synchronizing curriculum...</p>
                    </div>
                ) : classes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <Layers className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-base font-bold text-slate-900">No classes assigned</h3>
                        <p className="text-sm text-slate-400 max-w-xs mt-2">Your admin needs to assign you to a class first.</p>
                    </div>
                ) : !plan ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-base font-bold text-slate-900">No study plan assigned</h3>
                        <p className="text-sm text-slate-400 max-w-xs mt-2">Ask your admin to apply a template to this classroom to start editing.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Header Info Bar */}
                        <div className="flex items-center gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-slate-900">{className}</p>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                    {plan.name} • {days.length} Days Structure
                                </p>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Editor Active</span>
                            </div>
                        </div>

                        <StudyPlanBuilder 
                            days={days}
                            onChange={setDays}
                            onAddPeriod={handleAddPeriod}
                            onUpdatePeriod={handleUpdatePeriod}
                            onDeletePeriod={handleDeletePeriod}
                            onAddTask={handleAddTask}
                            onUpdateTask={handleUpdateTask}
                            onDeleteTask={handleDeleteTask}
                            onUpdateDayDate={handleUpdateDayDate}
                            onUpdateDayAccessibility={handleUpdateDayAccessibility}
                        />
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}