import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ExternalLink, Loader2, Pencil, Trash2, Video } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { MeetFormDialog } from '@/components/meet/MeetFormDialog'
import { queryKeys } from '@/lib/queryKeys'
import {
  buildStartAtIso,
  canJoinMeeting,
  parseIsoToClockTime,
  type ClockTime12,
} from '@/lib/meetScheduleTime'
import {
  createClassMeeting,
  deleteClassMeeting,
  fetchTeacherClassMeetings,
  updateClassMeeting,
  type ClassMeeting,
} from '@/services/meetApi'
import { subscribeToClassMeetings } from '@/lib/realtime'

function formatMeetingWhen(iso: string) {
  try {
    return format(parseISO(iso), 'EEE, MMM d · h:mm a')
  } catch {
    return iso
  }
}

function defaultClockTime(): ClockTime12 {
  return { hour12: 9, minute: 0, period: 'AM' }
}

interface TeacherClassMeetPanelProps {
  classId: string
  className: string
  defaultDate: Date
  compact?: boolean
}

export function TeacherClassMeetPanel({
  classId,
  className,
  defaultDate,
  compact,
}: TeacherClassMeetPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState<ClassMeeting | null>(null)
  const [title, setTitle] = useState(className)
  const [date, setDate] = useState(() => format(defaultDate, 'yyyy-MM-dd'))
  const [clock, setClock] = useState<ClockTime12>(defaultClockTime)
  const [duration, setDuration] = useState(60)

  const resetForm = useCallback(
    (meeting?: ClassMeeting | null) => {
      if (meeting) {
        setTitle(meeting.title)
        const start = parseIsoToClockTime(meeting.start_at)
        setClock(start)
        setDate(format(parseISO(meeting.start_at), 'yyyy-MM-dd'))
        try {
          const startMs = parseISO(meeting.start_at).getTime()
          const endMs = parseISO(meeting.end_at).getTime()
          const mins = Math.round((endMs - startMs) / 60_000)
          if (mins >= 15 && mins <= 480) setDuration(mins)
        } catch {
          setDuration(60)
        }
        return
      }
      setTitle(className)
      setDate(format(defaultDate, 'yyyy-MM-dd'))
      setClock(defaultClockTime())
      setDuration(60)
    },
    [className, defaultDate],
  )

  useEffect(() => {
    if (!modalOpen && !editingMeeting) {
      setTitle(className)
      setDate(format(defaultDate, 'yyyy-MM-dd'))
    }
  }, [className, defaultDate, modalOpen, editingMeeting])

  const meetingsKey = queryKeys.teacher.classMeetings(classId)

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: meetingsKey,
    queryFn: () => fetchTeacherClassMeetings(classId),
    enabled: !!classId,
    staleTime: 30_000,
    retry: false,
  })

  useEffect(() => {
    if (!classId) return
    return subscribeToClassMeetings(classId, () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKey })
    })
  }, [classId, meetingsKey, queryClient])

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  )

  const buildPayload = useCallback(
    () => ({
      title: title.trim() || className,
      start_at: buildStartAtIso(date, clock.hour12, clock.minute, clock.period),
      duration_minutes: duration,
      timezone,
      scheduled_date: date,
    }),
    [title, className, date, clock, duration, timezone],
  )

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createClassMeeting(classId, buildPayload())
      if (!result.ok && result.needAuth) {
        window.location.assign(result.authUrl)
        return null
      }
      if (!result.ok) throw new Error(result.message)
      return result.meeting
    },
    onSuccess: (meeting) => {
      if (!meeting) return
      toast.success(t('teacher.meet.meetCreated'))
      setModalOpen(false)
      resetForm()
      void queryClient.invalidateQueries({ queryKey: meetingsKey })
    },
    onError: (err: Error) => toast.error(err.message || t('teacher.meet.createFailed')),
  })

  const updateMutation = useMutation({
    mutationFn: async (meetingId: string) => updateClassMeeting(meetingId, buildPayload()),
    onSuccess: () => {
      toast.success(t('teacher.schedule.meetingUpdated'))
      setEditingMeeting(null)
      void queryClient.invalidateQueries({ queryKey: meetingsKey })
      void queryClient.invalidateQueries({ queryKey: queryKeys.student.upcomingMeetings() })
    },
    onError: () => toast.error(t('teacher.schedule.updateFailed')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteClassMeeting(id),
    onSuccess: () => {
      toast.success(t('teacher.schedule.meetingRemoved'))
      void queryClient.invalidateQueries({ queryKey: meetingsKey })
    },
    onError: () => toast.error(t('teacher.schedule.removeFailed')),
  })

  const openCreate = () => {
    setEditingMeeting(null)
    resetForm()
    setModalOpen(true)
  }

  const openEdit = (m: ClassMeeting) => {
    setModalOpen(false)
    resetForm(m)
    setEditingMeeting(m)
  }

  const formDialog = (
    <MeetFormDialog
      open={modalOpen || !!editingMeeting}
      onOpenChange={(open) => {
        if (!open) {
          setModalOpen(false)
          setEditingMeeting(null)
          resetForm()
        }
      }}
      mode={editingMeeting ? 'edit' : 'create'}
      title={title}
      onTitleChange={setTitle}
      date={date}
      onDateChange={setDate}
      clock={clock}
      onClockChange={setClock}
      duration={duration}
      onDurationChange={setDuration}
      busy={createMutation.isPending || updateMutation.isPending}
      onSubmit={() => {
        if (editingMeeting) updateMutation.mutate(editingMeeting.id)
        else createMutation.mutate()
      }}
    />
  )

  const headerButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
      onClick={openCreate}
      aria-label={t('teacher.meet.createGoogleMeet')}
      title={t('teacher.meet.createGoogleMeet')}
    >
      <Video className="h-4 w-4" />
    </Button>
  )

  if (compact) {
    return (
      <>
        {headerButton}
        {formDialog}
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('teacher.meet.upcomingMeetings')}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs font-bold"
          onClick={openCreate}
        >
          <Video className="h-3.5 w-3.5" />
          {t('teacher.meet.createMeet')}
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-xs text-slate-500">{t('teacher.meet.noUpcoming')}</p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              onEdit={() => openEdit(m)}
              onDelete={() => deleteMutation.mutate(m.id)}
              deleting={deleteMutation.isPending}
            />
          ))}
        </ul>
      )}
      {formDialog}
    </div>
  )
}

function MeetingRow({
  meeting,
  onEdit,
  onDelete,
  deleting,
}: {
  meeting: ClassMeeting
  onEdit: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const { t } = useTranslation()
  const canJoin = canJoinMeeting(meeting.start_at)

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{meeting.title}</p>
        <p className="text-[10px] font-medium text-slate-500">{formatMeetingWhen(meeting.start_at)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-slate-400 hover:text-indigo-600"
        onClick={onEdit}
        aria-label={t('meet.changeMeetingTime')}
        title={t('teacher.schedule.editMeeting')}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {canJoin ? (
        <a
          href={meeting.meet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-700"
        >
          {t('teacher.meet.join')}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="rounded-md bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500">
          {t('teacher.meet.scheduled')}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-slate-400 hover:text-red-600"
        disabled={deleting}
        onClick={onDelete}
        aria-label={t('teacher.schedule.removeMeeting')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  )
}

export function TeacherCreateMeetButton(props: TeacherClassMeetPanelProps) {
  return <TeacherClassMeetPanel {...props} compact />
}
