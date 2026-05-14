export function isFlatScheduleTitle(title?: string | null): boolean {
  const value = (title ?? '').trim()
  return !value || value === '__flat_schedule__'
}

export function formatStudyPlanDayLabel({
  scheduledDate,
  dayNumber,
}: {
  scheduledDate?: string | null
  dayNumber?: number | null
}): string {
  if (scheduledDate) {
    const parsed = new Date(scheduledDate)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    }
  }

  if (typeof dayNumber === 'number' && Number.isFinite(dayNumber)) {
    return `Day ${dayNumber}`
  }

  return 'Study day'
}

export function formatStudyPlanPeriodLabel(
  title?: string | null,
  options: {
    scheduledDate?: string | null
    dayNumber?: number | null
  } = {}
): string {
  if (isFlatScheduleTitle(title)) {
    return formatStudyPlanDayLabel(options)
  }
  return String(title ?? '').trim()
}
