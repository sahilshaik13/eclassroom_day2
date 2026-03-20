// TeacherStudyPlanPage component
import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, Circle, Calendar, Layers, Target, Sparkles, Flame } from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface ClassItem { id: string; name: string }
interface Task {
    id: string
    title: string
    description?: string
    task_type: string
    day_number: number
    order_index: number
}
interface DayGroup { day: number; tasks: Task[] }

const TASK_ICONS: Record<string, React.ReactNode> = {
    memorise: <Target className="h-3.5 w-3.5" />,
    review: <Sparkles className="h-3.5 w-3.5" />,
    recite: <Flame className="h-3.5 w-3.5" />,
    listen: <BookOpen className="h-3.5 w-3.5" />,
    read: <Calendar className="h-3.5 w-3.5" />,
}

const TASK_COLORS: Record<string, string> = {
    memorise: 'text-blue-600 bg-blue-50 border-blue-100',
    review: 'text-amber-500 bg-amber-50 border-amber-100',
    recite: 'text-rose-500 bg-rose-50 border-rose-100',
    listen: 'text-indigo-500 bg-indigo-50 border-indigo-100',
    read: 'text-emerald-500 bg-emerald-50 border-emerald-100',
}

export default function TeacherStudyPlanPage() {
    const [classes, setClasses] = useState<ClassItem[]>([])
    const [selectedClassId, setSelectedClassId] = useState('')
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(false)
    const [loadingClasses, setLoadingClasses] = useState(true)
    const [openDay, setOpenDay] = useState<number>(1)

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
        setTasks([])

        api.get(`/teacher/study-plan?class_id=${selectedClassId}`)
            .then(r => {
                const data = r.data.data || []
                setTasks(data)
                if (data.length > 0) setOpenDay(data[0].day_number || 1)
            })
            .catch(() => {
                // Fallback: try fetching via admin endpoint
                api.get(`/admin/classes/${selectedClassId}/tasks`)
                    .then(r => setTasks(r.data.data || []))
                    .catch(() => setTasks([]))
            })
            .finally(() => setLoading(false))
    }, [selectedClassId])

    // Group tasks by day
    const byDay: Record<number, Task[]> = {}
    tasks.forEach(t => {
        if (!byDay[t.day_number]) byDay[t.day_number] = []
        byDay[t.day_number].push(t)
    })
    const groups: DayGroup[] = Object.entries(byDay)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([day, tasks]) => ({ day: Number(day), tasks }))

    const selectedClassName = classes.find(c => c.id === selectedClassId)?.name || ''

    return (
        <DashboardPageLayout
            title="Study Plan"
            description="View the curriculum assigned to your classes."
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
                        <div className="flex items-center gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                                <BookOpen className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-base font-bold text-slate-900">{selectedClassName}</p>
                                <p className="text-xs text-slate-400">
                                    {groups.length > 0
                                        ? `${groups.length} learning days · ${tasks.length} total tasks`
                                        : 'No curriculum assigned yet'}
                                </p>
                            </div>
                            {groups.length > 0 && (
                                <Badge className="ml-auto bg-blue-50 text-blue-700 border-blue-100 text-[10px] font-bold">
                                    Active Plan
                                </Badge>
                            )}
                        </div>

                        {loading ? (
                            <div className="space-y-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-2xl" />
                                ))}
                            </div>
                        ) : groups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                <BookOpen className="h-10 w-10 text-slate-300 mb-3" />
                                <h3 className="text-sm font-bold text-slate-700">No study plan assigned</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                                    Ask your admin to apply a study plan template to this class.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {groups.map(({ day, tasks: dayTasks }) => {
                                    const isOpen = openDay === day
                                    return (
                                        <div
                                            key={day}
                                            className={clsx(
                                                'bg-white rounded-2xl border overflow-hidden transition-all duration-300',
                                                isOpen ? 'border-blue-200 shadow-sm' : 'border-slate-200'
                                            )}
                                        >
                                            <button
                                                onClick={() => setOpenDay(isOpen ? -1 : day)}
                                                className="w-full flex items-center justify-between p-4 text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={clsx(
                                                        'h-10 w-10 rounded-xl text-xs font-black flex items-center justify-center transition-all',
                                                        isOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                                    )}>
                                                        {day}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">Day {day}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                                                            {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={clsx(
                                                    'h-7 w-7 rounded-full flex items-center justify-center transition-all',
                                                    isOpen ? 'bg-blue-100 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-400'
                                                )}>
                                                    <ChevronDown className="h-4 w-4" />
                                                </div>
                                            </button>

                                            {isOpen && (
                                                <div className="px-4 pb-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div className="h-px bg-slate-100 mb-3" />
                                                    {dayTasks.map(task => (
                                                        <div
                                                            key={task.id}
                                                            className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100"
                                                        >
                                                            <div className={clsx(
                                                                'h-8 w-8 rounded-lg flex items-center justify-center border shrink-0',
                                                                TASK_COLORS[task.task_type] || 'bg-slate-100 text-slate-400 border-slate-200'
                                                            )}>
                                                                {TASK_ICONS[task.task_type] || <Circle className="h-3.5 w-3.5" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-slate-900 truncate">{task.title}</p>
                                                                {task.description && (
                                                                    <p className="text-xs text-slate-400 mt-0.5 truncate">{task.description}</p>
                                                                )}
                                                            </div>
                                                            <span className={clsx(
                                                                'text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide shrink-0',
                                                                TASK_COLORS[task.task_type] || 'bg-slate-100 text-slate-500 border-slate-200'
                                                            )}>
                                                                {task.task_type}
                                                            </span>
                                                        </div>
                                                    ))}
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