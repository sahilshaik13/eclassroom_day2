import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Layers, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import StudyPlanBuilder, { Day, TaskType } from '@/components/study-plan/StudyPlanBuilder'
import { StudyPlanCalendarPanel } from '@/components/study-plan/StudyPlanCalendarPanel'
import { cn } from "@/lib/utils"

interface ClassItem { id: string; name: string }

export default function TeacherStudyPlanPage() {
    const [selectedClassId, setSelectedClassId] = useState('')
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState<Day[]>([])
    const [className, setClassName] = useState('')

    const { data: classes = [], isError: classesError } = useQuery({
        queryKey: queryKeys.teacher.classes(),
        queryFn: async () => (await api.get('/teacher/classes')).data.data || [] as ClassItem[],
    })

    useEffect(() => {
        if (classesError) toast.error('Could not load classes')
    }, [classesError])

    useEffect(() => {
        if (classes.length > 0 && !selectedClassId) setSelectedClassId(classes[0].id)
        if (classes.length === 0) setLoading(false)
    }, [classes, selectedClassId])

    // 2. Load Plan when Class changes
    useEffect(() => {
        if (!selectedClassId) return
        loadPlanData()
    }, [selectedClassId])

    const loadPlanData = async () => {
        setLoading(true)
        try {
            const cls = classes.find((c: ClassItem) => c.id === selectedClassId)
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

    const handleDeleteDay = async (dayIdx: number) => {
        const day = days[dayIdx]
        if (!confirm(`Delete Day ${day.day_number} and all its periods/tasks?`)) return
        try {
            await api.delete(`/teacher/study-plans/days/${day.id}`)
            const newDays = [...days]
            newDays.splice(dayIdx, 1)
            // Re-order day numbers
            const updatedDays = newDays.map((d, i) => ({ ...d, day_number: i + 1 }))
            setDays(updatedDays)
            setPlan({ ...plan, updated_at: new Date().toISOString() })
            toast.success("Day deleted")
        } catch { toast.error("Failed to delete day") }
    }

    return (
        <DashboardPageLayout
            title="Study plan"
            description="Calendar view plus optional structure editing for the selected class."
            actions={
                <div className="flex items-center gap-3">
                    {classes.length > 1 && (
                        <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                            <SelectTrigger className="w-52 h-11 border-slate-200 bg-white text-sm rounded-xl">
                                <SelectValue placeholder="Select class" />
                            </SelectTrigger>
                            <SelectContent>
                                {classes.map((c: ClassItem) => (
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
                        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-100">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xl font-black text-slate-900">{className}</p>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                    {plan.name} • {days.length} mapped days
                                </p>
                            </div>
                            <div className="flex items-center gap-2 sm:ml-auto">
                                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Synced template</span>
                            </div>
                        </div>

                        <Tabs defaultValue="calendar" className="w-full">
                            <TabsList className="grid w-full max-w-md grid-cols-2 rounded-xl bg-slate-100 p-1">
                                <TabsTrigger value="calendar" className="rounded-lg text-sm font-semibold">
                                    Calendar
                                </TabsTrigger>
                                <TabsTrigger value="structure" className="rounded-lg text-sm font-semibold">
                                    Structure editor
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="calendar" className="mt-6 space-y-6">
                                <StudyPlanCalendarPanel days={days} anchorKey={selectedClassId} />
                            </TabsContent>
                            <TabsContent value="structure" className="mt-6">
                                <StudyPlanBuilder
                                    days={days}
                                    onChange={setDays}
                                    onDeleteDay={handleDeleteDay}
                                    onAddPeriod={handleAddPeriod}
                                    onUpdatePeriod={handleUpdatePeriod}
                                    onDeletePeriod={handleDeletePeriod}
                                    onAddTask={handleAddTask}
                                    onUpdateTask={handleUpdateTask}
                                    onDeleteTask={handleDeleteTask}
                                    onUpdateDayDate={handleUpdateDayDate}
                                    onUpdateDayAccessibility={handleUpdateDayAccessibility}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}