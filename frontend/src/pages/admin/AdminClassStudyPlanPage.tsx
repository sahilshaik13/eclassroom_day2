import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BookOpen, Loader2, Plus, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import StudyPlanBuilder, { Day, TaskType } from '@/components/study-plan/StudyPlanBuilder'
import { AdminStudyPlanImportCard } from '@/components/admin/AdminStudyPlanImportCard'

export default function AdminClassStudyPlanPage() {
    const { classId } = useParams()
    const navigate = useNavigate()
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState<Day[]>([])
    const [className, setClassName] = useState('')

    useEffect(() => {
        if (!classId) return
        loadData()
    }, [classId])

    const loadData = async () => {
        setLoading(true)
        try {
            // Load class info to get name
            const classRes = await api.get(`/admin/classes`)
            const cls = classRes.data.data.find((c: any) => c.id === classId)
            if (cls) setClassName(cls.name)

            // Load study plan
            const res = await api.get(`/admin/classrooms/${classId}/study-plan`)
            setPlan(res.data.data)
            setDays(res.data.data?.days || [])
        } catch (err) {
            toast.error("Failed to load classroom study plan")
        } finally {
            setLoading(false)
        }
    }

    const handleAddDay = async () => {
        if (!plan) return
        const nextDay = (days.length + 1)
        try {
            const res = await api.post('/admin/classroom-study-plans/days', {
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
            const res = await api.post('/admin/classroom-study-plans/periods', {
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
            await api.patch(`/admin/classroom-study-plans/periods/${period.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx] = { ...period, ...updates }
            setDays(newDays)
        } catch { toast.error("Failed to update period") }
    }

    const handleDeletePeriod = async (dayIdx: number, pIdx: number) => {
        const period = days[dayIdx].periods[pIdx]
        if (!confirm("Delete this period?")) return
        try {
            await api.delete(`/admin/classroom-study-plans/periods/${period.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods.splice(pIdx, 1)
            setDays(newDays)
            toast.success("Period deleted")
        } catch { toast.error("Failed to delete period") }
    }

    const handleAddTask = async (dayIdx: number, pIdx: number, type: TaskType) => {
        const period = days[dayIdx].periods[pIdx]
        const nextOrder = (period.tasks?.length || 0)
        try {
            const res = await api.post('/admin/classroom-study-plans/tasks', {
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
            await api.patch(`/admin/classroom-study-plans/tasks/${task.id}`, updates)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks[tIdx] = { ...task, ...updates }
            setDays(newDays)
        } catch { toast.error("Failed to update task") }
    }

    const handleDeleteTask = async (dayIdx: number, pIdx: number, tIdx: number) => {
    const task = days[dayIdx].periods[pIdx].tasks[tIdx]
        try {
            await api.delete(`/admin/classroom-study-plans/tasks/${task.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods[pIdx].tasks.splice(tIdx, 1)
            setDays(newDays)
            toast.success("Task deleted")
        } catch { toast.error("Failed to delete task") }
    }

    const handleUpdateDayDate = async (dayIdx: number, dateStr: string) => {
        const day = days[dayIdx]
        try {
            await api.patch(`/admin/classroom-study-plans/days/${day.id}`, { scheduled_date: dateStr })
            const newDays = [...days]
            newDays[dayIdx].scheduled_date = dateStr
            setDays(newDays)
            toast.success("Date updated")
        } catch { toast.error("Failed to update date") }
    }

    return (
        <DashboardPageLayout
            title={`Live Study Plan: ${className}`}
            description="You are editing the live study plan assigned to this classroom. Changes are visible to the teacher and students immediately."
            actions={
                <div className="flex items-center gap-3">
                    <Button variant="ghost" onClick={() => navigate('/admin/classes')} className="rounded-xl font-bold">
                        <ChevronLeft className="h-4 w-4 mr-2" /> Back
                    </Button>
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
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                ) : !plan ? (
                    <div className="space-y-6">
                        <AdminStudyPlanImportCard classId={classId!} className={className} onApplied={() => { void loadData() }} />
                        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                            <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
                            <h3 className="text-base font-bold text-slate-900">No live study plan assigned yet</h3>
                            <p className="text-sm text-slate-400 max-w-sm mt-2">
                                Upload a study-plan PDF above, review the OCR table, then apply it to generate the class plan.
                            </p>
                            <Button onClick={() => navigate('/admin/study-plans')} className="mt-6 bg-blue-600 text-white rounded-xl">
                                Open Study Plan Imports
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <AdminStudyPlanImportCard classId={classId!} className={className} onApplied={() => { void loadData() }} />
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
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}
