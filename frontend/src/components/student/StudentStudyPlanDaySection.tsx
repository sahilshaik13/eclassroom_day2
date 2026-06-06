import { format, isSameDay } from 'date-fns'
import { Calendar, ListChecks, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getDayPageTarget,
  getDayTopic,
  sortTasksBySchedule,
  flattenPlanTasks,
  type StudentPlanDay,
  type StudentPlanTask,
} from '@/lib/studentStudyPlanTasks'
import { StudentPlanDayTasks } from '@/components/student/StudentPlanDayTasks'

type ToggleTaskHandler = (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => Promise<void>

interface StudentStudyPlanDaySectionProps {
  selectedDate: Date
  planDay: StudentPlanDay | null
  isFutureLocked?: boolean
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
}

export function StudentStudyPlanDaySection({
  selectedDate,
  planDay,
  isFutureLocked = false,
  onToggleTask,
  togglingTaskId,
}: StudentStudyPlanDaySectionProps) {
  const selectedDateLabel = format(selectedDate, 'EEEE, MMM d, yyyy')
  const selectedIsToday = isSameDay(selectedDate, new Date())
  const pageTarget = planDay ? getDayPageTarget(planDay) : null
  const dayTopic = planDay ? getDayTopic(planDay) : null
  const tasks = planDay ? sortTasksBySchedule(flattenPlanTasks([planDay])) : []

  return (
    <Card className="rounded-xl border-slate-200 shadow-sm">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-900">
              {selectedIsToday ? (
                <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
              ) : (
                <ListChecks className="h-4 w-4 shrink-0 text-slate-500" />
              )}
              {selectedIsToday ? "Today's tasks" : 'Tasks for selected day'}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-400">
              <Calendar className="h-3 w-3 shrink-0" />
              {selectedDateLabel}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          </div>
        </div>
        {dayTopic ? (
          <p className="text-xs font-semibold leading-snug text-indigo-900">{dayTopic}</p>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">
        {!planDay ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">
              {isFutureLocked
                ? 'This day unlocks on its scheduled date.'
                : 'No plan is scheduled for this date.'}
            </p>
            {!isFutureLocked ? (
              <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500">
                Pick another day on the calendar above to view tasks.
              </p>
            ) : null}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-slate-500">No tasks scheduled for this day.</p>
        ) : (
          <StudentPlanDayTasks
            tasks={tasks}
            highlightToday={selectedIsToday}
            onToggleTask={onToggleTask}
            togglingTaskId={togglingTaskId}
          />
        )}
      </CardContent>
    </Card>
  )
}
