import type { StudyPlanPdfImport } from '@/types'

const DATE_COLUMN_HINTS = [
  'date',
  'day/date',
  'day date',
  'التاريخ',
  'التاريخ الميلادي',
  'schedule date',
] as const

const DAY_COLUMN_HINTS = [
  'day',
  'day no',
  'day number',
  'اليوم',
  'رقم اليوم',
] as const

const PAGE_COUNT_COLUMN_HINTS = [
  'number of pages',
  'no. of pages',
  'no of pages',
  'page count',
  'pages count',
  'عدد الصفحات',
  'عدد الاوجه',
  'عدد الأوجه',
] as const

const INTERPRETATION_PAGE_COLUMN_HINTS = [
  'interpretation curriculum/page',
  'interpretation page',
  'tafsir page',
  'meaning page',
  'lesson page',
  'صفحة التفسير',
  'منهج التفسير',
  'التفسير',
] as const

export function getStudyPlanSourceColumns(source: StudyPlanPdfImport | null) {
  if (!source) return []
  return source.selected_columns?.length ? source.selected_columns : source.detected_columns || []
}

export function getStudyPlanSourceRows(source: StudyPlanPdfImport | null) {
  if (!source) return []
  return source.applied_rows?.length
    ? source.applied_rows
    : source.filtered_rows?.length
      ? source.filtered_rows
      : source.extracted_rows || []
}

export function isStudyPlanDateColumn(column: string) {
  const value = column.trim().toLowerCase()
  return DATE_COLUMN_HINTS.some((hint) => value.includes(hint))
}

export function isStudyPlanDayColumn(column: string) {
  const value = column.trim().toLowerCase()
  return DAY_COLUMN_HINTS.some((hint) => value.includes(hint))
}

export function isStudyPlanSupportingColumn(column: string) {
  const value = column.trim().toLowerCase()
  return (
    PAGE_COUNT_COLUMN_HINTS.some((hint) => value.includes(hint)) ||
    INTERPRETATION_PAGE_COLUMN_HINTS.some((hint) => value.includes(hint))
  )
}

export function isStudyPlanInterpretationPageColumn(column: string) {
  const value = column.trim().toLowerCase()
  return INTERPRETATION_PAGE_COLUMN_HINTS.some((hint) => value.includes(hint))
}

export function getDashboardStudyPlanColumns(source: StudyPlanPdfImport | null) {
  return getStudyPlanSourceColumns(source).filter((column) => !isStudyPlanInterpretationPageColumn(column))
}

export function getDashboardStudyPlanTaskEntries(
  row: Record<string, string> | null | undefined,
  columns: string[]
) {
  if (!row) return []

  return columns
    .filter(
      (column) =>
        !isStudyPlanDateColumn(column) &&
        !isStudyPlanDayColumn(column) &&
        !isStudyPlanSupportingColumn(column)
    )
    .map((column) => ({
      label: column,
      value: String(row[column] ?? '').trim(),
    }))
    .filter(({ value }) => {
      const lowered = value.toLowerCase()
      return value && lowered !== '—' && lowered !== '-' && lowered !== 'لا يوجد'
    })
}

function parseSourceDayNumber(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const direct = Number(raw)
  if (Number.isFinite(direct)) return direct
  const match = raw.match(/\d+/)
  return match ? Number(match[0]) : null
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10)
  }

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, day, month, year] = slash
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dash = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) {
    const [, day, month, year] = dash
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const dot = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dot) {
    const [, day, month, year] = dot
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return null
}

export function findStudyPlanSourceRow(
  source: StudyPlanPdfImport | null,
  options: { scheduledDate?: string; dayNumber?: number }
) {
  if (!source) return null

  const columns = getStudyPlanSourceColumns(source)
  const rows = getStudyPlanSourceRows(source)
  const dateColumn = columns.find(isStudyPlanDateColumn)
  const dayColumn = columns.find(isStudyPlanDayColumn)
  const targetDate = options.scheduledDate?.slice(0, 10)
  const targetDayNumber = options.dayNumber

  if (targetDayNumber != null && dayColumn) {
    const matchedByDay = rows.find((row) => parseSourceDayNumber(row?.[dayColumn]) === targetDayNumber)
    if (matchedByDay) return matchedByDay
  }

  if (targetDate && dateColumn) {
    const matchedByDate = rows.find((row) => normalizeDate(row?.[dateColumn]) === targetDate)
    if (matchedByDate) return matchedByDate
  }

  return null
}
