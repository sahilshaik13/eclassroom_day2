import { useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'

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
      config?: Record<string, unknown>
    }[]
  }[]
}

interface StudyPlanCalendarPanelProps {
  days: CalendarPlanDay[]
  /** Remount selection when switching classroom etc. */
  anchorKey?: string
  /** Called when user selects a calendar cell */
  onSelectDay?: (planDay: CalendarPlanDay | null, calendarDate: Date) => void
  /** Read-only (student): hide edit hints */
  readOnly?: boolean
  className?: string
}

export function StudyPlanCalendarPanel({
  days,
  anchorKey,
  onSelectDay,
  readOnly,
  className,
}: StudyPlanCalendarPanelProps) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))

  const daysFingerprint = useMemo(() => days.map((d) => `${d.id || ''}-${d.scheduled_date || ''}`).join('|'), [days])

  const dayMap = useMemo(() => {
    const m = new Map<string, CalendarPlanDay>()
    for (const d of days) {
      if (!d.scheduled_date) continue
      const key = d.scheduled_date.slice(0, 10)
      const existing = m.get(key)
      if (!existing) {
        m.set(key, {
          ...d,
          periods: [...(d.periods ?? [])],
        })
      } else {
        // Multiple plan rows can share one calendar date; merge periods for display.
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
    if (!days.length) return
    setSelectedCal(defaultCalendarSelection(days))
  }, [anchorKey, daysFingerprint, days])

  const selectedPlanDay = useMemo(() => {
    const key = format(selectedCal, 'yyyy-MM-dd')
    return dayMap.get(key) ?? null
  }, [dayMap, selectedCal])

  const pickCell = (cell: Date) => {
    setSelectedCal(cell)
    const key = format(cell, 'yyyy-MM-dd')
    const pd = dayMap.get(key) ?? null
    onSelectDay?.(pd, cell)
  }

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

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
                <th key={w} className="px-1 py-2 text-center font-medium">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.ceil(gridDays.length / 7) }).map((_, weekIdx) => (
              <tr key={weekIdx} className="border-b border-slate-50 last:border-0">
                {gridDays.slice(weekIdx * 7, weekIdx * 7 + 7).map((cell) => {
                  const key = format(cell, 'yyyy-MM-dd')
                  const pd = dayMap.get(key)
                  const isSel = isSameDay(cell, selectedCal)
                  const inMonth = isSameMonth(cell, cursor)
                  const isToday = isSameDay(cell, new Date())
                  return (
                    <td key={key} className="align-top p-0.5">
                      <button
                        type="button"
                        onClick={() => pickCell(cell)}
                        className={cn(
                          'flex min-h-[4.25rem] w-full flex-col rounded-lg border p-1.5 text-left transition-colors',
                          inMonth ? 'border-transparent hover:bg-slate-50' : 'border-transparent bg-slate-50/60 text-slate-400',
                          isSel && 'border-indigo-400 bg-indigo-50/80 ring-1 ring-indigo-300',
                          isToday && !isSel && 'ring-1 ring-slate-200'
                        )}
                      >
                        <span className={cn('text-[11px] font-semibold', inMonth ? 'text-slate-800' : 'text-slate-400')}>
                          {format(cell, 'd')}
                        </span>
                        {pd ? (
                          <Badge variant="secondary" className="mt-1 w-fit max-w-full truncate border-0 bg-emerald-50 px-1 py-0 text-[9px] font-medium text-emerald-800">
                            Day {pd.day_number}
                          </Badge>
                        ) : (
                          <span className="mt-auto text-[9px] text-slate-300">—</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-900">{format(selectedCal, 'EEEE, MMM d, yyyy')}</h4>
          {selectedPlanDay ? (
            <Badge className="border-0 bg-slate-100 font-medium text-slate-700">Plan day {selectedPlanDay.day_number}</Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-slate-500">
              No mapped study-plan day
            </Badge>
          )}
          {!readOnly && selectedPlanDay?.is_accessible === false ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
              Locked for students
            </Badge>
          ) : null}
        </div>

        {!selectedPlanDay ? (
          <p className="text-sm text-slate-500">Pick a date with a green badge to see scheduled tasks.</p>
        ) : selectedPlanDay.periods?.length ? (
          <ul className="space-y-4">
            {selectedPlanDay.periods.map((period) => (
              <li key={period.id || period.title} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {formatStudyPlanPeriodLabel(period.title, {
                    scheduledDate: selectedPlanDay.scheduled_date,
                    dayNumber: selectedPlanDay.day_number,
                  })}
                </p>
                <ul className="mt-2 space-y-2">
                  {(period.tasks || []).map((task) => (
                    <li
                      key={task.id || task.title}
                      className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800">{task.title}</p>
                        {task.description ? (
                          <p className="mt-1 text-xs leading-snug text-slate-600">{task.description}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">This day has no periods yet.{!readOnly ? ' Use the structure editor to add content.' : ''}</p>
        )}
      </div>
    </div>
  )
}

/** Prefer today's scheduled plan day when available */
export function defaultCalendarSelection(days: CalendarPlanDay[]): Date {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const hit = days.find((d) => d.scheduled_date?.slice(0, 10) === todayStr)
  if (hit?.scheduled_date) {
    try {
      return parseISO(hit.scheduled_date.slice(0, 10))
    } catch {
      /* fallthrough */
    }
  }
  const first = days.find((d) => d.scheduled_date)
  if (first?.scheduled_date) {
    try {
      return parseISO(first.scheduled_date.slice(0, 10))
    } catch {
      /* fallthrough */
    }
  }
  return new Date()
}
