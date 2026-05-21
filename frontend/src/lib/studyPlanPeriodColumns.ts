import type { TaskType } from '@/components/study-plan/StudyPlanBuilder'
import type { StudyPlanPdfImport } from '@/types'
import {
  getStudyPlanSourceColumns,
  isStudyPlanDateColumn,
  isStudyPlanDayColumn,
} from '@/lib/studyPlanSource'

export type PlanPeriod = {
  id?: string
  title: string
  duration_minutes?: number
  order_index?: number
  tasks: PlanTask[]
}

export type PlanTask = {
  id?: string
  title: string
  description?: string
  task_type: string
  required?: boolean
  order_index?: number
  config?: Record<string, unknown>
}

const BUCKET_TASK_TYPE: Record<string, TaskType> = {
  hifz: 'memorise',
  kubra: 'read',
  sughra: 'review',
  tajweed: 'written',
}

/** Columns teachers can fill per period (excludes schedule-only columns). */
export function getEditablePlanColumns(source: StudyPlanPdfImport | null): string[] {
  return getStudyPlanSourceColumns(source).filter(
    (column) => !isStudyPlanDateColumn(column) && !isStudyPlanDayColumn(column)
  )
}

export function taskTypeForColumn(column: string, source: StudyPlanPdfImport | null): TaskType {
  const bucket = source?.column_bucket_map?.[column]
  if (bucket && BUCKET_TASK_TYPE[bucket]) return BUCKET_TASK_TYPE[bucket]
  const lowered = column.toLowerCase()
  if (lowered.includes('tajweed') || lowered.includes('تجويد')) return 'written'
  if (lowered.includes('memor') || lowered.includes('حفظ')) return 'memorise'
  if (lowered.includes('review')) return 'review'
  return 'memorise'
}

export function findTaskIndexForColumn(period: PlanPeriod, column: string): number {
  return (period.tasks ?? []).findIndex((task) => {
    const config = task.config ?? {}
    if (String(config.source_column ?? '') === column) return true
    if (config.role === 'day_topic' && String(config.source_column ?? '') === column) return true
    const supporting = config.supporting_fields as Record<string, { column?: string }> | undefined
    if (supporting?.page_count?.column === column) return true
    if (supporting?.interpretation_page?.column === column) return true
    return false
  })
}

export function readColumnValue(period: PlanPeriod, column: string): string {
  const idx = findTaskIndexForColumn(period, column)
  if (idx < 0) return ''
  const task = period.tasks[idx]
  const config = task.config ?? {}
  const fromConfig = String(config.source_value ?? '').trim()
  if (fromConfig) return fromConfig
  if (config.page_count != null && String(config.page_count).trim()) {
    return String(config.page_count).trim()
  }
  if (config.interpretation_page != null && String(config.interpretation_page).trim()) {
    return String(config.interpretation_page).trim()
  }
  const title = task.title?.trim() ?? ''
  const prefix = `${column}:`
  if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
    return title.slice(prefix.length).trim()
  }
  return title
}

export function buildTaskPayloadForColumn(
  column: string,
  value: string,
  source: StudyPlanPdfImport | null,
  orderIndex: number
) {
  const trimmed = value.trim()
  const taskType = taskTypeForColumn(column, source)
  const bucket = source?.column_bucket_map?.[column]
  const config: Record<string, unknown> = {
    source_column: column,
    source_value: trimmed,
  }
  if (bucket) config.kpi_bucket = bucket

  const lowered = column.toLowerCase()
  if (lowered.includes('page') && !lowered.includes('interpret') && !lowered.includes('tafsir')) {
    config.page_count = trimmed
  }
  if (lowered.includes('interpret') || lowered.includes('tafsir') || lowered.includes('تفسير')) {
    config.interpretation_page = trimmed
  }

  return {
    title: trimmed ? `${column}: ${trimmed}` : column,
    description: undefined as string | undefined,
    task_type: taskType,
    required: true,
    order_index: orderIndex,
    config,
  }
}

export function findDayIndexForDate(
  days: { scheduled_date?: string; day_number: number }[],
  dateKey: string,
  dayNumber?: number
): number {
  const key = dateKey.slice(0, 10)
  const byDate = days.findIndex((d) => (d.scheduled_date ?? '').slice(0, 10) === key)
  if (byDate >= 0) return byDate
  if (dayNumber == null) return -1
  return days.findIndex((d) => d.day_number === dayNumber)
}
