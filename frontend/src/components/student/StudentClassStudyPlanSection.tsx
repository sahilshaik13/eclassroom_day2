import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { Layers, Video } from 'lucide-react'
import type { StudyPlanPdfImport } from '@/types'
import { Button } from '@/components/ui/button'
import { StudyPlanPdfEmbed } from '@/components/study-plan/StudyPlanPdfEmbed'
import {
  StudyPlanCalendarPanel,
  type CalendarPlanDay,
} from '@/components/study-plan/StudyPlanCalendarPanel'
import { StudentStudyPlanDaySection } from '@/components/student/StudentStudyPlanDaySection'
import {
  isPlanDayReleased,
  type StudentPlanDay,
  type StudentPlanTask,
} from '@/lib/studentStudyPlanTasks'

type ToggleTaskHandler = (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => Promise<void>

export function StudentClassStudyPlanSection({
  planName,
  planDays,
  planSource,
  zoomLink,
  classId,
  onToggleTask,
  togglingTaskId,
}: {
  planName: string
  planDays: StudentPlanDay[]
  planSource: StudyPlanPdfImport | null
  zoomLink?: string
  classId?: string
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
}) {
  const { t } = useTranslation()
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date())

  const releasedPlanDays = useMemo(
    () => planDays.filter((day) => isPlanDayReleased(day.scheduled_date)),
    [planDays],
  )

  const calendarDays = useMemo((): CalendarPlanDay[] => {
    return releasedPlanDays.map((day) => ({
      id: day.id,
      day_number: day.day_number,
      scheduled_date: day.scheduled_date,
      periods: (day.periods ?? []).map((period) => ({
        id: period.id,
        title: period.title,
        duration_minutes: period.duration_minutes,
        tasks: (period.tasks ?? []).map((task) => ({
          id: task.id,
          title: task.title,
          task_type: '',
          config: task.config,
        })),
      })),
    }))
  }, [releasedPlanDays])

  const handleCalendarSelectDay = useCallback(
    (_planDay: CalendarPlanDay | null, calendarDate: Date) => {
      setSelectedCalendarDate(calendarDate)
    },
    [],
  )

  const selectedPlanDay = useMemo(() => {
    const key = format(selectedCalendarDate, 'yyyy-MM-dd')
    return releasedPlanDays.find((day) => day.scheduled_date?.slice(0, 10) === key) ?? null
  }, [releasedPlanDays, selectedCalendarDate])

  const selectedDateKey = format(selectedCalendarDate, 'yyyy-MM-dd')
  const isFutureLockedDay = useMemo(
    () =>
      !selectedPlanDay &&
      planDays.some(
        (day) =>
          day.scheduled_date?.slice(0, 10) === selectedDateKey &&
          !isPlanDayReleased(day.scheduled_date),
      ),
    [planDays, selectedDateKey, selectedPlanDay],
  )

  useEffect(() => {
    setSelectedCalendarDate(new Date())
  }, [planName, classId])

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 sm:text-base">
              {planName}
            </h3>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              {t('student.planDay.daysAvailable', { released: releasedPlanDays.length, total: planDays.length })}
            </p>
          </div>
        </div>
        {zoomLink ? (
          <Button
            variant="outline"
            className="min-h-0 h-10 shrink-0 rounded-xl border-blue-200 px-4 text-xs font-black text-blue-600 hover:bg-blue-50"
            onClick={() => window.open(zoomLink, '_blank')}
          >
            <Video className="h-4 w-4 shrink-0" /> {t('student.planDay.liveZoom')}
          </Button>
        ) : null}
      </div>

      <StudyPlanCalendarPanel
        days={calendarDays}
        anchorKey={`${classId ?? planName}`}
        calendarOnly
        readOnly
        onSelectDay={handleCalendarSelectDay}
      />

      <StudentStudyPlanDaySection
        selectedDate={selectedCalendarDate}
        planDay={selectedPlanDay}
        isFutureLocked={isFutureLockedDay}
        onToggleTask={onToggleTask}
        togglingTaskId={togglingTaskId}
      />

      <StudyPlanPdfEmbed
        pdfUrl={planSource?.pdf_url}
        title={t('student.planDay.studyPlanPdf')}
        filename={planSource?.original_filename}
        emptyMessage={t('student.planDay.noPdfYet')}
      />
    </div>
  )
}
