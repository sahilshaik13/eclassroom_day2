import { useEffect, useState } from 'react'
import { BookOpen, Layers, ChevronRight, Loader2, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import StudyPlanBuilder from '@/components/study-plan/StudyPlanBuilder'

interface ClassItem { id: string; name: string }

export default function TeacherStudyPlanPage() {
    const [classes, setClasses] = useState<ClassItem[]>([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [loadingClasses, setLoadingClasses] = useState(true)
    const [days, setDays] = useState<any[]>([])

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
                setDays(r.data.data?.days || [])
            })
            .catch(() => toast.error("Failed to load study plan"))
            .finally(() => setLoading(false))
    }, [selectedClassId])

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
        } catch { toast.error("Failed to add period") }
    }

    const handleUpdatePeriod = async (dayIdx: number, pIdx: number, updates: any) => {
        const period = days[dayIdx].periods[pIdx]
        try {
            await api.patch(`/teacher/study-plans/periods/${period.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx] = { ...period, ...updates }
            setDays(newDays)
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
            toast.success("Period deleted")
        } catch { toast.error("Failed to delete period") }
    }

    const handleAddTask = async (dayIdx: number, pIdx: number, type: string) => {
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
        } catch { toast.error("Failed to add task") }
    }

    const handleUpdateTask = async (dayIdx: number, pIdx: number, tIdx: number, updates: any) => {
        const task = days[dayIdx].periods[pIdx].tasks[tIdx]
        try {
            await api.patch(`/teacher/study-plans/tasks/${task.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks[tIdx] = { ...task, ...updates }
            setDays(newDays)
        } catch { toast.error("Failed to update task") }
    }

    const handleDeleteTask = async (dayIdx: number, pIdx: number, tIdx: number) => {
        const task = days[dayIdx].periods[pIdx].tasks[tIdx]
        try {
            await api.delete(`/teacher/study-plans/tasks/${task.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks.splice(tIdx, 1)
            setDays(newDays)
            toast.success("Task deleted")
        } catch { toast.error("Failed to delete task") }
    }

    const handleUpdateDayDate = async (dayIdx: number, dateStr: string) => {
        const day = days[dayIdx]
        try {
            await api.patch(`/teacher/study-plans/days/${day.id}`, { scheduled_date: dateStr })
            const newDays = [...days]
            newDays[dayIdx].scheduled_date = dateStr
            setDays(newDays)
            toast.success("Date updated")
        } catch { toast.error("Failed to update date") }
    }

    const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || ''

    return (
        <DashboardPageLayout
            title="Classroom Curriculum"
            description="Customize your class's study schedule, add tasks, and assign dates."
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
                        <Button 
                            onClick={handleAddDay}
                            className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl gap-2 h-11 px-5"
                        >
                            <Plus className="h-4 w-4" /> Add Day
                        </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-6">
                {loadingClasses ? (
                    <div className="space-y-3">
                        {[1, 2].map(i => <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />)}
                    </div>
                ) : classes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <Layers className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-base font-bold text-slate-900">No classes assigned</h3>
                        <p className="text-sm text-slate-400 max-w-xs mt-2">Your admin needs to assign you to a class first.</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-4 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-slate-900">{plan?.name || selectedClassName}</p>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                    {plan ? `${days.length} Days • Classroom-Specific Plan` : 'No plan assigned yet'}
                                </p>
                            </div>
                            {plan && (
                                <Badge className="ml-auto bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] font-black uppercase px-3 py-1">
                                    Live Editing Enabled
                                </Badge>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            </div>
                        ) : !plan ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
                                <h3 className="text-sm font-bold text-slate-700">No study plan assigned</h3>
                                <p className="text-xs text-slate-400 mt-2">Ask your admin to apply a template to this classroom.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
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
                                />
                                
                                <div className="p-6 bg-blue-50 rounded-3xl border border-blue-100 flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-blue-900">Need to see student progress?</h4>
                                        <p className="text-xs text-blue-700/70 font-medium">Review task completions and MCQ scores for this plan.</p>
                                    </div>
                                    <Button 
                                        className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 font-bold"
                                        onClick={() => toast.success("Opening Submissions Dashboard...")}
                                    >
                                        View Submissions <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardPageLayout>
    )
}