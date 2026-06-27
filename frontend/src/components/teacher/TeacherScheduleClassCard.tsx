import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { Clock, Loader2, Pencil, PlayCircle, Trash2, Users } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MeetFormDialog } from '@/components/meet/MeetFormDialog'
import { TranslatedText } from '@/components/shared/TranslatedText'
import { queryKeys } from '@/lib/queryKeys'
import {
  buildStartAtIso,
  parseIsoToClockTime,
  type ClockTime12,
} from '@/lib/meetScheduleTime'
import {
  deleteClassMeeting,
  updateClassMeeting,
  type ClassMeeting,
} from '@/services/meetApi'

function defaultClockTime(): ClockTime12 {
  return { hour12: 9, minute: 0, period: 'AM' }
}

function resetFormFromMeeting(
  meeting: ClassMeeting | null,
  className: string,
): {
  title: string
  date: string
  clock: ClockTime12
  duration: number
} {
  if (!meeting) {
    return {
      title: className,
      date: format(new Date(), 'yyyy-MM-dd'),
      clock: defaultClockTime(),
      duration: 60,
    }
  }
  const clock = parseIsoToClockTime(meeting.start_at)
  let duration = 60
  try {
    const mins = Math.round(
      (parseISO(meeting.end_at).getTime() - parseISO(meeting.start_at).getTime()) / 60_000,
    )
    if (mins >= 15 && mins <= 480) duration = mins
  } catch {
    /* keep default */
  }
  return {
    title: meeting.title,
    date: format(parseISO(meeting.start_at), 'yyyy-MM-dd'),
    clock,
    duration,
  }
}

export function TeacherScheduleClassCard({
  classId,
  batch,
  title,
  time,
  students,
  status,
  meetingTitle,
  meeting,
  zoomLink,
}: {
  classId: string
  batch: string
  title: string
  time: string
  students: number
  status: string
  meetingTitle?: string
  meeting: ClassMeeting | null
  zoomLink?: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const initial = resetFormFromMeeting(meeting, title)
  const [formTitle, setFormTitle] = useState(initial.title)
  const [date, setDate] = useState(initial.date)
  const [clock, setClock] = useState<ClockTime12>(initial.clock)
  const [duration, setDuration] = useState(initial.duration)

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  )

  const invalidateMeetings = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teacher.meetingsToday() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.teacher.classMeetings(classId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.student.upcomingMeetings() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.student.classMeetings(classId) })
  }, [queryClient, classId])

  const buildPayload = useCallback(
    () => ({
      title: formTitle.trim() || title,
      start_at: buildStartAtIso(date, clock.hour12, clock.minute, clock.period),
      duration_minutes: duration,
      timezone,
      scheduled_date: date,
    }),
    [formTitle, title, date, clock, duration, timezone],
  )

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!meeting) throw new Error('No meeting to update')
      return updateClassMeeting(meeting.id, buildPayload())
    },
    onSuccess: () => {
      toast.success(t('teacher.schedule.meetingUpdated'))
      setEditOpen(false)
      invalidateMeetings()
    },
    onError: () => toast.error(t('teacher.schedule.updateFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!meeting) throw new Error('No meeting to delete')
      await deleteClassMeeting(meeting.id)
    },
    onSuccess: () => {
      toast.success(t('teacher.schedule.meetingRemoved'))
      invalidateMeetings()
    },
    onError: () => toast.error(t('teacher.schedule.removeFailed')),
  })

  const openEdit = () => {
    if (!meeting) return
    const next = resetFormFromMeeting(meeting, title)
    setFormTitle(next.title)
    setDate(next.date)
    setClock(next.clock)
    setDuration(next.duration)
    setEditOpen(true)
  }

  const joinUrl = meeting?.meet_url || zoomLink
  const statusBadgeClass =
    status === 'Live'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'Ended'
        ? 'bg-slate-100 text-slate-500'
        : 'bg-blue-50 text-blue-600'

  const meetBusy = updateMutation.isPending || deleteMutation.isPending

  return (
    <>
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-slate-100 text-slate-500 border-none text-[10px] font-bold px-3 py-1 rounded-full">
                {batch}
              </Badge>
              <Badge
                className={clsx(
                  'border-none text-[10px] font-bold px-3 py-1 rounded-full',
                  statusBadgeClass,
                )}
              >
                {status}
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900"><TranslatedText value={title} /></h3>
              {meetingTitle ? (
                <p className="text-sm text-slate-500 mt-0.5">{meetingTitle}</p>
              ) : null}
              <div className="flex items-center gap-4 mt-1.5 text-slate-400 text-sm flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {time}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {students} {t('teacher.schedule.students')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {joinUrl ? (
              <Button
                asChild
                className="flex-1 sm:flex-none gap-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold text-xs"
              >
                <a href={joinUrl} target="_blank" rel="noopener noreferrer">
                  <PlayCircle className="h-4 w-4" /> {t('teacher.schedule.startClass')}
                </a>
              </Button>
            ) : (
              <Button
                disabled
                className="flex-1 sm:flex-none gap-2 bg-blue-600 rounded-xl font-semibold text-xs opacity-60"
              >
                <PlayCircle className="h-4 w-4" /> {t('teacher.schedule.startClass')}
              </Button>
            )}
            {meeting ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-slate-200 text-slate-500 hover:text-indigo-600"
                  onClick={openEdit}
                  disabled={meetBusy}
                  aria-label={t('teacher.schedule.changeMeetingTime')}
                  title={t('teacher.schedule.editMeeting')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-slate-200 text-slate-500 hover:text-red-600"
                  onClick={() => deleteMutation.mutate()}
                  disabled={meetBusy}
                  aria-label={t('teacher.schedule.removeMeeting')}
                  title={t('teacher.schedule.deleteMeeting')}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {meeting ? (
        <MeetFormDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) {
              const next = resetFormFromMeeting(meeting, title)
              setFormTitle(next.title)
              setDate(next.date)
              setClock(next.clock)
              setDuration(next.duration)
            }
          }}
          mode="edit"
          title={formTitle}
          onTitleChange={setFormTitle}
          date={date}
          onDateChange={setDate}
          clock={clock}
          onClockChange={setClock}
          duration={duration}
          onDurationChange={setDuration}
          busy={updateMutation.isPending}
          onSubmit={() => updateMutation.mutate()}
        />
      ) : null}
    </>
  )
}
