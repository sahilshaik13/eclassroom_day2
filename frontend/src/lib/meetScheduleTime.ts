import { format, parseISO } from 'date-fns'

export type AmPm = 'AM' | 'PM'

export interface ClockTime12 {
  hour12: number
  minute: number
  period: AmPm
}

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const

export { HOURS_12, MINUTE_STEPS }

export function time12To24String(hour12: number, minute: number, period: AmPm): string {
  let h = hour12 % 12
  if (period === 'PM') h += 12
  if (hour12 === 12 && period === 'AM') h = 0
  if (hour12 === 12 && period === 'PM') h = 12
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function parseIsoToClockTime(iso: string): ClockTime12 {
  const d = parseISO(iso)
  const h24 = d.getHours()
  const minute = d.getMinutes()
  const period: AmPm = h24 >= 12 ? 'PM' : 'AM'
  let hour12 = h24 % 12
  if (hour12 === 0) hour12 = 12
  return { hour12, minute, period }
}

export function buildStartAtIso(
  date: string,
  hour12: number,
  minute: number,
  period: AmPm,
): string {
  const time24 = time12To24String(hour12, minute, period)
  return new Date(`${date}T${time24}:00`).toISOString()
}

export function formatClockTimeLabel(clock: ClockTime12): string {
  const m = String(clock.minute).padStart(2, '0')
  return `${clock.hour12}:${m} ${clock.period}`
}

export function canJoinMeeting(startAtIso: string, nowMs = Date.now()): boolean {
  try {
    return nowMs >= parseISO(startAtIso).getTime()
  } catch {
    return false
  }
}

export function joinOpensLabel(startAtIso: string): string {
  try {
    const start = parseISO(startAtIso)
    if (Date.now() >= start.getTime()) return ''
    return `Opens at ${format(start, 'h:mm a')}`
  } catch {
    return 'Not open yet'
  }
}
