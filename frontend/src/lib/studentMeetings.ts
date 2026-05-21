import { format, formatDistanceToNow, isToday, parseISO } from 'date-fns'
import type { ClassMeeting } from '@/services/meetApi'

export function formatMeetingStartTime(iso: string): string {
  try {
    return format(parseISO(iso), 'h:mm a')
  } catch {
    return ''
  }
}

export function formatMeetingDayLabel(iso: string): string {
  try {
    const d = parseISO(iso)
    if (isToday(d)) return 'Today'
    return format(d, 'EEE, MMM d')
  } catch {
    return 'Scheduled'
  }
}

/** Badge text for the hero card, e.g. "Up Next • Live in 12 minutes". */
export function meetingUpNextBadge(meeting: ClassMeeting): string {
  try {
    const start = parseISO(meeting.start_at)
    const end = parseISO(meeting.end_at)
    const now = Date.now()
    if (now >= start.getTime() && now <= end.getTime()) {
      return 'Up Next • Live now'
    }
    if (start.getTime() > now) {
      const dist = formatDistanceToNow(start, { addSuffix: false })
      return `Up Next • Live in ${dist}`
    }
    return 'Up Next'
  } catch {
    return 'Up Next'
  }
}

export function formatMeetingTimeRange(meeting: ClassMeeting): string {
  const start = formatMeetingStartTime(meeting.start_at)
  const end = formatMeetingStartTime(meeting.end_at)
  if (start && end) return `${start} – ${end}`
  return start || 'Time TBD'
}

/** Status label for schedule cards (Live / Upcoming / Ended). */
export function meetingScheduleStatus(meeting: ClassMeeting): string {
  try {
    const start = parseISO(meeting.start_at).getTime()
    const end = parseISO(meeting.end_at).getTime()
    const now = Date.now()
    if (now >= start && now <= end) return 'Live'
    if (now < start) return 'Upcoming'
    return 'Ended'
  } catch {
    return 'Upcoming'
  }
}

export function isMeetingActive(meeting: ClassMeeting, nowMs = Date.now()): boolean {
  try {
    return nowMs < parseISO(meeting.end_at).getTime()
  } catch {
    return false
  }
}

export function pickNextMeeting(meetings: ClassMeeting[]): ClassMeeting | null {
  const active = meetings.filter((m) => isMeetingActive(m))
  if (!active.length) return null
  const now = Date.now()
  const live = active.find((m) => {
    try {
      const start = parseISO(m.start_at).getTime()
      const end = parseISO(m.end_at).getTime()
      return now >= start && now <= end
    } catch {
      return false
    }
  })
  if (live) return live
  const upcoming = active.find((m) => {
    try {
      return parseISO(m.start_at).getTime() > now
    } catch {
      return false
    }
  })
  return upcoming ?? active[0]
}
