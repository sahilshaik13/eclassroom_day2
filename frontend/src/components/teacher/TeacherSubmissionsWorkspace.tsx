import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Loader2,
  User,
  BadgeCheck,
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  FileText,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import clsx from 'clsx'
import { bandedTableHeadCellClass, bandedTableHeadClass, bandedTableRowClass, pendingReviewRowClass } from '@/lib/tableBandStyles'
import { motion, AnimatePresence } from 'framer-motion'

export type TeacherSubmissionsLayout = 'page' | 'embedded'

interface TeacherSubmissionsWorkspaceProps {
  layout?: TeacherSubmissionsLayout
}

export function TeacherSubmissionsWorkspace({ layout = 'page' }: TeacherSubmissionsWorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const embedded = layout === 'embedded'
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [progressData, setProgressData] = useState<any>(null)
  const [loadingProgress, setLoadingProgress] = useState(false)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [dayPage, setDayPage] = useState(0)
  const DAYS_PER_PAGE = 10
  const classesErrorToastShown = useRef(false)

  const {
    data: classes = [],
    isPending: classesPending,
    isError: classesError,
  } = useQuery({
    queryKey: queryKeys.teacher.classes(),
    queryFn: async () => {
      const res = await api.get('/teacher/classes')
      const list = res.data?.data
      return Array.isArray(list) ? list : []
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  const {
    data: students = [],
    isError: studentsError,
  } = useQuery({
    queryKey: queryKeys.teacher.studentsByClass(selectedClassId),
    enabled: !!selectedClassId,
    queryFn: async () => {
      const res = await api.get('/teacher/students', {
        params: { class_id: selectedClassId, page: 1, limit: 100 },
      })
      const list = res.data?.data
      return Array.isArray(list) ? list : []
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  const { data: pendingSubmissions = [] } = useQuery({
    queryKey: queryKeys.teacher.pendingSubmissions(),
    queryFn: async () => {
      const res = await api.get('/teacher/submissions/pending')
      const list = res.data?.data
      return Array.isArray(list) ? list : []
    },
    staleTime: 30_000,
    gcTime: 2 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  const loading = classesPending && classes.length === 0

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id)
    }
  }, [classes, selectedClassId])

  useEffect(() => {
    if (!classesError) {
      classesErrorToastShown.current = false
      return
    }
    if (classesErrorToastShown.current) return
    classesErrorToastShown.current = true
    toast.error(t('teacher.submissions.couldNotLoadClasses'))
  }, [classesError])

  useEffect(() => {
    if (!studentsError || embedded) return
    toast.error(t('teacher.submissions.couldNotLoadStudents'))
  }, [studentsError, embedded])

  const loadStudentProgress = async (studentId: string) => {
    if (!selectedClassId) return
    setLoadingProgress(true)
    try {
      const res = await api.get(`/teacher/students/${studentId}/study-plan/${selectedClassId}/progress`)
      setProgressData(res.data.data)
    } catch {
      toast.error(t('teacher.submissions.failedLoadProgress'))
    } finally {
      setLoadingProgress(false)
    }
  }

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student)
    loadStudentProgress(student.id)
  }

  useEffect(() => {
    if (!selectedStudent || !selectedClassId) return
    const studentClasses = selectedStudent.classes
    const isInNewClass =
      Array.isArray(studentClasses) &&
      studentClasses.some((c: { id?: string }) => c.id === selectedClassId)
    if (isInNewClass) {
      loadStudentProgress(selectedStudent.id)
    } else {
      setSelectedStudent(null)
      setProgressData(null)
    }
  }, [selectedClassId])

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (s: { classes?: { id: string }[] }) =>
          Array.isArray(s.classes) &&
          s.classes.some((c) => c.id === selectedClassId),
      ),
    [students, selectedClassId],
  )

  const classPendingSubmissions = useMemo(
    () =>
      pendingSubmissions.filter(
        (item: { class_id?: string }) =>
          !selectedClassId || !item.class_id || item.class_id === selectedClassId,
      ),
    [pendingSubmissions, selectedClassId],
  )

  /** Earliest pending submission per student (FCFS ordering). */
  const pendingByStudent = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of classPendingSubmissions) {
      const sid = String(item.student_id || '')
      const at = String(item.submitted_at || '')
      if (!sid) continue
      const existing = map.get(sid)
      if (!existing || (at && at < existing)) {
        map.set(sid, at)
      }
    }
    return map
  }, [classPendingSubmissions])

  const sortedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      const aPending = pendingByStudent.has(a.id)
      const bPending = pendingByStudent.has(b.id)
      if (aPending && !bPending) return -1
      if (!aPending && bPending) return 1
      if (aPending && bPending) {
        const aTime = pendingByStudent.get(a.id) || ''
        const bTime = pendingByStudent.get(b.id) || ''
        if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime)
      }
      return String(a.name || '').localeCompare(String(b.name || ''))
    })
  }, [filteredStudents, pendingByStudent])

  const pendingStudentCount = pendingByStudent.size

  const pagedDays = useMemo(() => {
    const source = Array.isArray(progressData?.days) ? [...progressData.days] : []
    source.sort((a: any, b: any) => {
      const da = a?.scheduled_date ? Date.parse(`${String(a.scheduled_date).slice(0, 10)}T12:00:00`) : 0
      const db = b?.scheduled_date ? Date.parse(`${String(b.scheduled_date).slice(0, 10)}T12:00:00`) : 0
      if (da && db && da !== db) return da - db
      return (a?.day_number || 0) - (b?.day_number || 0)
    })
    const totalPages = Math.max(1, Math.ceil(source.length / DAYS_PER_PAGE))
    const safePage = Math.min(dayPage, totalPages - 1)
    const start = safePage * DAYS_PER_PAGE
    return {
      totalPages,
      safePage,
      totalDays: source.length,
      days: source.slice(start, start + DAYS_PER_PAGE),
    }
  }, [progressData?.days, dayPage])

  useEffect(() => {
    const source = Array.isArray(progressData?.days) ? progressData.days : []
    if (!source.length) {
      setDayPage(0)
      return
    }
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const sorted = [...source].sort((a: any, b: any) => {
      const da = a?.scheduled_date ? Date.parse(`${String(a.scheduled_date).slice(0, 10)}T12:00:00`) : 0
      const db = b?.scheduled_date ? Date.parse(`${String(b.scheduled_date).slice(0, 10)}T12:00:00`) : 0
      if (da && db && da !== db) return da - db
      return (a?.day_number || 0) - (b?.day_number || 0)
    })
    const idx = sorted.findIndex((d: any) => String(d?.scheduled_date || '').slice(0, 10) === todayKey)
    setDayPage(idx >= 0 ? Math.floor(idx / DAYS_PER_PAGE) : 0)
    setExpandedDay(null)
  }, [progressData?.days, selectedStudent?.id])

  const classSelect = (
    <Select value={selectedClassId} onValueChange={setSelectedClassId}>
      <SelectTrigger
        className={clsx(
          embedded ? 'w-full sm:w-[200px] h-9 text-sm rounded-lg border-slate-200 bg-white' : 'w-[220px] rounded-xl font-bold border-slate-200 bg-white'
        )}
      >
        <SelectValue>{classes.find((c) => c.id === selectedClassId)?.name || t('teacher.submissions.selectClass')}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {classes.map((c) => (
          <SelectItem key={c.id} value={c.id} className={embedded ? 'text-sm' : 'font-bold'}>
            {c.name || t('teacher.submissions.unnamedClass')}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (loading) {
    const spinner = (
      <div className={clsx('flex items-center justify-center', embedded ? 'py-16' : 'h-[60vh]')}>
        <Loader2 className={clsx('animate-spin text-blue-600', embedded ? 'h-8 w-8' : 'h-12 w-12')} />
      </div>
    )
    if (embedded) {
      return (
        <section className="space-y-4">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t('teacher.submissions.title')}</h2>
              <p className="text-xs text-slate-500">{t('teacher.submissions.subtitle')}</p>
            </div>
          </header>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{spinner}</div>
        </section>
      )
    }
    return spinner
  }

  const inner = (
    <div
      className={clsx(
        'grid items-stretch gap-4',
        embedded ? 'min-h-[min(520px,58vh)] grid-cols-12' : 'grid-cols-1 gap-6 md:grid-cols-12 md:gap-6 lg:gap-8',
      )}
    >
      {/* Student list */}
      <div
        className={clsx(
          'flex min-h-0 flex-col',
          embedded ? 'col-span-4' : 'md:col-span-4 lg:col-span-3',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div
            className={clsx(
              'flex shrink-0 items-center justify-between border-b px-3 py-2.5',
              bandedTableHeadClass,
              bandedTableHeadCellClass,
            )}
          >
            <h3
              className={clsx(
                'uppercase tracking-wider text-slate-500',
                embedded ? 'text-[10px] font-semibold' : 'text-[10px] font-bold tracking-widest',
              )}
            >
              {t('nav.students')}
            </h3>
            <div className="flex items-center gap-1.5">
              {pendingStudentCount > 0 ? (
                <Badge className="h-5 rounded-md border-0 bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-900">
                  {t('teacher.submissions.awaitingReview', { count: pendingStudentCount })}
                </Badge>
              ) : null}
              <Badge
                variant="secondary"
                className={clsx(
                  'rounded-md border-0 bg-white/80 text-slate-600',
                  embedded ? 'h-5 px-1.5 py-0 text-[10px] font-normal' : 'rounded-lg px-2 py-0.5',
                )}
              >
                {filteredStudents.length}
              </Badge>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {(() => {
              let bandIndex = 0
              return sortedStudents.map((student) => {
              const isSelected = selectedStudent?.id === student.id
              const progress = student.progress
              const hasPendingReview = pendingByStudent.has(student.id)
              const pendingCount = classPendingSubmissions.filter(
                (p: { student_id?: string }) => p.student_id === student.id,
              ).length
              const rowBandIndex = hasPendingReview ? -1 : bandIndex++
              return (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => handleStudentSelect(student)}
                  className={clsx(
                    'flex w-full min-h-[56px] flex-col justify-center gap-2 border-b border-slate-100/80 px-3 py-2.5 text-left transition-colors last:border-b-0',
                    hasPendingReview ? pendingReviewRowClass : bandedTableRowClass(rowBandIndex),
                    isSelected && 'ring-2 ring-inset ring-indigo-300/80',
                    isSelected && !hasPendingReview && 'bg-indigo-50/70',
                    isSelected && hasPendingReview && 'bg-amber-100/60',
                  )}
                >
                  <div className="flex min-h-[36px] items-center gap-3">
                    <div
                      className={clsx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                        hasPendingReview
                          ? 'bg-amber-100 text-amber-700'
                          : isSelected
                            ? 'bg-indigo-100 text-indigo-600'
                            : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {hasPendingReview ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <User className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                        {hasPendingReview ? (
                          <Badge className="h-4 shrink-0 border-0 bg-amber-200/80 px-1.5 text-[9px] font-semibold text-amber-950">
                            {pendingCount > 1 ? `${pendingCount} ${t('common.pending').toLowerCase()}` : t('common.review')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">{student.phone || t('teacher.submissions.noPhone')}</p>
                    </div>
                    {isSelected ? <ChevronRight className="h-4 w-4 shrink-0 text-indigo-400" /> : null}
                  </div>

                  {progress ? (
                    <div className="flex min-h-[24px] items-center gap-2 pl-12">
                      <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">
                        {progress.average_score ?? 0}%
                      </span>
                      <Progress
                        value={progress.pct}
                        className="h-1.5 min-w-[72px] flex-1 bg-slate-200/70"
                        indicatorClassName={
                          hasPendingReview ? 'bg-amber-500' : isSelected ? 'bg-indigo-500' : 'bg-indigo-500/90'
                        }
                      />
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
                        {progress.completed}/{progress.total}
                      </span>
                    </div>
                  ) : null}
                </button>
              )
            })
            })()}
            {sortedStudents.length === 0 && (
              <div className="flex min-h-[120px] items-center justify-center px-4 py-10 text-center">
                <p className="text-xs text-slate-500">{t('teacher.submissions.noStudents')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress workspace — right panel */}
      <div
        className={clsx(
          'flex min-h-0 min-w-0 flex-col',
          embedded ? 'col-span-8' : 'md:col-span-8 lg:col-span-9',
        )}
      >
        {selectedStudent ? (
          <div className={clsx('flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto pr-0.5', !embedded && 'space-y-4 lg:space-y-6')}>
            <div
              className={clsx(
                'flex shrink-0 flex-col gap-3 border border-slate-100 bg-white sm:flex-row sm:items-center sm:justify-between',
                embedded ? 'rounded-xl p-3 shadow-sm' : 'rounded-[2.5rem] border border-slate-100 p-6 shadow-sm lg:p-8',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={clsx(
                    'flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200',
                    embedded ? 'h-10 w-10' : 'h-14 w-14 rounded-[1.25rem] shadow-lg lg:h-16 lg:w-16 lg:rounded-[1.5rem]',
                  )}
                >
                  <User className={embedded ? 'h-5 w-5' : 'h-7 w-7 lg:h-8 lg:w-8'} />
                </div>
                <div className="min-w-0">
                  <h2 className={clsx('truncate font-semibold text-slate-900', embedded ? 'text-sm' : 'text-xl font-black lg:text-2xl')}>
                    {selectedStudent.name}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{selectedStudent.phone}</span>
                    {!embedded && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <Badge variant="secondary" className="border-0 bg-indigo-50 text-[10px] font-semibold text-indigo-700">
                          {t('common.active')}
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size={embedded ? 'sm' : 'default'}
                className={clsx(
                  'shrink-0 rounded-lg border-slate-200 font-medium',
                  !embedded && 'h-11 rounded-2xl px-5 font-black lg:h-14 lg:px-6',
                )}
                onClick={() => navigate(`/student/progress-report/${selectedStudent.id}`)}
              >
                <FileText className={clsx('text-indigo-600', embedded ? 'mr-2 h-4 w-4' : 'mr-2 h-5 w-5')} />
                {t('nav.report')}
              </Button>
            </div>

            {loadingProgress ? (
              <div
                className={clsx(
                  'flex flex-1 items-center justify-center border border-slate-100 bg-white',
                  embedded ? 'min-h-[200px] rounded-xl' : 'min-h-[40vh] rounded-[2.5rem]',
                )}
              >
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : !progressData || !progressData.days || progressData.days.length === 0 ? (
              <div
                className={clsx(
                  'flex flex-1 flex-col items-center justify-center border border-dashed border-slate-200 bg-white text-center',
                  embedded ? 'min-h-[200px] rounded-xl p-6' : 'min-h-[40vh] rounded-[2.5rem] p-8',
                )}
              >
                <AlertCircle className={clsx('text-slate-300', embedded ? 'mb-3 h-10 w-10' : 'mb-4 h-10 w-10')} />
                <h3 className={clsx('font-semibold text-slate-900', embedded ? 'text-sm' : 'text-xl font-black')}>
                  {t('teacher.submissions.noProgress')}
                </h3>
                <p className="mt-2 max-w-sm text-xs text-slate-500">
                  {t('teacher.submissions.notStarted')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-semibold"
                    disabled={pagedDays.safePage <= 0}
                    onClick={() => setDayPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t('teacher.submissions.prev')}
                  </Button>
                  <p className="text-[10px] font-semibold text-slate-500">
                    Days {pagedDays.totalDays === 0 ? 0 : pagedDays.safePage * DAYS_PER_PAGE + 1}-
                    {Math.min((pagedDays.safePage + 1) * DAYS_PER_PAGE, pagedDays.totalDays)} of {pagedDays.totalDays}
                    <span className="block text-center text-[9px] text-slate-400">
                      Page {pagedDays.safePage + 1}/{pagedDays.totalPages}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs font-semibold"
                    disabled={pagedDays.safePage >= pagedDays.totalPages - 1}
                    onClick={() => setDayPage((p) => Math.min(pagedDays.totalPages - 1, p + 1))}
                  >
                    {t('common.next')}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
                {pagedDays.days.map((day: any) => (
                  <Card
                    key={day.id}
                    className={clsx(
                      'overflow-hidden border-emerald-100/80 bg-gradient-to-r from-emerald-50/90 via-green-50/70 to-teal-50/50 shadow-sm',
                      embedded ? 'rounded-lg border' : 'rounded-2xl border-none'
                    )}
                  >
                    <CardHeader
                      className={clsx(
                        'flex cursor-pointer flex-row items-center justify-between transition-colors',
                        embedded ? 'px-3 py-2.5 hover:from-emerald-100/80 hover:to-green-100/60' : 'px-4 py-3',
                        expandedDay === day.id
                          ? 'bg-emerald-100/40'
                          : !embedded && 'hover:from-emerald-100/70 hover:to-green-100/50'
                      )}
                      onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <div
                          className={clsx(
                            'flex shrink-0 items-center justify-center rounded-lg border border-emerald-100/60 bg-white/70',
                            embedded ? 'h-8 w-8' : 'h-9 w-9',
                            day.progress.pct === 100 ? 'text-emerald-600' : 'text-slate-400'
                          )}
                        >
                          <Calendar className={embedded ? 'h-4 w-4' : 'h-4 w-4'} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-0 flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
                              {t('teacher.submissions.dayPrefix')}{day.day_number}
                            </span>
                            {day.progress.completed > 0 && day.progress.completed === day.progress.reviewed && (
                              <Badge className="border-0 bg-white/80 px-1.5 py-0 text-[8px] font-medium text-indigo-700">
                                {t('teacher.submissions.corrected')}
                              </Badge>
                            )}
                            {day.progress.completed > day.progress.reviewed && (
                              <Badge className="border-0 bg-amber-50/90 px-1.5 py-0 text-[8px] font-medium text-amber-800">
                                {t('teacher.submissions.pendingReview')}
                              </Badge>
                            )}
                          </div>
                          <h3 className={clsx('truncate font-semibold text-slate-900', embedded ? 'text-xs' : 'text-sm font-bold')}>
                            {day.scheduled_date
                              ? new Date(day.scheduled_date).toLocaleDateString(undefined, {
                                  weekday: 'long',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : `${t('teacher.submissions.dayPrefix')}${day.day_number}`}
                          </h3>
                        </div>
                        <div className="hidden items-center gap-3 border-l border-emerald-200/60 pl-3 sm:flex">
                          <div className="text-center">
                            <p className="mb-0 text-[8px] font-medium uppercase text-slate-500">{t('common.score')}</p>
                            <p className="text-xs font-semibold leading-tight text-slate-900">{day.progress.average_score}%</p>
                            <p className="text-[9px] leading-tight text-slate-500">
                              {day.progress.completed}/{day.progress.total}
                            </p>
                          </div>
                          <div className="w-16">
                            <Progress
                              value={day.progress.pct}
                              className="h-1 bg-white/60"
                              indicatorClassName={day.progress.pct === 100 ? 'bg-emerald-500' : 'bg-emerald-600/80'}
                            />
                          </div>
                        </div>
                      </div>
                      {expandedDay === day.id ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                    </CardHeader>

                    <AnimatePresence>
                      {expandedDay === day.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-100 bg-slate-50/40"
                        >
                          <div className={clsx('space-y-6', embedded ? 'p-4' : 'space-y-8 p-8')}>
                            {day.periods.map((period: any) => (
                              <div key={period.id} className="space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400">
                                      <Clock className="h-3.5 w-3.5" />
                                    </div>
                                    <h4 className={clsx('font-medium text-slate-900', embedded ? 'text-sm' : 'font-black')}>
                                      {formatStudyPlanPeriodLabel(period.title, {
                                        scheduledDate: day.scheduled_date,
                                        dayNumber: day.day_number,
                                      })}
                                    </h4>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] text-slate-500">
                                      {period.progress.completed}/{period.progress.total} {t('teacher.submissions.done')}
                                    </span>
                                    <div className="w-14">
                                      <Progress
                                        value={period.progress.pct}
                                        className="h-1 bg-slate-200"
                                        indicatorClassName="bg-indigo-400"
                                      />
                                    </div>
                                    {period.progress.completed > 0 && period.progress.completed === period.progress.reviewed && (
                                      <Badge className="border-0 bg-emerald-50 text-[9px] font-medium text-emerald-700">
                                        {t('teacher.submissions.corrected')}
                                      </Badge>
                                    )}
                                    {period.progress.completed > period.progress.reviewed && (
                                      <Badge className="border-0 bg-amber-50 text-[9px] font-medium text-amber-800">
                                        {t('common.pending')}
                                      </Badge>
                                    )}
                                  </div>
                                </div>

                                <div className={clsx('grid gap-2', embedded ? 'pl-0 sm:pl-9' : 'gap-3 pl-11')}>
                                  {period.tasks.map((task: any) => (
                                    <div
                                      key={task.id}
                                      className={clsx(
                                        'flex flex-col gap-3 border border-slate-100 bg-white transition-colors hover:border-slate-200 sm:flex-row sm:items-center sm:justify-between',
                                        embedded ? 'rounded-lg p-3' : 'rounded-2xl p-4'
                                      )}
                                    >
                                      <div className="flex min-w-0 items-center gap-3">
                                        <div
                                          className={clsx(
                                            'flex shrink-0 items-center justify-center rounded-full',
                                            embedded ? 'h-6 w-6' : 'h-6 w-6',
                                            task.submission ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'
                                          )}
                                        >
                                          {task.submission ? (
                                            <CheckCircle className="h-3.5 w-3.5" />
                                          ) : (
                                            <Clock className="h-3.5 w-3.5" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className={clsx('truncate text-slate-800', embedded ? 'text-sm font-medium' : 'text-sm font-black')}>
                                            {task.title}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                                        {task.submission && (
                                          <>
                                            {task.submission.status === 'reviewed' ? (
                                              <div className="flex items-center gap-1.5 pr-2">
                                                <span className="text-xs font-semibold text-slate-800">{task.submission.score}%</span>
                                                <BadgeCheck className="h-4 w-4 text-emerald-500" />
                                              </div>
                                            ) : (
                                              <Badge
                                                variant="outline"
                                                className="border-amber-100 bg-amber-50 text-[9px] font-medium text-amber-800"
                                              >
                                                {t('teacher.submissions.pendingReview')}
                                              </Badge>
                                            )}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                                              onClick={() => navigate(`/teacher/evaluate/submission/${task.submission.id}`)}
                                            >
                                              {t('common.review')}
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className={clsx(
              'flex flex-1 flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/50 text-center',
              embedded ? 'min-h-[200px] rounded-xl px-4 py-10' : 'min-h-[40vh] rounded-[2rem] p-8 lg:rounded-[3rem]',
            )}
          >
            <TrendingUp className={clsx('text-slate-300', embedded ? 'mb-3 h-9 w-9' : 'mb-6 h-12 w-12')} />
            <h3 className={clsx('font-semibold text-slate-900', embedded ? 'text-sm' : 'text-xl font-black lg:text-2xl')}>
              {t('teacher.submissions.selectStudent')}
            </h3>
            <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
              {t('teacher.submissions.selectStudentDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <section className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">{t('teacher.submissions.title')}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{t('teacher.submissions.subtitle')}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">{classSelect}</div>
        </header>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{inner}</div>
      </section>
    )
  }

  return (
    <DashboardPageLayout
      title={t('teacher.submissions.titleFull')}
      description={t('teacher.submissions.subtitleFull')}
      actions={
        <div className="flex gap-3">
          {classSelect}
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold text-slate-500">
            <ChevronLeft className="mr-2 h-4 w-4" /> {t('common.back')}
          </Button>
        </div>
      }
    >
      {inner}
    </DashboardPageLayout>
  )
}
