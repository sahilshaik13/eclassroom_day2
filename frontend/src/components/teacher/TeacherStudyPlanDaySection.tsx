import { format } from 'date-fns'
import { Calendar, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { TeacherCreateMeetButton } from '@/components/teacher/TeacherClassMeetPanel'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CalendarPlanDay } from '@/components/study-plan/StudyPlanCalendarPanel'
import { cn } from '@/lib/utils'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import { getDayPageTarget, getTeacherTaskRowParts, isSubmittableTask } from '@/lib/studentStudyPlanTasks'

function planDayHasTasks(day: CalendarPlanDay | null): boolean {
  if (!day) return false
  return (day.periods ?? []).some((period) =>
    (period.tasks ?? []).some(isSubmittableTask),
  )
}

interface TeacherStudyPlanDaySectionProps {
  selectedDate: Date
  planDay: CalendarPlanDay | null
  isEditing: boolean
  busy?: boolean
  classId?: string
  className?: string
  onToggleEdit: () => void
  onAddPlanForDate: () => void
  onRemovePlanForDate?: () => void
  dayEditor?: ReactNode
}

export function TeacherStudyPlanDaySection({
  selectedDate,
  planDay,
  isEditing,
  busy,
  onToggleEdit,
  onAddPlanForDate,
  onRemovePlanForDate,
  dayEditor,
  classId,
  className,
}: TeacherStudyPlanDaySectionProps) {
  const selectedDateLabel = format(selectedDate, 'EEEE, MMM d, yyyy')
  const selectedHasTasks = planDayHasTasks(planDay)
  const pageTarget = planDay ? getDayPageTarget(planDay) : null

  return (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-900">
              <ListChecks className="h-4 w-4 shrink-0 text-slate-500" />
              Tasks for selected day
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <Calendar className="h-3 w-3 shrink-0" />
              {selectedDateLabel}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {pageTarget ? (
              <Badge className="border-0 bg-indigo-50 font-semibold text-indigo-800">
                Pages: {pageTarget}
              </Badge>
            ) : null}
            {planDay ? (
              <Badge className="border-0 bg-slate-100 font-medium text-slate-700">
                Plan day {planDay.day_number}
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal text-slate-500">
                Not on study plan
              </Badge>
            )}
            {planDay?.is_accessible === false ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                Locked for students
              </Badge>
            ) : null}
            {classId && className ? (
              <TeacherCreateMeetButton
                classId={classId}
                className={className}
                defaultDate={selectedDate}
                compact
              />
            ) : null}
            {planDay && onRemovePlanForDate ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                className="h-8 w-8 text-slate-400 hover:bg-red-50 hover:text-red-600"
                onClick={onRemovePlanForDate}
                aria-label={`Remove plan from ${selectedDateLabel}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              className={cn(
                'h-8 w-8',
                isEditing
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100'
                  : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600',
              )}
              onClick={onToggleEdit}
              aria-label={isEditing ? 'Close editor' : planDay ? `Edit plan day ${planDay.day_number}` : 'Add plan for this date'}
              aria-pressed={isEditing}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {!planDay && !isEditing ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">
              This date is not on the study plan yet.
            </p>
            <p className="max-w-sm text-xs font-medium text-slate-500">
              Add a plan for {selectedDateLabel} to fill columns and tasks like other scheduled days.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              className="gap-1.5 rounded-lg text-xs font-bold"
              onClick={onAddPlanForDate}
            >
              <Plus className="h-3.5 w-3.5" />
              Add plan for this day
            </Button>
          </div>
        ) : isEditing && dayEditor ? (
          <div>{dayEditor}</div>
        ) : planDay && !selectedHasTasks ? (
          <p className="text-sm text-slate-500">
            No tasks yet. Click the pencil to add columns for this day.
          </p>
        ) : planDay ? (
          <>
          <ul className="space-y-4">
            {planDay.periods.map((period) => {
              const tasks = (period.tasks || []).filter(isSubmittableTask)
              if (!tasks.length) return null
              return (
                <li key={period.id || period.title} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {formatStudyPlanPeriodLabel(period.title, {
                      scheduledDate: planDay.scheduled_date,
                      dayNumber: planDay.day_number,
                    })}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {tasks.map((task) => {
                      const { column, value } = getTeacherTaskRowParts(task)
                      return (
                      <li key={task.id || task.title} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-sm font-semibold text-slate-800">{column}</p>
                        {value ? (
                          <p className="mt-0.5 text-xs font-medium leading-snug text-slate-600">{value}</p>
                        ) : null}
                        {task.description ? (
                          <p className="mt-1 text-xs leading-snug text-slate-500">{task.description}</p>
                        ) : null}
                      </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
          {onRemovePlanForDate ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                className="gap-1.5 rounded-lg border-red-200 text-xs font-bold text-red-600 hover:bg-red-50"
                onClick={onRemovePlanForDate}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove plan from this day
              </Button>
            </div>
          ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
