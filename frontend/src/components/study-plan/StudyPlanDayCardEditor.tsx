import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Day } from '@/components/study-plan/StudyPlanBuilder'
import type { StudyPlanPdfImport } from '@/types'
import {
  getEditablePlanColumns,
  readColumnValue,
} from '@/lib/studyPlanPeriodColumns'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import toast from 'react-hot-toast'
import { useStudyPlanSyncStore } from '@/stores/studyPlanSyncStore'

type StudyPlanDayCardEditorProps = {
  day: Day
  dayIndex: number
  source: StudyPlanPdfImport | null
  busy?: boolean
  onEnsurePeriod: (dayIndex: number) => Promise<void>
  onAddPeriod: (dayIndex: number, copyFromPeriodIndex?: number) => Promise<void>
  onDeletePeriod: (dayIndex: number, periodIndex: number) => Promise<void>
  onSaveColumn: (
    dayIndex: number,
    periodIndex: number,
    column: string,
    value: string
  ) => Promise<void>
}

export function StudyPlanDayCardEditor({
  day,
  dayIndex,
  source,
  busy,
  onEnsurePeriod,
  onAddPeriod,
  onDeletePeriod,
  onSaveColumn,
}: StudyPlanDayCardEditorProps) {
  const columns = useMemo(() => getEditablePlanColumns(source), [source])
  const [localValues, setLocalValues] = useState<Record<string, Record<string, string>>>({})
  const [ensuring, setEnsuring] = useState(false)

  const periods = day.periods ?? []

  useEffect(() => {
    const next: Record<string, Record<string, string>> = {}
    for (const period of periods) {
      const key = period.id ?? `p-${period.order_index ?? 0}`
      const row: Record<string, string> = {}
      for (const column of columns) {
        row[column] = readColumnValue(period, column)
      }
      next[key] = row
    }
    setLocalValues(next)
  }, [periods, columns, dayIndex])

  useEffect(() => {
    if (!columns.length || periods.length > 0) return
    let cancelled = false
    setEnsuring(true)
    void onEnsurePeriod(dayIndex).finally(() => {
      if (!cancelled) setEnsuring(false)
    })
    return () => {
      cancelled = true
    }
  }, [columns.length, periods.length, dayIndex, onEnsurePeriod])

  if (!columns.length) {
    return (
      <p className="text-sm text-slate-500">
        No import columns are available. Apply a study plan PDF with column mapping first.
      </p>
    )
  }

  if (ensuring && periods.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing period…
      </div>
    )
  }

  const periodKey = (period: (typeof periods)[0], index: number) =>
    period.id ?? `p-${index}`

  const flushPendingEdits = useCallback(async (): Promise<boolean> => {
    let ok = true
    for (let pIdx = 0; pIdx < periods.length; pIdx++) {
      const period = periods[pIdx]
      const key = periodKey(period, pIdx)
      const values = localValues[key] ?? {}
      for (const column of columns) {
        const next = (values[column] ?? '').trim()
        const prev = readColumnValue(period, column).trim()
        if (next === prev) continue
        try {
          await onSaveColumn(dayIndex, pIdx, column, next)
        } catch {
          ok = false
        }
      }
    }
    useStudyPlanSyncStore.getState().clearPendingEdits()
    return ok
  }, [columns, dayIndex, localValues, onSaveColumn, periods])

  useEffect(() => {
    useStudyPlanSyncStore.getState().setFlushPendingEditsHandler(flushPendingEdits)
    return () => useStudyPlanSyncStore.getState().setFlushPendingEditsHandler(null)
  }, [flushPendingEdits])

  const hasPendingEdits = useStudyPlanSyncStore((s) => s.hasPendingEdits)

  return (
    <div className="space-y-3">
      {periods.map((period, pIdx) => {
        const key = periodKey(period, pIdx)
        const values = localValues[key] ?? {}
        const periodLabel = formatStudyPlanPeriodLabel(period.title, {
          scheduledDate: day.scheduled_date,
          dayNumber: day.day_number,
        })

        return (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-slate-50/60 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                {periods.length > 1 ? `P${pIdx + 1}` : periodLabel}
                {periods.length > 1 ? (
                  <span className="ml-1.5 font-normal normal-case text-slate-500">{periodLabel}</span>
                ) : null}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600"
                disabled={busy}
                aria-label="Delete period"
                onClick={() => void onDeletePeriod(dayIndex, pIdx)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {columns.map((column) => (
                <div key={column} className="space-y-0.5">
                  <Label className="text-[10px] font-medium leading-snug text-slate-600">
                    {column}
                  </Label>
                  <Input
                    value={values[column] ?? ''}
                    disabled={busy}
                    placeholder="—"
                    className="h-8 rounded-md border-slate-200 bg-white text-xs px-2"
                    onChange={(e) => {
                      useStudyPlanSyncStore.getState().markPendingEdits()
                      setLocalValues((prev) => ({
                        ...prev,
                        [key]: { ...(prev[key] ?? {}), [column]: e.target.value },
                      }))
                    }}
                    onBlur={(e) => {
                      const next = e.target.value.trim()
                      const prev = readColumnValue(period, column)
                      if (next !== prev.trim()) {
                        void onSaveColumn(dayIndex, pIdx, column, next).then(() => {
                          useStudyPlanSyncStore.getState().clearPendingEdits()
                        })
                      } else {
                        useStudyPlanSyncStore.getState().clearPendingEdits()
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700"
          disabled={busy || !hasPendingEdits}
          onClick={() =>
            void flushPendingEdits().then((ok) => {
              if (ok) toast.success('Changes saved')
              else toast.error('Failed to save some changes')
            })
          }
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save changes
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 gap-1.5 rounded-lg border-dashed border-indigo-200 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          disabled={busy || periods.length === 0}
          onClick={() => void onAddPeriod(dayIndex, periods.length > 0 ? periods.length - 1 : undefined)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add period
        </Button>
      </div>
    </div>
  )
}
