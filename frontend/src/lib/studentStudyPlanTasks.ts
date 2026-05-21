const PAGE_COUNT_COLUMN_HINTS = [
  'number of pages',
  'no. of pages',
  'no of pages',
  'page count',
  'pages count',
  'pages to complete',
  'required pages',
  'total pages',
  'عدد الصفحات',
  'عدد الاوجه',
  'عدد الأوجه',
] as const

export interface StudentPlanTask {
  id: string
  title: string
  task_type?: string
  kpi_bucket?: string
  study_plan_submissions?: unknown[]
  config?: Record<string, unknown>
  periodTitle: string
  periodDuration?: number
  dayId: string
  dayNumber: number
  scheduledDate?: string
}

export interface StudentPlanDay {
  id: string
  day_number: number
  scheduled_date?: string
  page_target?: string | null
  topic?: string | null
  periods?: {
    id: string
    title: string
    duration_minutes?: number
    tasks?: {
      id: string
      title: string
      study_plan_submissions?: unknown[]
      config?: Record<string, unknown>
    }[]
  }[]
}

function isPageCountColumn(name: string) {
  const value = name.trim().toLowerCase()
  if (['pages', 'page', '# pages', 'total pages'].includes(value)) return true
  return PAGE_COUNT_COLUMN_HINTS.some((hint) => value.includes(hint))
}

function isDayTopicColumn(name: string): boolean {
  const value = name.trim().toLowerCase()
  if (!value) return false
  if (isPageCountColumn(value)) return false
  if (
    value.includes('tajweed') &&
    (value.includes('theoretical') ||
      value.includes('theory') ||
      value.includes('explanation') ||
      value.includes('شرح') ||
      value.includes('نظري') ||
      value.includes('قاعدة'))
  ) {
    return true
  }
  return (
    value.includes('theoretical tajweed') ||
    value.includes('tajweed explanation') ||
    value.includes('theoretical tajweed explanation') ||
    value.includes('شرح التجويد') ||
    value.includes('تجويد نظري')
  )
}

/** Daily lesson topic (e.g. theoretical tajweed column), not a submittable homework row. */
export function isDayTopicTask(task: {
  title?: string
  config?: Record<string, unknown>
}): boolean {
  const config = task.config ?? {}
  if (config.role === 'day_topic') return true
  const sourceColumn = String(config.source_column ?? '')
  if (sourceColumn && isDayTopicColumn(sourceColumn)) return true
  const title = String(task.title ?? '')
  if (title.includes(':')) {
    const prefix = title.split(':', 1)[0]?.trim() ?? ''
    if (prefix && isDayTopicColumn(prefix)) return true
  }
  return isDayTopicColumn(title)
}

function dayTopicLabelFromTask(task: {
  title?: string
  config?: Record<string, unknown>
}): string | null {
  const config = task.config ?? {}
  const sourceColumn = String(config.source_column ?? '').trim()
  const sourceValue = String(config.source_value ?? '').trim()
  if (sourceValue && sourceValue.toLowerCase() !== sourceColumn.toLowerCase()) {
    return sourceValue
  }
  const title = String(task.title ?? '').trim()
  if (title.includes(':')) {
    const prefix = title.split(':', 1)[0]?.trim() ?? ''
    const value = title.split(':', 1)[1]?.trim() ?? ''
    if (value && value.toLowerCase() !== prefix.toLowerCase()) return value
    return prefix || null
  }
  return title || null
}

export function getDayTopic(day: StudentPlanDay): string | null {
  const stored = day.topic?.trim()
  if (stored) return stored
  for (const period of day.periods ?? []) {
    for (const task of period.tasks ?? []) {
      if (!isDayTopicTask(task)) continue
      const label = dayTopicLabelFromTask(task)
      if (label) return label
    }
  }
  return null
}

/** Number-of-pages and similar columns are trackers, not submittable tasks. */
export function isSubmittableTask(task: {
  title?: string
  config?: Record<string, unknown>
}): boolean {
  if (isDayTopicTask(task)) return false
  const config = task.config ?? {}
  if (config.role === 'tracker') return false
  const sourceColumn = String(config.source_column ?? '')
  if (sourceColumn && isPageCountColumn(sourceColumn)) return false
  const title = String(task.title ?? '')
  const titleLower = title.toLowerCase()
  if (PAGE_COUNT_COLUMN_HINTS.some((hint) => titleLower.includes(hint))) return false
  if (titleLower.includes('عدد الأوجه') || titleLower.includes('عدد الاوجه')) return false
  if (title.includes(':')) {
    const prefix = title.split(':', 1)[0]?.trim() ?? ''
    if (prefix && isPageCountColumn(prefix)) return false
  }
  return true
}

/** Spreadsheet column name + cell value for teacher read-only task rows. */
export function getTeacherTaskRowParts(task: {
  title?: string
  config?: Record<string, unknown>
}): { column: string; value: string | null } {
  const config = task.config ?? {}
  let column = String(config.source_column ?? '').trim()
  let value = String(config.source_value ?? '').trim() || null
  const title = String(task.title ?? '').trim()
  if (!column && title.includes(':')) {
    const [prefix, rest] = title.split(':', 2)
    column = prefix?.trim() ?? ''
    value = value || rest?.trim() || null
  }
  if (!column) column = title
  if (!value && title && title !== column) {
    if (title.includes(':')) {
      value = title.split(':', 1)[1]?.trim() || null
    } else if (!config.source_column) {
      value = null
    }
  }
  if (value && value.toLowerCase() === column.toLowerCase()) value = null
  return { column, value }
}

/** Day-shaped plan slice (teacher calendar, student portal). */
export type PlanDayWithPeriods = Pick<StudentPlanDay, 'page_target' | 'periods'>

export function getDayPageTarget(day: PlanDayWithPeriods): string | null {
  if (day.page_target?.trim()) return day.page_target.trim()
  for (const period of day.periods ?? []) {
    for (const task of period.tasks ?? []) {
      const config = task.config ?? {}
      if (config.page_count) return String(config.page_count).trim()
      const supporting = config.supporting_fields as Record<string, { value?: string }> | undefined
      if (supporting?.page_count?.value) return String(supporting.page_count.value).trim()
      if (!isSubmittableTask(task) && titlePageValue(task.title)) {
        return titlePageValue(task.title)
      }
    }
  }
  return null
}

function titlePageValue(title?: string): string | null {
  if (!title?.includes(':')) return null
  const value = title.split(':', 1)[1]?.trim()
  return value || null
}

function dateKey(value?: string): string {
  if (!value) return ''
  return value.slice(0, 10)
}

export function localTodayDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function isScheduledToday(scheduledDate?: string): boolean {
  if (!scheduledDate) return false
  return dateKey(scheduledDate) === localTodayDateKey()
}

/** Past and today are visible; future days stay hidden until their scheduled date. */
export function isPlanDayReleased(scheduledDate?: string): boolean {
  const key = dateKey(scheduledDate)
  if (!key) return true
  return key <= localTodayDateKey()
}

export function flattenPlanTasks(days: StudentPlanDay[]): StudentPlanTask[] {
  const tasks: StudentPlanTask[] = []
  for (const day of days) {
    for (const period of day.periods ?? []) {
      for (const task of period.tasks ?? []) {
        if (!isSubmittableTask(task)) continue
        tasks.push({
          ...task,
          periodTitle: period.title,
          periodDuration: period.duration_minutes,
          dayId: day.id,
          dayNumber: day.day_number,
          scheduledDate: day.scheduled_date,
        })
      }
    }
  }
  return tasks
}

export function getTodayPlanDay(days: StudentPlanDay[]): StudentPlanDay | undefined {
  return days.find((d) => isScheduledToday(d.scheduled_date))
}

export function sortTasksBySchedule(tasks: StudentPlanTask[]): StudentPlanTask[] {
  return [...tasks].sort((a, b) => {
    const da = dateKey(a.scheduledDate) || `day-${a.dayNumber}`
    const db = dateKey(b.scheduledDate) || `day-${b.dayNumber}`
    if (da !== db) return da.localeCompare(db)
    if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber
    return a.title.localeCompare(b.title)
  })
}

export function isTaskDone(task: StudentPlanTask): boolean {
  return (task.study_plan_submissions?.length ?? 0) > 0
}

const AUDIO_REQUIRED_LABELS = ['المقرر الجديد', 'المراجعة الكبرى'] as const

function matchesArabicAudioLabel(text: string): boolean {
  const value = text.trim().toLowerCase()
  if (!value) return false
  return AUDIO_REQUIRED_LABELS.some((label) => value.includes(label.toLowerCase()))
}

/** Tasks requiring audio proof on student toggle. */
export function requiresAudioOnToggle(task: Pick<StudentPlanTask, 'title' | 'config'>): boolean {
  const title = String(task.title ?? '')
  if (matchesArabicAudioLabel(title)) return true

  const config = task.config ?? {}
  const sourceColumn = String(config.source_column ?? '')
  if (matchesArabicAudioLabel(sourceColumn)) return true

  const sourceValue = String(config.source_value ?? '')
  if (matchesArabicAudioLabel(sourceValue)) return true

  return false
}

export const STUDY_PLAN_DAYS_PER_PAGE = 10

export type StudentDaySection = {
  day: StudentPlanDay
  pageTarget: string | null
  dayTopic: string | null
  tasks: StudentPlanTask[]
  isToday: boolean
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDateKey(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Parse common date search inputs to `YYYY-MM-DD` for exact day matching. */
export function parseFlexibleDateQuery(query: string): string | null {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return null

  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return isoDateKey(+m[1], +m[2], +m[3])

  m = q.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const year = +m[3]
    if (a > 12 && b <= 12) return isoDateKey(year, b, a)
    if (b > 12 && a <= 12) return isoDateKey(year, a, b)
    return isoDateKey(year, b, a) ?? isoDateKey(year, a, b)
  }

  m = q.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/)
  if (m) {
    const month = MONTH_NAME_TO_NUMBER[m[2]]
    if (month) return isoDateKey(+m[3], month, +m[1])
  }

  m = q.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const month = MONTH_NAME_TO_NUMBER[m[1]]
    if (month) return isoDateKey(+m[3], month, +m[2])
  }

  return null
}

function appendDateSearchVariants(raw: string, parts: string[]) {
  try {
    const d = new Date(`${raw}T12:00:00`)
    if (Number.isNaN(d.getTime())) return
    const y = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    const monthLong = d.toLocaleDateString('en-US', { month: 'long' }).toLowerCase()
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' }).toLowerCase()

    parts.push(
      d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric' }),
      d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      raw,
      `${pad2(day)}/${pad2(month)}/${y}`,
      `${day}/${month}/${y}`,
      `${day} ${monthLong} ${y}`,
      `${day} ${monthShort} ${y}`,
      `${monthLong} ${day} ${y}`,
      `${monthLong} ${day}, ${y}`,
    )
  } catch {
    /* ignore */
  }
}

/** Lowercase blob used to match search queries against a day block. */
export function daySectionSearchText(section: StudentDaySection): string {
  const { day, pageTarget, dayTopic, tasks } = section
  const parts: string[] = [
    String(day.day_number),
    `day ${day.day_number}`,
    day.scheduled_date ?? '',
  ]
  if (dayTopic) parts.push(dayTopic)

  const raw = day.scheduled_date?.slice(0, 10)
  if (raw) appendDateSearchVariants(raw, parts)

  if (pageTarget) parts.push(pageTarget)
  for (const task of tasks) {
    parts.push(task.title)
    parts.push(task.periodTitle)
    if (task.periodDuration != null) parts.push(`${task.periodDuration}m`)
  }

  return parts.join(' ').toLowerCase()
}

export function filterDaySections(
  sections: StudentDaySection[],
  query: string,
): StudentDaySection[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return sections

  const dateKey = parseFlexibleDateQuery(query)
  if (dateKey) {
    return sections.filter((section) => (section.day.scheduled_date?.slice(0, 10) ?? '') === dateKey)
  }

  return sections.filter((section) => daySectionSearchText(section).includes(q))
}

export function paginateDaySections<T>(items: T[], pageIndex: number, pageSize: number): T[] {
  const start = pageIndex * pageSize
  return items.slice(start, start + pageSize)
}
