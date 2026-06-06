import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatStudyPlanPeriodLabel, isFlatScheduleTitle } from '@/lib/studyPlanLabels'
import {
  getCalendarDisplayTasks,
  getCalendarTaskDisplayLabel,
  isEmptySpreadsheetCell,
} from '@/lib/studentStudyPlanTasks'

/** Minimal shape from API / builder — avoids tight coupling to StudyPlanBuilder types */
export interface CalendarPlanDay {
  id?: string
  day_number: number
  scheduled_date?: string
  is_accessible?: boolean
  periods: {
    id?: string
    title: string
    duration_minutes?: number
    order_index?: number
    tasks: {
      id?: string
      title: string
      task_type: string
      description?: string
      required?: boolean
      config?: Record<string, unknown>
    }[]
  }[]
}

function planDayHasTasks(day: CalendarPlanDay | null): boolean {
  if (!day) return false
  return getCalendarDisplayTasks(day).length > 0
}

const CALENDAR_CELL_MAX_TASKS = 3

interface StudyPlanCalendarPanelProps {
  days: CalendarPlanDay[]
  anchorKey?: string
  onSelectDay?: (planDay: CalendarPlanDay | null, calendarDate: Date) => void
  readOnly?: boolean
  canEditDay?: boolean
  /** Shown inside the day card when the pencil is active */
  dayEditor?: ReactNode
  /** Month grid only — day detail / tasks render below the calendar in the parent */
  calendarOnly?: boolean
  className?: string
}

export function StudyPlanCalendarPanel({
  days,
  anchorKey,
  onSelectDay,
  readOnly,
  canEditDay = false,
  dayEditor,
  calendarOnly = false,
  className,
}: StudyPlanCalendarPanelProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [isEditing, setIsEditing] = useState(false)

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarPlanDay>()
    for (const d of days) {
      if (!d.scheduled_date) continue
      const key = d.scheduled_date.slice(0, 10)
      const existing = m.get(key)
      if (!existing) {
        m.set(key, { ...d, periods: [...(d.periods ?? [])] })
      } else {
        m.set(key, {
          ...existing,
          day_number: Math.min(existing.day_number, d.day_number),
          periods: [...(existing.periods ?? []), ...(d.periods ?? [])],
        })
      }
    }
    return m
  }, [days])

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [cursor])

  const [selectedCal, setSelectedCal] = useState<Date>(() => new Date())

  useEffect(() => {
    const today = new Date()
    setSelectedCal(today)
    setCursor(startOfMonth(today))
    setIsEditing(false)
  }, [anchorKey])

  useEffect(() => {
    setIsEditing(false)
  }, [selectedCal])

  const selectedPlanDay = useMemo(() => {
    const key = format(selectedCal, 'yyyy-MM-dd')
    return dayMap.get(key) ?? null
  }, [dayMap, selectedCal])

  const selectedDateLabel = format(selectedCal, 'EEEE, MMM d, yyyy')
  const selectedHasTasks = useMemo(() => planDayHasTasks(selectedPlanDay), [selectedPlanDay])

  const pickCell = (cell: Date) => {
    setSelectedCal(cell)
    if (!isSameMonth(cell, cursor)) {
      setCursor(startOfMonth(cell))
    }
  }

  useEffect(() => {
    const key = format(selectedCal, 'yyyy-MM-dd')
    onSelectDay?.(dayMap.get(key) ?? null, selectedCal)
  }, [selectedCal, dayMap, onSelectDay])

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendar</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor((d) => addMonths(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-800">{format(cursor, 'MMMM yyyy')}</span>
          <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setCursor((d) => addMonths(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[420px]">
          {/* Calendar Header - Days of Week */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
              <div key={w} className="px-0.5 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {w}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid — taller cells so tasks read like Google Calendar month view */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {gridDays.map((cell) => {
              const key = format(cell, 'yyyy-MM-dd')
              const pd = dayMap.get(key)
              const tasks = pd ? getCalendarDisplayTasks(pd) : []
              const visibleTasks = tasks.slice(0, CALENDAR_CELL_MAX_TASKS)
              const overflowCount = tasks.length - visibleTasks.length
              const isSel = isSameDay(cell, selectedCal)
              const inMonth = isSameMonth(cell, cursor)
              const isToday = isSameDay(cell, new Date())
              return (
                <div key={key} className="min-h-[4.75rem] border-b border-r border-slate-50 p-0.5 last:border-r-0">
                  <button
                    type="button"
                    onClick={() => pickCell(cell)}
                    className={cn(
                      'flex h-full w-full flex-col gap-0.5 rounded-md border p-0.5 text-left transition-all',
                      inMonth ? 'border-transparent hover:bg-slate-50' : 'border-transparent bg-slate-50/60 text-slate-400',
                      isSel && 'border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-300',
                      isToday && !isSel && 'ring-1 ring-slate-200 bg-slate-50/30'
                    )}
                  >
                    <div className="flex items-start justify-between gap-0.5 px-0.5">
                      <span
                        className={cn(
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-semibold leading-none',
                          isToday && inMonth && 'bg-indigo-600 text-white',
                          !isToday && inMonth && 'text-slate-800',
                          !inMonth && 'text-slate-400',
                        )}
                      >
                        {format(cell, 'd')}
                      </span>
                      {pd ? (
                        <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-emerald-700">
                          D{pd.day_number}
                        </span>
                      ) : null}
                    </div>
                    {visibleTasks.length > 0 ? (
                      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden px-0.5 pb-0.5">
                        {visibleTasks.map((task) => (
                          <span
                            key={task.id || `${pd?.day_number}-${task.label}`}
                            className="block truncate rounded-sm bg-indigo-100/90 px-1 py-px text-[9px] font-medium leading-tight text-indigo-900"
                            title={task.label}
                          >
                            {task.label}
                          </span>
                        ))}
                        {overflowCount > 0 ? (
                          <span className="truncate px-0.5 text-[8px] font-medium text-slate-500">
                            +{overflowCount} more
                          </span>
                        ) : null}
                      </div>
                    ) : pd ? (
                      <span className="px-0.5 text-[8px] text-slate-400">No tasks</span>
                    ) : null}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {!calendarOnly ? (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-900">{selectedDateLabel}</h4>
          {selectedPlanDay ? (
            <Badge className="border-0 bg-slate-100 font-medium text-slate-700">Plan day {selectedPlanDay.day_number}</Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-slate-500">
              Not on study plan
            </Badge>
          )}
          {!readOnly && selectedPlanDay?.is_accessible === false ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
              Locked for students
            </Badge>
          ) : null}
          {!readOnly && selectedPlanDay && canEditDay ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'ml-auto h-8 w-8 shrink-0',
                isEditing
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100'
                  : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600'
              )}
              onClick={() => setIsEditing((v) => !v)}
              aria-label={isEditing ? 'Close editor' : `Edit plan day ${selectedPlanDay.day_number}`}
              aria-pressed={isEditing}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {!selectedPlanDay ? (
          <p className="text-sm text-slate-500">
            No tasks for {selectedDateLabel}. This date is not on the study plan calendar.
          </p>
        ) : isEditing && canEditDay && dayEditor ? (
          <div className="border-t border-slate-100 pt-4">{dayEditor}</div>
        ) : !selectedHasTasks ? (
          <p className="text-sm text-slate-500">
            No tasks scheduled for {selectedDateLabel}. Click the pencil to add columns for this day.
          </p>
        ) : (
          <ul className="space-y-4">
            {selectedPlanDay.periods.map((period) => {
              const tasks = (period.tasks || []).filter((task) => !isEmptySpreadsheetCell(task))
              if (!tasks.length) return null
              const periodLabel = formatStudyPlanPeriodLabel(period.title, {
                scheduledDate: selectedPlanDay.scheduled_date,
                dayNumber: selectedPlanDay.day_number,
              })
              return (
                <li key={period.id || period.title} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  {!isFlatScheduleTitle(period.title) ? (
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      {periodLabel}
                    </p>
                  ) : null}
                  <ul className={cn(!isFlatScheduleTitle(period.title) && 'mt-2', 'space-y-2')}>
                    {tasks.map((task) => {
                      const label = getCalendarTaskDisplayLabel(task)
                      if (!label) return null
                      return (
                      <li key={task.id || task.title} className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        {task.description ? (
                          <p className="mt-1 text-xs leading-snug text-slate-600">{task.description}</p>
                        ) : null}
                      </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      ) : null}
    </div>
  )
}

export function defaultCalendarSelection(_days?: CalendarPlanDay[]): Date {
  return new Date()
}
