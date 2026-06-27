import { useEffect, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, MessageCircle, CheckCircle2, Calendar, Sparkles, Loader2 } from 'lucide-react'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import {
  clearTeacherDoubtsSessionCache,
  fetchTeacherDoubts,
  teacherDoubtsQueryOptions,
} from '@/lib/doubtsQueries'
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'
import { TeacherSubmissionsWorkspace } from '@/components/teacher/TeacherSubmissionsWorkspace'
import { TeacherDoubtsChatSection } from '@/components/teacher/TeacherDoubtsChat'
import { TeacherScheduleClassCard } from '@/components/teacher/TeacherScheduleClassCard'
import { StudyPlanTableView } from '@/components/study-plan/StudyPlanTableView'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import { findStudyPlanSourceRow, getDashboardStudyPlanColumns } from '@/lib/studyPlanSource'
import { subscribeToClassMeetings, subscribeToTeacherQueue } from '@/lib/realtime'
import { fetchTeacherTodayMeetings } from '@/services/meetApi'
import type { ClassMeeting } from '@/services/meetApi'
import {
  formatMeetingTimeRange,
  meetingScheduleStatus,
  pickNextMeeting,
} from '@/lib/studentMeetings'

interface PulseStudent { student_id: string; name: string; completion_pct: number; pending_doubts: number }

export default function TeacherDashboard() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const avgAttendance = 95

  const { data: pulseData, isPending: pulsePending } = useQuery({
    queryKey: queryKeys.teacher.pulseToday(),
    queryFn: async () =>
      ((await api.get('/teacher/pulse/today')).data?.data ?? []) as PulseStudent[],
    staleTime: 60_000,
  })

  const { data: classes = [], isPending: classesPending } = useQuery({
    queryKey: queryKeys.teacher.classes(),
    queryFn: async () => (await api.get('/teacher/classes')).data?.data ?? [],
    staleTime: 60_000,
  })

  const { data: todayMeetings = [] } = useQuery({
    queryKey: queryKeys.teacher.meetingsToday(),
    queryFn: fetchTeacherTodayMeetings,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
    enabled: classes.length > 0,
  })

  const meetingsByClass = useMemo(() => {
    const map = new Map<string, ClassMeeting[]>()
    const now = Date.now()
    for (const m of todayMeetings) {
      try {
        if (now >= new Date(m.end_at).getTime()) continue
      } catch {
        continue
      }
      const list = map.get(m.class_id) ?? []
      list.push(m)
      map.set(m.class_id, list)
    }
    return map
  }, [todayMeetings])

  const scheduleClasses = useMemo(() => {
    if (!classes.length) return []
    return classes.filter((c: { id: string }) => meetingsByClass.has(c.id)).slice(0, 3)
  }, [classes, meetingsByClass])

  // Subscribe to real-time updates for pending queue
  useEffect(() => {
    if (!user?.id || classes.length === 0) return

    const classIds = classes.map((c: any) => c.id)
    const unsubscribe = subscribeToTeacherQueue(user.id, classIds)
    return unsubscribe
  }, [user?.id, classes])

  // Clear teacher doubts session cache when the user changes (e.g. logout/login
  // on a shared device). Empty-deps would only run on mount and could leak the
  // previous teacher's cached data into a new session.
  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    clearTeacherDoubtsSessionCache()
  }, [userId])

  useEffect(() => {
    if (classes.length === 0) return
    const unsubs: Array<() => void> = classes.map((c: { id: string }) =>
      subscribeToClassMeetings(c.id),
    )
    return () => unsubs.forEach((unsub) => unsub())
  }, [classes])

  const queryClient = useQueryClient()

  const { data: pendingDoubtsRaw = [], isPending: doubtsPending } = useQuery({
    queryKey: queryKeys.teacher.doubts('pending'),
    queryFn: () =>
      fetchTeacherDoubts(
        'pending',
        queryClient.getQueryData(queryKeys.teacher.doubts('pending')),
      ),
    ...teacherDoubtsQueryOptions('pending'),
  })

  const firstClassId = classes[0]?.id as string | undefined

  const { data: firstClassPlan, isPending: todayCurriculumLoading } = useQuery({
    queryKey: queryKeys.teacher.classroomStudyPlan(firstClassId ?? ''),
    queryFn: async () => {
      try {
        return (await api.get(`/teacher/classrooms/${firstClassId}/study-plan`)).data?.data
      } catch {
        return null
      }
    },
    enabled: !!firstClassId,
    ...studyPlanQueryOptions(),
    retry: 0,
  })

  const { data: firstClassSource } = useQuery({
    queryKey: queryKeys.teacher.classroomStudyPlanSource(firstClassId ?? ''),
    queryFn: async () => {
      try {
        return (await api.get(`/teacher/classrooms/${firstClassId}/study-plan-source`)).data?.data
      } catch {
        return null
      }
    },
    enabled: !!firstClassId,
    ...studyPlanQueryOptions(),
    retry: 0,
  })

  const { totalStudents, totalClasses, pendingDoubts, todayCurriculum, todayCurriculumColumns, todayCurriculumRow } = useMemo(() => {
    const pulse: PulseStudent[] = pulseData ?? []
    const doubtsList = pendingDoubtsRaw as any[]
    const totalStudentsN = pulse.length
    const totalClassesN = classes.length
    const totalDoubtsFromPulse = pulse.reduce((s, p) => s + p.pending_doubts, 0)

    const pendingCount =
      doubtsList.length > 0 ? doubtsList.length : totalDoubtsFromPulse

    let curriculum: { className: string; periods: any[]; scheduledDate?: string; dayNumber?: number } | null = null
    let todayColumns: string[] = []
    let todayRow: Record<string, string> | null = null
    if (firstClassPlan && classes[0]) {
      const cname = classes[0].name as string
      const dayList = firstClassPlan?.days || []
      const todayStr = new Date().toISOString().slice(0, 10)
      const day = dayList.find((d: any) => d.scheduled_date?.slice(0, 10) === todayStr)
      if (firstClassSource) {
        todayColumns = getDashboardStudyPlanColumns(firstClassSource)
        todayRow = findStudyPlanSourceRow(firstClassSource, {
          scheduledDate: day?.scheduled_date || todayStr,
          dayNumber: day?.day_number,
        })
      }
      if (day?.periods?.length) {
        curriculum = {
          className: cname,
          periods: day.periods,
          scheduledDate: day.scheduled_date,
          dayNumber: day.day_number,
        }
      }
    }

    return {
      totalStudents: totalStudentsN,
      totalClasses: totalClassesN,
      pendingDoubts: pendingCount,
      todayCurriculum: curriculum,
      todayCurriculumColumns: todayColumns,
      todayCurriculumRow: todayRow,
    }
  }, [pulseData, pendingDoubtsRaw, classes, firstClassPlan, firstClassSource])

  const firstName = user?.name?.split(' ')[0] || t('teacher.dashboard.teacher')
  const classesLabel = `${totalClasses} ${totalClasses === 1 ? t('common.class') : t('common.classes')}`

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          {t('teacher.dashboard.greeting', { name: firstName })}
          <Sparkles className="h-5 w-5 text-amber-400 fill-amber-400" />
        </h1>
        <p className="text-slate-500 font-medium">
          <Trans
            i18nKey="teacher.dashboard.summary"
            values={{ classes: classesPending ? '…' : classesLabel, doubts: doubtsPending && pendingDoubtsRaw.length === 0 ? '…' : pendingDoubts }}
            components={{
              1: <span className="text-blue-600 font-bold" />,
              3: <span className="text-orange-500 font-bold" />,
            }}
          />
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={pulsePending ? '…' : String(totalStudents)} label={t('teacher.dashboard.totalStudents')} icon={Users} from="from-[#4E7DFF]" to="to-[#3B66DE]" shadow="shadow-blue-500/20" />
        <StatCard value={classesPending ? '…' : String(totalClasses)} label={t('teacher.dashboard.classesToday')} icon={Calendar} from="from-[#A855F7]" to="to-[#8B5CF6]" shadow="shadow-purple-500/20" />
        <StatCard value={doubtsPending && pendingDoubtsRaw.length === 0 ? '…' : String(pendingDoubts)} label={t('teacher.dashboard.studentDoubts')} icon={MessageCircle} from="from-[#FF922B]" to="to-[#F76707]" shadow="shadow-orange-500/20" />
        <StatCard value={`${avgAttendance}%`} label={t('teacher.dashboard.avgAttendance')} icon={CheckCircle2} from="from-[#20C997]" to="to-[#12B886]" shadow="shadow-emerald-500/20" />
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">{t('teacher.dashboard.todayCurriculum')}</h2>
          <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-xs font-semibold" asChild>
            <Link to="/teacher/study-plan">{t('teacher.studyPlan.title')}</Link>
          </Button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          {todayCurriculumLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              {t('teacher.dashboard.loadingTodaysPlan')}
            </div>
          ) : !todayCurriculum && !todayCurriculumRow ? (
            <p className="text-sm text-slate-500">
              {t('teacher.dashboard.noCurriculum')}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {todayCurriculum?.className || classes[0]?.name}
              </p>
              {todayCurriculumRow && todayCurriculumColumns.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold text-indigo-700">{t('teacher.dashboard.todaysTimetable')}</p>
                  <StudyPlanTableView
                    columns={todayCurriculumColumns}
                    rows={[todayCurriculumRow]}
                    emptyMessage={t('teacher.dashboard.noTimetable')}
                  />
                </div>
              ) : null}
              {todayCurriculum?.periods?.map((period: any) => (
                <div key={period.id || period.title}>
                  <p className="text-xs font-semibold text-indigo-700">
                    {formatStudyPlanPeriodLabel(period.title, {
                      scheduledDate: todayCurriculum.scheduledDate,
                      dayNumber: todayCurriculum.dayNumber,
                    })}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {(period.tasks || []).map((task: any) => (
                      <li
                        key={task.id || task.title}
                        className="flex flex-col gap-0.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{task.title}</span>
                          {task.description ? (
                            <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Today's Schedule — real classes from API */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900">{t('teacher.dashboard.todaySchedule')}</h2>
        {classes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-400">{t('teacher.dashboard.noClassesAssigned')}</p>
          </div>
        ) : scheduleClasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
            <p className="text-sm text-slate-400">{t('teacher.dashboard.noUpcomingMeetings')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {scheduleClasses.map((cls: any, i: number) => {
              const classMeetings = meetingsByClass.get(cls.id) ?? []
              const meeting = pickNextMeeting(classMeetings)
              const enrollment =
                cls.class_enrollments?.[0]?.count ?? cls.enrollment_count ?? 0
              return (
                <TeacherScheduleClassCard
                  key={cls.id || i}
                  classId={cls.id}
                  title={cls.name}
                  batch={t('teacher.dashboard.classN', { n: i + 1 })}
                  time={
                    meeting
                      ? formatMeetingTimeRange(meeting)
                      : cls.schedule_json?.time
                        ? String(cls.schedule_json.time)
                        : t('teacher.dashboard.noMeetingToday')
                  }
                  students={enrollment}
                  status={meeting ? meetingScheduleStatus(meeting) : t('student.competitions.upcoming')}
                  meeting={meeting ?? null}
                  zoomLink={cls.zoom_link}
                  meetingTitle={meeting?.title}
                />
              )
            })}
          </div>
        )}
      </section>

      <TeacherSubmissionsWorkspace layout="embedded" />

      <TeacherDoubtsChatSection variant="embedded" />
    </div>
  )
}

function StatCard({ value, label, icon: Icon, from, to, shadow }: { value: string; label: string; icon: React.ElementType; from: string; to: string; shadow: string }) {
  return (
    <div className={clsx('relative group overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-0.5 bg-gradient-to-br text-white shadow-lg', from, to, shadow)}>
      <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-110 transition-transform duration-300"><Icon className="h-8 w-8" /></div>
      <p className="text-4xl font-black tracking-tighter mb-1">{value}</p>
      <div className="flex items-center gap-1.5 opacity-90"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-black uppercase tracking-widest">{label}</span></div>
    </div>
  )
}
