import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { subscribeToStudyPlan } from '@/lib/realtime'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { BookOpen, ChevronLeft, Layers, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { StudyPlanPdfImport } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Day } from '@/components/study-plan/StudyPlanBuilder'
import type { CalendarPlanDay } from '@/components/study-plan/StudyPlanCalendarPanel'
import { StudyPlanCalendarPanel } from '@/components/study-plan/StudyPlanCalendarPanel'
import { StudyPlanDayCardEditor } from '@/components/study-plan/StudyPlanDayCardEditor'
import { StudyPlanPdfEmbed } from '@/components/study-plan/StudyPlanPdfEmbed'
import { AdminStudyPlanImportCard } from '@/components/admin/AdminStudyPlanImportCard'
import { AdminStudyPlanChangesPanel } from '@/components/admin/AdminStudyPlanChangesPanel'
import { TeacherStudyPlanDaySection } from '@/components/teacher/TeacherStudyPlanDaySection'
import {
    buildTaskPayloadForColumn,
    findDayIndexForDate,
    findTaskIndexForColumn,
    getEditablePlanColumns,
} from '@/lib/studyPlanPeriodColumns'

const ADMIN_PLAN_API = '/admin/classroom-study-plans'

export default function AdminClassStudyPlanPage() {
    const { classId } = useParams()
    const navigate = useNavigate()
    const [plan, setPlan] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState<Day[]>([])
    const [className, setClassName] = useState('')
    const [source, setSource] = useState<StudyPlanPdfImport | null>(null)
    const [importRefreshToken, setImportRefreshToken] = useState(0)
    const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null)
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date())
    const [isDayEditing, setIsDayEditing] = useState(false)
    const [dayEditorBusy, setDayEditorBusy] = useState(false)
    const [confirmRemoveDay, setConfirmRemoveDay] = useState(false)

    const userId = useAuthStore((s) => s.user?.id)

    const loadData = useCallback(async () => {
        if (!classId) return
        setLoading(true)
        try {
            const classRes = await api.get(`/admin/classes`)
            const cls = classRes.data.data.find((c: { id: string }) => c.id === classId)
            if (cls) setClassName(cls.name)

            const [planRes, sourceRes] = await Promise.all([
                api.get(`/admin/classrooms/${classId}/study-plan`),
                api.get(`/admin/classrooms/${classId}/study-plan-source`).catch(() => ({ data: { data: null } })),
            ])
            const payload = planRes.data.data ?? null
            setPlan(payload)
            setDays(payload?.days || [])
            setSource((sourceRes as { data?: { data?: StudyPlanPdfImport | null } }).data?.data ?? null)
            setSelectedDayIndex(null)
            setIsDayEditing(false)
            setSelectedCalendarDate(new Date())
        } catch {
            toast.error('Failed to load classroom study plan')
        } finally {
            setLoading(false)
        }
    }, [classId])

    useEffect(() => {
        if (!classId) return
        void loadData()
    }, [classId, loadData])

    useEffect(() => {
        if (!classId || !userId) return
        return subscribeToStudyPlan(classId, userId, 'admin', {
            planId: plan?.id,
            onRemoteChange: () => {
                void loadData()
            },
        })
    }, [classId, userId, loadData, plan?.id])

    const mergeTaskUpdates = (task: Day['periods'][0]['tasks'][0], updates: Record<string, unknown>) => {
        const next = { ...task, ...updates } as typeof task
        if (updates.config && typeof updates.config === 'object') {
            next.config = { ...(task.config ?? {}), ...(updates.config as Record<string, unknown>) }
        }
        return next
    }

    const handleAddDayForDate = async (date: Date): Promise<number> => {
        if (!plan) return -1
        const dateKey = format(date, 'yyyy-MM-dd')
        const existingIdx = findDayIndexForDate(days, dateKey)
        if (existingIdx >= 0) return existingIdx

        const nextDayNumber = days.reduce((max, d) => Math.max(max, d.day_number), 0) + 1
        const res = await api.post(`${ADMIN_PLAN_API}/days`, {
            plan_id: plan.id,
            day_number: nextDayNumber,
            scheduled_date: dateKey,
        })
        const newDay = { ...res.data.data, periods: [] } as Day
        const newDays = [...days, newDay]
        setDays(newDays)
        toast.success(`Plan added for ${format(date, 'MMM d')}`)
        return newDays.length - 1
    }

    const createPeriodWithColumnTasks = async (
        dayIdx: number,
        copyFromPeriodIndex?: number,
    ) => {
        const day = days[dayIdx]
        const columns = getEditablePlanColumns(source)
        const nextOrder = day.periods?.length ?? 0
        const copyFrom =
            copyFromPeriodIndex != null ? day.periods[copyFromPeriodIndex] : undefined

        const res = await api.post(`${ADMIN_PLAN_API}/periods`, {
            day_id: day.id,
            title: copyFrom?.title ?? (nextOrder === 0 ? '__flat_schedule__' : `Period ${nextOrder + 1}`),
            duration_minutes: copyFrom?.duration_minutes ?? (nextOrder === 0 ? 45 : 30),
            order_index: nextOrder,
        })
        const newPeriod = { ...res.data.data, tasks: [] as Day['periods'][0]['tasks'] }

        for (let i = 0; i < columns.length; i++) {
            const column = columns[i]
            const payload = buildTaskPayloadForColumn(column, '', source, i)
            payload.title = column
            payload.config = { ...payload.config, source_value: '' }

            const taskRes = await api.post(`${ADMIN_PLAN_API}/tasks`, {
                period_id: newPeriod.id,
                ...payload,
            })
            newPeriod.tasks.push(taskRes.data.data)
        }

        const newDays = [...days]
        newDays[dayIdx].periods = [...(newDays[dayIdx].periods || []), newPeriod]
        setDays(newDays)
        return newPeriod
    }

    const handleEnsurePeriod = async (dayIdx: number) => {
        if ((days[dayIdx].periods?.length ?? 0) > 0) return
        setDayEditorBusy(true)
        try {
            await createPeriodWithColumnTasks(dayIdx)
        } catch {
            toast.error('Failed to prepare period')
        } finally {
            setDayEditorBusy(false)
        }
    }

    const handleAddPeriodColumns = async (dayIdx: number, copyFromPeriodIndex?: number) => {
        setDayEditorBusy(true)
        try {
            await createPeriodWithColumnTasks(dayIdx, copyFromPeriodIndex)
            toast.success('Period added')
        } catch {
            toast.error('Failed to add period')
        } finally {
            setDayEditorBusy(false)
        }
    }

    const handleDeletePeriod = async (dayIdx: number, pIdx: number) => {
        const period = days[dayIdx].periods[pIdx]
        if (!confirm('Delete this period and all its column values?')) return
        setDayEditorBusy(true)
        try {
            await api.delete(`${ADMIN_PLAN_API}/periods/${period.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods.splice(pIdx, 1)
            setDays(newDays)
            toast.success('Period deleted')
        } catch {
            toast.error('Failed to delete period')
        } finally {
            setDayEditorBusy(false)
        }
    }

    const handleSaveColumn = async (
        dayIdx: number,
        pIdx: number,
        column: string,
        value: string,
    ) => {
        const period = days[dayIdx].periods[pIdx]
        const tIdx = findTaskIndexForColumn(period, column)
        const payload = buildTaskPayloadForColumn(column, value, source, tIdx >= 0 ? tIdx : period.tasks.length)

        setDayEditorBusy(true)
        try {
            if (tIdx >= 0) {
                const task = period.tasks[tIdx]
                if (!value.trim()) {
                    await api.patch(`${ADMIN_PLAN_API}/tasks/${task.id}`, {
                        title: column,
                        config: { ...(task.config ?? {}), source_value: '', ...payload.config },
                    })
                } else {
                    await api.patch(`${ADMIN_PLAN_API}/tasks/${task.id}`, payload)
                }
                const newDays = [...days]
                newDays[dayIdx].periods[pIdx].tasks[tIdx] = mergeTaskUpdates(period.tasks[tIdx], payload)
                setDays(newDays)
            } else if (value.trim()) {
                const res = await api.post(`${ADMIN_PLAN_API}/tasks`, {
                    period_id: period.id,
                    ...payload,
                })
                const newDays = [...days]
                newDays[dayIdx].periods[pIdx].tasks = [...period.tasks, res.data.data]
                setDays(newDays)
            }
        } catch {
            toast.error('Failed to save')
        } finally {
            setDayEditorBusy(false)
        }
    }

    const applyCalendarSelectDay = useCallback(
        (planDay: CalendarPlanDay | null, calendarDate: Date) => {
            setSelectedCalendarDate(calendarDate)
            setIsDayEditing(false)
            if (!planDay) {
                setSelectedDayIndex(null)
                return
            }
            const key = format(calendarDate, 'yyyy-MM-dd')
            const idx = findDayIndexForDate(days, key, planDay.day_number)
            setSelectedDayIndex(idx >= 0 ? idx : null)
        },
        [days],
    )

    const handleCalendarSelectDay = useCallback(
        (planDay: CalendarPlanDay | null, calendarDate: Date) => {
            applyCalendarSelectDay(planDay, calendarDate)
        },
        [applyCalendarSelectDay],
    )

    const selectedPlanDay = useMemo((): CalendarPlanDay | null => {
        if (selectedDayIndex != null && days[selectedDayIndex]) {
            return days[selectedDayIndex]
        }
        const key = format(selectedCalendarDate, 'yyyy-MM-dd')
        return days.find((d) => (d.scheduled_date ?? '').slice(0, 10) === key) ?? null
    }, [days, selectedDayIndex, selectedCalendarDate])

    const ensureDayForEditing = async (): Promise<number | null> => {
        if (selectedDayIndex != null) return selectedDayIndex
        setDayEditorBusy(true)
        try {
            const idx = await handleAddDayForDate(selectedCalendarDate)
            if (idx >= 0) setSelectedDayIndex(idx)
            return idx >= 0 ? idx : null
        } catch {
            toast.error('Failed to add plan for this date')
            return null
        } finally {
            setDayEditorBusy(false)
        }
    }

    const handleToggleDayEdit = async () => {
        if (isDayEditing) {
            setIsDayEditing(false)
            return
        }
        const dayIdx = selectedDayIndex ?? (await ensureDayForEditing())
        if (dayIdx == null) return
        setIsDayEditing(true)
        await handleEnsurePeriod(dayIdx)
    }

    const handleAddPlanForSelectedDate = async () => {
        const dayIdx = await ensureDayForEditing()
        if (dayIdx == null) return
        setIsDayEditing(true)
        await handleEnsurePeriod(dayIdx)
    }

    const resolveDayIndexForSelectedDate = (): number => {
        if (selectedDayIndex != null) return selectedDayIndex
        const key = format(selectedCalendarDate, 'yyyy-MM-dd')
        return findDayIndexForDate(days, key)
    }

    const handleRemovePlanForSelectedDate = async () => {
        const dayIdx = resolveDayIndexForSelectedDate()
        if (dayIdx < 0) return
        const day = days[dayIdx]
        if (!day?.id) return

        setDayEditorBusy(true)
        try {
            await api.delete(`${ADMIN_PLAN_API}/days/${day.id}`)
            const newDays = days.filter((_, i) => i !== dayIdx)
            setDays(newDays)
            setSelectedDayIndex(null)
            setIsDayEditing(false)
            toast.success(`Plan removed from ${format(selectedCalendarDate, 'MMM d')}`)
        } catch {
            toast.error('Failed to remove plan for this day')
        } finally {
            setDayEditorBusy(false)
            setConfirmRemoveDay(false)
        }
    }

    const onImportApplied = () => {
        setImportRefreshToken((t) => t + 1)
        void loadData()
    }

    const tabsKey = `${classId ?? ''}-${plan?.id ?? 'no-plan'}`

    return (
        <DashboardPageLayout
            title={className ? `Study plan · ${className}` : 'Class study plan'}
            description="Import the PDF, edit the live plan on the calendar, and review teacher timetable changes."
            actions={
                <Button variant="ghost" onClick={() => navigate('/admin/classes')} className="rounded-xl font-bold">
                    <ChevronLeft className="h-4 w-4 mr-2" /> Back to classes
                </Button>
            }
        >
            <div className="space-y-6">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                ) : (
                    <Tabs defaultValue={plan ? 'plan' : 'import'} key={tabsKey} className="w-full">
                        <TabsList className="grid w-full max-w-lg grid-cols-3 rounded-xl bg-slate-100 p-1">
                            <TabsTrigger value="import" className="rounded-lg text-sm font-semibold">
                                Import
                            </TabsTrigger>
                            <TabsTrigger value="plan" className="rounded-lg text-sm font-semibold" disabled={!plan}>
                                Plan
                            </TabsTrigger>
                            <TabsTrigger value="changes" className="rounded-lg text-sm font-semibold">
                                Changes
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="import" className="mt-6 space-y-6">
                            <AdminStudyPlanImportCard
                                classId={classId!}
                                className={className}
                                refreshToken={importRefreshToken}
                                onApplied={onImportApplied}
                            />
                            {!plan ? (
                                <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/50 px-6 py-14 text-center">
                                    <BookOpen className="mb-3 h-10 w-10 text-slate-300" />
                                    <h3 className="text-base font-semibold text-slate-800">No study plan yet</h3>
                                    <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                                        Upload and apply a study-plan PDF above. The teacher and students will see it
                                        once applied.
                                    </p>
                                </div>
                            ) : null}
                        </TabsContent>

                        <TabsContent value="plan" className="mt-6 space-y-4">
                            {plan ? (
                                <>
                                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
                                                <Layers className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 sm:text-base">
                                                    {className}
                                                </h3>
                                                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                                                    {plan.name} · {days.length} days
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <StudyPlanPdfEmbed
                                        pdfUrl={source?.pdf_url}
                                        title="Study plan PDF"
                                        filename={source?.original_filename}
                                        emptyMessage="No PDF is available for this class yet."
                                    />

                                    <StudyPlanCalendarPanel
                                        days={days}
                                        anchorKey={classId}
                                        calendarOnly
                                        onSelectDay={handleCalendarSelectDay}
                                    />

                                    <TeacherStudyPlanDaySection
                                        selectedDate={selectedCalendarDate}
                                        planDay={selectedPlanDay}
                                        isEditing={isDayEditing}
                                        busy={dayEditorBusy}
                                        onToggleEdit={() => void handleToggleDayEdit()}
                                        onAddPlanForDate={() => void handleAddPlanForSelectedDate()}
                                        onRemovePlanForDate={() => setConfirmRemoveDay(true)}
                                        dayEditor={
                                            selectedDayIndex != null ? (
                                                <StudyPlanDayCardEditor
                                                    day={days[selectedDayIndex]}
                                                    dayIndex={selectedDayIndex}
                                                    source={source}
                                                    busy={dayEditorBusy}
                                                    onEnsurePeriod={handleEnsurePeriod}
                                                    onAddPeriod={handleAddPeriodColumns}
                                                    onDeletePeriod={handleDeletePeriod}
                                                    onSaveColumn={handleSaveColumn}
                                                />
                                            ) : null
                                        }
                                    />
                                </>
                            ) : (
                                <p className="text-sm text-slate-500">
                                    Apply a study plan from the Import tab first.
                                </p>
                            )}
                        </TabsContent>

                        <TabsContent value="changes" className="mt-6">
                            {classId ? (
                                <AdminStudyPlanChangesPanel classId={classId} className={className} />
                            ) : null}
                        </TabsContent>
                    </Tabs>
                )}
            </div>

            <Dialog open={confirmRemoveDay} onOpenChange={setConfirmRemoveDay}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Remove plan from this day?</DialogTitle>
                        <DialogDescription className="text-left text-slate-600">
                            This removes all periods and tasks for{' '}
                            {format(selectedCalendarDate, 'EEEE, MMM d, yyyy')}. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button type="button" variant="outline" onClick={() => setConfirmRemoveDay(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            className="bg-red-600 text-white hover:bg-red-700"
                            disabled={dayEditorBusy}
                            onClick={() => void handleRemovePlanForSelectedDate()}
                        >
                            Remove plan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardPageLayout>
    )
}
