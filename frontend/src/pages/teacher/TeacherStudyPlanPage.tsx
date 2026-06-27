import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { format, isSameDay } from 'date-fns'
import { useBeforeUnload } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Layers, Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries'
import { subscribeToStudyPlan } from '@/lib/realtime'
import { useStudyPlanSyncStore } from '@/stores/studyPlanSyncStore'
import { useAuthStore } from '@/stores/authStore'
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
import type { Day } from '@/components/study-plan/StudyPlanBuilder'
import type { CalendarPlanDay } from '@/components/study-plan/StudyPlanCalendarPanel'
import { StudyPlanCalendarPanel } from '@/components/study-plan/StudyPlanCalendarPanel'
import { StudyPlanDayCardEditor } from '@/components/study-plan/StudyPlanDayCardEditor'
import { StudyPlanPdfEmbed } from '@/components/study-plan/StudyPlanPdfEmbed'
import { TeacherStudyPlanDaySection } from '@/components/teacher/TeacherStudyPlanDaySection'
import { TeacherClassMeetPanel } from '@/components/teacher/TeacherClassMeetPanel'
import {
  buildTaskPayloadForColumn,
  findDayIndexForDate,
  findTaskIndexForColumn,
  getEditablePlanColumns,
} from '@/lib/studyPlanPeriodColumns'
import { cn } from "@/lib/utils"

interface ClassItem { id: string; name: string }

async function fetchTeacherStudyPlan(classId: string) {
    try {
        const res = await api.get(`/teacher/classrooms/${classId}/study-plan`)
        return res.data.data as Record<string, unknown> | null
    } catch (err: unknown) {
        const status =
            err && typeof err === 'object' && 'response' in err
                ? (err as { response?: { status?: number } }).response?.status
                : undefined
        if (status === 404) return null
        throw err
    }
}

export default function TeacherStudyPlanPage() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [searchParams, setSearchParams] = useSearchParams()
    const user = useAuthStore((s) => s.user)
    const [selectedClassId, setSelectedClassId] = useState('')
    const [plan, setPlan] = useState<any>(null)
    const [days, setDays] = useState<Day[]>([])
    const hydratedClassRef = useRef<string | null>(null)
    const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null)
    const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date())
    const [isDayEditing, setIsDayEditing] = useState(false)
    const [dayEditorBusy, setDayEditorBusy] = useState(false)
    const [confirmDialog, setConfirmDialog] = useState<null | 'publish' | 'remove-day'>(null)
    const [publishing, setPublishing] = useState(false)
    const [savingPlan, setSavingPlan] = useState(false)

    const needsStudentSync = useStudyPlanSyncStore((s) => s.needsStudentSync)
    const hasPendingEdits = useStudyPlanSyncStore((s) => s.hasPendingEdits)
    const markNeedsStudentSync = useStudyPlanSyncStore((s) => s.markNeedsStudentSync)
    const resetOnPlanLoad = useStudyPlanSyncStore((s) => s.resetOnPlanLoad)
    const markSyncedToStudents = useStudyPlanSyncStore((s) => s.markSyncedToStudents)
    const needsLeaveGuard = needsStudentSync || hasPendingEdits

    useBeforeUnload(
        useCallback(
            (event) => {
                if (!needsLeaveGuard) return
                event.preventDefault()
                event.returnValue = ''
            },
            [needsLeaveGuard],
        ),
    )

    const { data: classes = [], isPending: classesLoading, isError: classesError } = useQuery({
        queryKey: queryKeys.teacher.classes(),
        queryFn: async () => (await api.get('/teacher/classes')).data.data || [] as ClassItem[],
        ...studyPlanQueryOptions(),
    })

    const {
        data: planFromQuery,
        isLoading: planQueryLoading,
        isFetching: planFetching,
        isError: planError,
    } = useQuery({
        queryKey: queryKeys.teacher.classroomStudyPlan(selectedClassId),
        queryFn: () => fetchTeacherStudyPlan(selectedClassId),
        enabled: !!selectedClassId,
        ...studyPlanQueryOptions(),
    })

    const { data: source = null } = useQuery({
        queryKey: queryKeys.teacher.classroomStudyPlanSource(selectedClassId),
        queryFn: async () => {
            try {
                const res = await api.get(`/teacher/classrooms/${selectedClassId}/study-plan-source`)
                return (res.data?.data ?? null) as StudyPlanPdfImport | null
            } catch {
                return null
            }
        },
        enabled: !!selectedClassId,
        ...studyPlanQueryOptions(),
    })

    const className = useMemo(
        () => classes.find((c: { id: string; name: string }) => c.id === selectedClassId)?.name ?? '',
        [classes, selectedClassId],
    )

    useEffect(() => {
        const status = searchParams.get('google_meet')
        if (!status) return
        const classFromUrl = searchParams.get('class_id')
        if (classFromUrl) setSelectedClassId(classFromUrl)
        if (status === 'connected') {
            const meetingError = searchParams.get('meeting_error')
            if (meetingError) {
                toast.error(
                    'Google is connected, but the meeting could not be saved. Try Create Meet again.',
                )
            } else {
                toast.success(
                    searchParams.get('meeting_created') === '1'
                        ? 'Google connected — meeting created'
                        : 'Google Calendar connected',
                )
            }
            const cid = classFromUrl || selectedClassId
            if (cid) {
                hydratedClassRef.current = null
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.teacher.classroomStudyPlan(cid),
                })
                void queryClient.invalidateQueries({
                    queryKey: queryKeys.teacher.classMeetings(cid),
                })
            }
        } else if (status === 'denied') {
            toast.error('Google authorization was cancelled')
        } else if (status === 'error') {
            toast.error('Google authorization failed')
        }
        const next = new URLSearchParams(searchParams)
        next.delete('google_meet')
        next.delete('class_id')
        next.delete('meeting_created')
        next.delete('meeting_error')
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams, queryClient])

    const replaceDays = useCallback(
        (newDays: Day[]) => {
            setDays(newDays)
            if (!selectedClassId) return
            queryClient.setQueryData(
                queryKeys.teacher.classroomStudyPlan(selectedClassId),
                (old: Record<string, unknown> | null | undefined) =>
                    old ? { ...old, days: newDays } : old,
            )
        },
        [selectedClassId, queryClient],
    )

    const replacePlan = useCallback(
        (next: Record<string, unknown> | null) => {
            setPlan(next)
            if (!selectedClassId) return
            queryClient.setQueryData(queryKeys.teacher.classroomStudyPlan(selectedClassId), next)
        },
        [selectedClassId, queryClient],
    )

    useEffect(() => {
        if (classesError) toast.error('Could not load classes')
    }, [classesError])

    useEffect(() => {
        if (planError) toast.error('Failed to load study plan')
    }, [planError])

    useEffect(() => {
        const classFromUrl = searchParams.get('class_id')
        if (classFromUrl) setSelectedClassId(classFromUrl)
    }, [searchParams])

    useEffect(() => {
        if (classes.length > 0 && !selectedClassId) setSelectedClassId(classes[0].id)
    }, [classes, selectedClassId])

    useLayoutEffect(() => {
        if (!selectedClassId || planFromQuery === undefined) return

        const hasLocalEdits = needsStudentSync || hasPendingEdits
        const alreadyHydrated = hydratedClassRef.current === selectedClassId

        // After OAuth redirect or refresh, local `plan` can be null while query has data
        if (!plan && planFromQuery) {
            setPlan(planFromQuery)
            setDays((planFromQuery?.days as Day[]) ?? [])
            if (!alreadyHydrated) {
                resetOnPlanLoad()
                hydratedClassRef.current = selectedClassId
            }
            return
        }

        if (alreadyHydrated && hasLocalEdits) return

        setPlan(planFromQuery)
        setDays((planFromQuery?.days as Day[]) ?? [])
        if (!alreadyHydrated) {
            resetOnPlanLoad()
            hydratedClassRef.current = selectedClassId
        }
    }, [plan, planFromQuery, selectedClassId, needsStudentSync, hasPendingEdits, resetOnPlanLoad])

    useEffect(() => {
        if (!selectedClassId || !user?.id) return
        const planId = (plan ?? planFromQuery)?.id as string | undefined
        return subscribeToStudyPlan(selectedClassId, user.id, 'teacher', {
            planId,
            tenantId: user.tenant_id ?? undefined,
            quiet: needsStudentSync || hasPendingEdits,
            onRemoteChange: () => {
                if (needsStudentSync || hasPendingEdits) return
                void queryClient.refetchQueries({
                    queryKey: queryKeys.teacher.classroomStudyPlan(selectedClassId),
                })
            },
        })
    }, [selectedClassId, user?.id, plan, planFromQuery, needsStudentSync, hasPendingEdits, queryClient])

    // ── CRUD Handlers (Cloned from Admin for perfect stability) ────────────────

    const handleAddDayForDate = async (date: Date): Promise<number> => {
        if (!plan) return -1
        const dateKey = format(date, 'yyyy-MM-dd')
        const existingIdx = findDayIndexForDate(days, dateKey)
        if (existingIdx >= 0) return existingIdx

        const nextDayNumber = days.reduce((max, d) => Math.max(max, d.day_number), 0) + 1
        const res = await api.post('/teacher/study-plans/days', {
            plan_id: plan.id,
            day_number: nextDayNumber,
            scheduled_date: dateKey,
        })
        const newDay = { ...res.data.data, periods: [] } as Day
        const newDays = [...days, newDay]
        replaceDays(newDays)
        markNeedsStudentSync()
        toast.success(`Plan added for ${format(date, 'MMM d')}`)
        return newDays.length - 1
    }

    const mergeTaskUpdates = (task: Day['periods'][0]['tasks'][0], updates: Record<string, unknown>) => {
        const next = { ...task, ...updates } as typeof task
        if (updates.config && typeof updates.config === 'object') {
            next.config = { ...(task.config ?? {}), ...(updates.config as Record<string, unknown>) }
        }
        return next
    }


    const createPeriodWithColumnTasks = async (
        dayIdx: number,
        copyFromPeriodIndex?: number,
        options?: { markSync?: boolean },
    ) => {
        const day = days[dayIdx]
        const columns = getEditablePlanColumns(source)
        const nextOrder = day.periods?.length ?? 0
        const copyFrom =
            copyFromPeriodIndex != null ? day.periods[copyFromPeriodIndex] : undefined

        const res = await api.post('/teacher/study-plans/periods', {
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

            const taskRes = await api.post('/teacher/study-plans/tasks', {
                period_id: newPeriod.id,
                ...payload,
            })
            newPeriod.tasks.push(taskRes.data.data)
        }

        const newDays = [...days]
        newDays[dayIdx].periods = [...(newDays[dayIdx].periods || []), newPeriod]
        replaceDays(newDays)
        if (options?.markSync !== false) {
            markNeedsStudentSync()
        }
        return newPeriod
    }

    const handleEnsurePeriod = async (dayIdx: number) => {
        if ((days[dayIdx].periods?.length ?? 0) > 0) return
        setDayEditorBusy(true)
        try {
            await createPeriodWithColumnTasks(dayIdx, undefined, { markSync: false })
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
            await api.delete(`/teacher/study-plans/periods/${period.id}`)
            const newDays = [...days]
            newDays[dayIdx].periods.splice(pIdx, 1)
            replaceDays(newDays)
            markNeedsStudentSync()
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
        value: string
    ) => {
        const period = days[dayIdx].periods[pIdx]
        const tIdx = findTaskIndexForColumn(period, column)
        const payload = buildTaskPayloadForColumn(column, value, source, tIdx >= 0 ? tIdx : period.tasks.length)

        setDayEditorBusy(true)
        try {
            if (tIdx >= 0) {
                const task = period.tasks[tIdx]
                if (!value.trim()) {
                    await api.patch(`/teacher/study-plans/tasks/${task.id}`, {
                        title: column,
                        config: { ...(task.config ?? {}), source_value: '', ...payload.config },
                    })
                } else {
                    await api.patch(`/teacher/study-plans/tasks/${task.id}`, payload)
                }
                const newDays = [...days]
                newDays[dayIdx].periods[pIdx].tasks[tIdx] = mergeTaskUpdates(period.tasks[tIdx], payload)
                replaceDays(newDays)
            } else if (value.trim()) {
                const res = await api.post('/teacher/study-plans/tasks', {
                    period_id: period.id,
                    ...payload,
                })
                const newDays = [...days]
                newDays[dayIdx].periods[pIdx].tasks = [...period.tasks, res.data.data]
                replaceDays(newDays)
            }
            markNeedsStudentSync()
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
        async (planDay: CalendarPlanDay | null, calendarDate: Date) => {
            if (!isSameDay(calendarDate, selectedCalendarDate)) {
                const choice = await useStudyPlanSyncStore.getState().askBeforeLeave()
                if (choice === 'stay') return
                if (choice === 'sync') {
                    const ok = await useStudyPlanSyncStore.getState().syncHandler?.()
                    if (!ok) return
                }
            }
            applyCalendarSelectDay(planDay, calendarDate)
        },
        [applyCalendarSelectDay, selectedCalendarDate],
    )

    const displayPlan = plan ?? (planFromQuery as Record<string, unknown> | null) ?? null
    const displayDays =
        days.length > 0 ? days : ((displayPlan?.days as Day[]) ?? [])

    const selectedPlanDay = useMemo((): CalendarPlanDay | null => {
        if (selectedDayIndex != null && displayDays[selectedDayIndex]) {
            return displayDays[selectedDayIndex]
        }
        const key = format(selectedCalendarDate, 'yyyy-MM-dd')
        return displayDays.find((d) => (d.scheduled_date ?? '').slice(0, 10) === key) ?? null
    }, [displayDays, selectedDayIndex, selectedCalendarDate])

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

    const requestRemovePlanForSelectedDate = () => {
        const dayIdx = resolveDayIndexForSelectedDate()
        if (dayIdx < 0 || !days[dayIdx]?.id) {
            toast.error('No plan to remove for this date')
            return
        }
        setConfirmDialog('remove-day')
    }

    const handleRemovePlanForSelectedDate = async () => {
        const dayIdx = resolveDayIndexForSelectedDate()
        if (dayIdx < 0) return
        const day = days[dayIdx]
        if (!day?.id) return

        setDayEditorBusy(true)
        try {
            await api.delete(`/teacher/study-plans/days/${day.id}`)
            const newDays = days.filter((_, i) => i !== dayIdx)
            replaceDays(newDays)
            setSelectedDayIndex(null)
            setIsDayEditing(false)
            markNeedsStudentSync()
            toast.success(`Plan removed from ${format(selectedCalendarDate, 'MMM d')}`)
        } catch {
            toast.error('Failed to remove plan for this day')
        } finally {
            setDayEditorBusy(false)
            setConfirmDialog(null)
        }
    }

    const savePendingEdits = useCallback(async (): Promise<boolean> => {
        const flush = useStudyPlanSyncStore.getState().flushPendingEditsHandler
        if (!flush) {
            if (!hasPendingEdits) {
                toast.success('All changes are already saved')
                return true
            }
            return false
        }
        setSavingPlan(true)
        try {
            const ok = await flush()
            if (ok) toast.success('Changes saved')
            else toast.error('Failed to save some changes')
            return ok
        } finally {
            setSavingPlan(false)
        }
    }, [hasPendingEdits])

    const syncToStudents = useCallback(async (): Promise<boolean> => {
        if (!plan || !selectedClassId) return false
        setPublishing(true)
        try {
            await api.post(`/teacher/classrooms/${selectedClassId}/publish`)
            const now = new Date().toISOString()
            replacePlan({ ...plan, status: 'active', published_at: now, updated_at: now })
            markSyncedToStudents()
            toast.success('Study plan synced to students')
            return true
        } catch {
            toast.error('Failed to sync study plan')
            return false
        } finally {
            setPublishing(false)
        }
    }, [plan, selectedClassId, markSyncedToStudents, replacePlan])

    const runPublish = async () => {
        if (hasPendingEdits) {
            const saved = await savePendingEdits()
            if (!saved) return
        }
        const ok = await syncToStudents()
        setConfirmDialog(null)
        return ok
    }

    useEffect(() => {
        useStudyPlanSyncStore.getState().setSyncHandler(syncToStudents)
        return () => useStudyPlanSyncStore.getState().setSyncHandler(null)
    }, [syncToStudents])

    const requestClassChange = async (classId: string) => {
        if (classId === selectedClassId) return
        const choice = await useStudyPlanSyncStore.getState().askBeforeLeave()
        if (choice === 'stay') return
        if (choice === 'sync') {
            const ok = await useStudyPlanSyncStore.getState().syncHandler?.()
            if (!ok) return
        }
        setSelectedClassId(classId)
    }

    const isPublishSynced = Boolean(plan?.published_at) && !needsStudentSync

    useEffect(() => {
        setSelectedDayIndex(null)
        setIsDayEditing(false)
        setSelectedCalendarDate(new Date())
        hydratedClassRef.current = null
    }, [selectedClassId])

    const showBlockingLoader =
        (classesLoading && classes.length === 0) ||
        (!!selectedClassId && planQueryLoading)

    return (
        <DashboardPageLayout
            title={t('teacher.studyPlan.title')}
            description={
                planFetching && !showBlockingLoader
                    ? t('teacher.studyPlan.descriptionUpdating')
                    : t('teacher.studyPlan.description')
            }
            actions={
                displayPlan ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {needsStudentSync ? (
                            <span className="hidden text-[10px] font-semibold text-amber-700 sm:inline">
                                Unsynced edits — students won&apos;t see changes until you sync
                            </span>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => void savePendingEdits()}
                            disabled={!hasPendingEdits || savingPlan || dayEditorBusy}
                            className={cn(
                                'h-10 gap-2 rounded-xl px-4 text-xs font-bold',
                                hasPendingEdits
                                    ? 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                                    : 'border-slate-200 text-slate-400',
                            )}
                        >
                            {savingPlan ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            Save
                        </Button>
                        <Button
                            type="button"
                            onClick={() => {
                                if (!needsStudentSync && !hasPendingEdits) return
                                if (hasPendingEdits) {
                                    void savePendingEdits().then((saved) => {
                                        if (saved) setConfirmDialog('publish')
                                    })
                                    return
                                }
                                setConfirmDialog('publish')
                            }}
                            disabled={(!needsStudentSync && !hasPendingEdits) || publishing || savingPlan}
                            className={cn(
                                'h-10 gap-2 rounded-xl px-4 text-xs font-bold transition-all',
                                !needsStudentSync
                                    ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 shadow-none'
                                    : 'border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
                            )}
                        >
                            <BookOpen className="h-4 w-4" />
                            {isPublishSynced
                                ? 'Synced'
                                : displayPlan.status === 'active'
                                  ? 'Sync updates'
                                  : 'Publish to students'}
                        </Button>
                    </div>
                ) : null
            }
        >
            <div className="space-y-6">
                {showBlockingLoader ? (
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
                ) : !displayPlan ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
                        <BookOpen className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-base font-bold text-slate-900">No study plan assigned</h3>
                        <p className="text-sm text-slate-400 max-w-xs mt-2">Ask your admin to apply a template to this classroom to start editing.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {classes.length > 1 ? (
                            <div className="flex flex-col gap-2">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Your classes
                                </h3>
                                <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                                    {classes.map((c: ClassItem) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => void requestClassChange(c.id)}
                                            className={clsx(
                                                'h-9 max-w-[85vw] shrink-0 truncate rounded-lg px-3 text-left text-xs font-black transition-all sm:max-w-none',
                                                selectedClassId === c.id
                                                    ? 'bg-slate-900 text-white shadow-md'
                                                    : 'text-slate-500 hover:bg-slate-50',
                                            )}
                                            title={c.name}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

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
                                        {displayPlan.name as string} · {displayDays.length} days
                                    </p>
                                </div>
                            </div>
                        </div>

                        {selectedClassId && className ? (
                            <TeacherClassMeetPanel
                                classId={selectedClassId}
                                className={className}
                                defaultDate={selectedCalendarDate}
                            />
                        ) : null}

                        <TeacherStudyPlanDaySection
                            selectedDate={selectedCalendarDate}
                            planDay={selectedPlanDay}
                            isEditing={isDayEditing}
                            busy={dayEditorBusy}
                            classId={selectedClassId}
                            className={className}
                            onToggleEdit={() => void handleToggleDayEdit()}
                            onAddPlanForDate={() => void handleAddPlanForSelectedDate()}
                            onRemovePlanForDate={requestRemovePlanForSelectedDate}
                            dayEditor={
                                selectedDayIndex != null ? (
                                    <StudyPlanDayCardEditor
                                        day={displayDays[selectedDayIndex]}
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

                        <StudyPlanCalendarPanel
                            days={displayDays}
                            anchorKey={selectedClassId}
                            calendarOnly
                            onSelectDay={handleCalendarSelectDay}
                        />

                        <StudyPlanPdfEmbed
                            pdfUrl={source?.pdf_url}
                            title="Study plan PDF"
                            filename={source?.original_filename}
                            emptyMessage="No PDF is available for this class yet."
                        />
                    </div>
                )}
            </div>

            <Dialog open={confirmDialog != null} onOpenChange={(open) => !open && setConfirmDialog(null)}>
                <DialogContent className="max-w-md">
                    {confirmDialog === 'publish' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>
                                    {plan?.status === 'active' ? 'Sync updates to students?' : 'Publish study plan?'}
                                </DialogTitle>
                                <DialogDescription className="text-left text-slate-600">
                                    Your edits are saved on this page, but students only see the plan after you sync.
                                    Syncing shares your latest calendar and task changes with the class.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-2 sm:gap-0">
                                <Button type="button" variant="outline" onClick={() => setConfirmDialog(null)}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    disabled={publishing}
                                    className="bg-blue-600 text-white hover:bg-blue-700"
                                    onClick={() => void runPublish()}
                                >
                                    {publishing ? 'Syncing…' : plan?.status === 'active' ? 'Sync now' : 'Publish'}
                                </Button>
                            </DialogFooter>
                        </>
                    ) : null}

                    {confirmDialog === 'remove-day' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>Remove plan from this day?</DialogTitle>
                                <DialogDescription className="text-left text-slate-600">
                                    This removes all periods and tasks for{' '}
                                    {format(selectedCalendarDate, 'EEEE, MMM d, yyyy')}. Students will not see a plan on
                                    this date after you sync. This cannot be undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter className="gap-2 sm:gap-0">
                                <Button type="button" variant="outline" onClick={() => setConfirmDialog(null)}>
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
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </DashboardPageLayout>
    )
}