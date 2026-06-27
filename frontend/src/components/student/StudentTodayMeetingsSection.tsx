import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Calendar, Clock, Loader2, Video } from 'lucide-react'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import { fetchStudentTodayMeetings } from '@/services/meetApi'
import { queryKeys } from '@/lib/queryKeys'
import { StudentMeetJoinButton } from '@/components/meet/StudentMeetJoinButton'
import {
  formatMeetingTimeRange,
  meetingScheduleStatus,
} from '@/lib/studentMeetings'

export function StudentTodayMeetingsSection() {
  const { t } = useTranslation()
  const { data: meetings = [], isPending } = useQuery({
    queryKey: queryKeys.student.meetingsToday(),
    queryFn: fetchStudentTodayMeetings,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  })

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t('student.meetings.todaysClasses')}</h2>
        <p className="text-xs text-slate-500">{t('student.meetings.meetingsFromAll', { date: todayLabel })}</p>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
        {isPending ? (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            {t('student.meetings.loadingMeetings')}
          </div>
        ) : meetings.length === 0 ? (
          <p className="text-sm text-slate-500">{t('student.meetings.noMeetings')}</p>
        ) : (
          <div className="space-y-3">
            {meetings.map((meeting) => {
              const status = meetingScheduleStatus(meeting)
              const isLive = status === 'Live'
              return (
                <div
                  key={meeting.id}
                  className={clsx(
                    'flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
                    isLive
                      ? 'border-emerald-200 bg-emerald-50/50'
                      : 'border-slate-200 bg-slate-50/80',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={clsx(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                          isLive
                            ? 'bg-emerald-600 text-white'
                            : status === 'Upcoming'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-200 text-slate-600',
                        )}
                      >
                        {status}
                      </span>
                      {meeting.class_name ? (
                        <span className="truncate text-[11px] font-semibold text-slate-500">
                          {meeting.class_name}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm font-bold text-slate-900">{meeting.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {t('common.today')}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatMeetingTimeRange(meeting)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StudentMeetJoinButton
                      meetUrl={meeting.meet_url}
                      startAt={meeting.start_at}
                    />
                    <Link
                      to={`/student/classes?class=${encodeURIComponent(meeting.class_id)}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {t('student.meetings.details')}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
