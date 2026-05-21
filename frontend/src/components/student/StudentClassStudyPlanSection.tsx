import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListChecks,
  Search,
  Sparkles,
  Video,
  Layers,
  Loader2,
  Upload,
  Mic,
  Square,
  Trash2,
} from 'lucide-react'
import { format, isValid, parseISO } from 'date-fns'
import type { StudyPlanPdfImport } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LiveWaveform } from '@/components/ui/live-waveform'
import { clsx } from 'clsx'
import { StudyPlanPdfEmbed } from '@/components/study-plan/StudyPlanPdfEmbed'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import {
  flattenPlanTasks,
  getDayPageTarget,
  getDayTopic,
  getTodayPlanDay,
  isPlanDayReleased,
  isScheduledToday,
  isTaskDone,
  requiresAudioOnToggle,
  filterDaySections,
  paginateDaySections,
  sortTasksBySchedule,
  STUDY_PLAN_DAYS_PER_PAGE,
  type StudentDaySection,
  type StudentPlanDay,
  type StudentPlanTask,
} from '@/lib/studentStudyPlanTasks'

function formatDayDate(scheduledDate?: string) {
  if (!scheduledDate) return null
  try {
    const iso = scheduledDate.length <= 10 ? `${scheduledDate}T12:00:00` : scheduledDate
    const d = parseISO(iso)
    if (!isValid(d)) return null
    if (isScheduledToday(scheduledDate)) return 'Today'
    return format(d, 'EEEE, MMM d')
  } catch {
    return null
  }
}

function periodLabel(task: StudentPlanTask) {
  return formatStudyPlanPeriodLabel(task.periodTitle, {
    scheduledDate: task.scheduledDate,
    dayNumber: task.dayNumber,
  })
}

function PageTargetBadge({ value }: { value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1">
      <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
      <span className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Pages</span>
      <span className="text-xs font-black text-indigo-950">{value}</span>
    </div>
  )
}

function TaskRow({
  task,
  highlight,
  onToggle,
  isBusy,
  showPeriodMeta = true,
}: {
  task: StudentPlanTask
  highlight?: boolean
  onToggle: (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => Promise<void>
  isBusy?: boolean
  showPeriodMeta?: boolean
}) {
  const done = isTaskDone(task)
  const needsAudio = requiresAudioOnToggle(task)
  const [showAudioField, setShowAudioField] = useState(false)
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null)
  const [audioName, setAudioName] = useState<string>('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])

  const clearAudioState = () => {
    setAudioDataUrl(null)
    setAudioName('')
  }

  const stopRecorderStream = () => {
    if (recorderStreamRef.current) {
      recorderStreamRef.current.getTracks().forEach((t) => t.stop())
      recorderStreamRef.current = null
    }
    setRecordingStream(null)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderStreamRef.current = stream
      setRecordingStream(stream)
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      recorderChunksRef.current = []
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) recorderChunksRef.current.push(evt.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(recorderChunksRef.current, { type: 'audio/webm' })
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(String(reader.result || ''))
          reader.onerror = () => reject(new Error('Could not read recording'))
          reader.readAsDataURL(blob)
        })
        setAudioDataUrl(dataUrl)
        setAudioName('Recorded audio.webm')
        stopRecorderStream()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      // Keep lightweight: parent toast already handles failed submits; this is optional UX.
    }
  }

  const stopRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }

  const handleAudioPick = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Could not read audio file'))
      reader.readAsDataURL(file)
    })
    setAudioDataUrl(dataUrl)
    setAudioName(file.name)
  }

  const handleToggleClick = async () => {
    if (isBusy) return
    if (done) {
      await onToggle(task, false)
      setShowAudioField(false)
      setIsRecording(false)
      stopRecorderStream()
      clearAudioState()
      return
    }
    if (needsAudio) {
      setShowAudioField(true)
      return
    }
    await onToggle(task, true)
  }

  const handleSubmitAudioToggle = async () => {
    if (!audioDataUrl || isBusy) return
    await onToggle(task, true, audioDataUrl)
    setShowAudioField(false)
    setIsRecording(false)
    stopRecorderStream()
    clearAudioState()
  }

  return (
    <div
      className={clsx(
        'w-full rounded-xl border p-3 transition-all',
        highlight && !done && 'border-blue-200 bg-blue-50/40 shadow-sm ring-1 ring-blue-100',
        done
          ? 'border-emerald-100 bg-emerald-50/30 opacity-80'
          : 'border-slate-100 bg-white shadow-sm hover:border-blue-200 hover:shadow',
      )}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={clsx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            done ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-50 text-slate-300',
          )}
        >
          {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-[11px] font-bold sm:text-xs', done ? 'text-emerald-700' : 'text-slate-800')}>
            {task.title}
          </p>
          {showPeriodMeta ? (
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
              {periodLabel(task)}
              {task.periodDuration ? ` · ${task.periodDuration}m` : ''}
            </p>
          ) : null}
          {needsAudio && (
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-violet-600">
              Audio required
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={done ? 'outline' : 'default'}
          disabled={isBusy}
          onClick={handleToggleClick}
          className={clsx(
            'h-8 shrink-0 rounded-lg px-2.5 text-[10px] font-black',
            done ? 'border-emerald-200 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? 'Undo' : 'Done'}
        </Button>
      </div>

      {showAudioField && !done && (
        <div className="mt-2.5 rounded-lg border border-violet-200 bg-violet-50/60 p-2.5">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-violet-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-violet-700 hover:bg-violet-50">
            <Upload className="h-3.5 w-3.5" />
            <span className="truncate">{audioName || 'Upload audio (optional fallback)'}</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleAudioPick(file)
              }}
            />
          </label>
          {isRecording ? (
            <LiveWaveform
              active
              mode="scrolling"
              stream={recordingStream}
              height={52}
              className="mt-2 rounded-md bg-white"
            />
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!isRecording ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => void startRecording()}
                className="h-8 rounded-md px-2.5 text-[10px] font-bold text-violet-700"
              >
                <Mic className="mr-1 h-3.5 w-3.5" />
                Record audio
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isBusy}
                onClick={stopRecording}
                className="h-8 rounded-md bg-rose-600 px-2.5 text-[10px] font-black text-white hover:bg-rose-700"
              >
                <Square className="mr-1 h-3.5 w-3.5 fill-current" />
                Stop
              </Button>
            )}
            {audioDataUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={clearAudioState}
                className="h-8 rounded-md px-2.5 text-[10px] font-bold"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
          {audioDataUrl && <audio className="mt-2 h-8 w-full" controls src={audioDataUrl} />}
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!audioDataUrl || isBusy}
              onClick={handleSubmitAudioToggle}
              className="h-8 rounded-md bg-violet-600 px-2.5 text-[10px] font-black text-white hover:bg-violet-700"
            >
              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Submit with audio'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => {
                setShowAudioField(false)
                setIsRecording(false)
                stopRecorderStream()
                clearAudioState()
              }}
              className="h-8 rounded-md px-2.5 text-[10px] font-bold"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

type ToggleTaskHandler = (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => Promise<void>

function DayPlanCard({
  day,
  pageTarget,
  dayTopic,
  tasks,
  onToggleTask,
  togglingTaskId,
  isToday,
}: {
  day: StudentPlanDay
  pageTarget: string | null
  dayTopic: string | null
  tasks: StudentPlanTask[]
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
  isToday?: boolean
}) {
  const dateLabel = formatDayDate(day.scheduled_date)

  return (
    <article
      className={clsx(
        'overflow-hidden rounded-xl border bg-white shadow-sm',
        isToday ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200',
      )}
    >
      <div
        className={clsx(
          'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3',
          isToday ? 'border-blue-100 bg-blue-50/50' : 'border-slate-100 bg-slate-50/80',
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={clsx(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black',
              isToday ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200',
            )}
          >
            {day.day_number}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">Day {day.day_number}</p>
            {dateLabel ? (
              <p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                <Calendar className="h-3 w-3 shrink-0" />
                {dateLabel}
              </p>
            ) : null}
            {dayTopic ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-snug text-indigo-900">
                {dayTopic}
              </p>
            ) : null}
          </div>
        </div>
        {pageTarget ? <PageTargetBadge value={pageTarget} /> : null}
      </div>
      <div className="flex flex-col gap-2 p-3">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              highlight={isToday}
              onToggle={onToggleTask}
              isBusy={togglingTaskId === task.id}
              showPeriodMeta
            />
          ))
        ) : (
          <p className="py-2 text-center text-xs font-semibold text-slate-400">No tasks for this day.</p>
        )}
      </div>
    </article>
  )
}

function comparePlanDays(a: StudentPlanDay, b: StudentPlanDay) {
  const da = a.scheduled_date?.slice(0, 10) ?? ''
  const db = b.scheduled_date?.slice(0, 10) ?? ''
  if (da && db && da !== db) return da.localeCompare(db)
  return a.day_number - b.day_number
}

function StudyPlanByDayBrowser({
  sections,
  onToggleTask,
  togglingTaskId,
}: {
  sections: StudentDaySection[]
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const initRef = useRef(false)
  const lastDayIdsRef = useRef<string>('')

  const filtered = useMemo(
    () => filterDaySections(sections, searchQuery),
    [sections, searchQuery],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / STUDY_PLAN_DAYS_PER_PAGE))
  const safePage = Math.min(pageIndex, totalPages - 1)

  const visible = useMemo(
    () => paginateDaySections(filtered, safePage, STUDY_PLAN_DAYS_PER_PAGE),
    [filtered, safePage],
  )

  useEffect(() => {
    setPageIndex(0)
  }, [searchQuery])

  useEffect(() => {
    setPageIndex((p) => Math.min(p, Math.max(0, totalPages - 1)))
  }, [totalPages])

  useEffect(() => {
    const dayIdsSig = sections.map((s) => s.day.id).join('|')
    if (initRef.current && lastDayIdsRef.current === dayIdsSig) {
      return
    }

    initRef.current = true
    lastDayIdsRef.current = dayIdsSig

    const todayIdx = sections.findIndex((s) => s.isToday)
    setPageIndex(todayIdx >= 0 ? Math.floor(todayIdx / STUDY_PLAN_DAYS_PER_PAGE) : 0)
    setSearchQuery('')
  }, [sections])

  const rangeStart = filtered.length === 0 ? 0 : safePage * STUDY_PLAN_DAYS_PER_PAGE + 1
  const rangeEnd = Math.min((safePage + 1) * STUDY_PLAN_DAYS_PER_PAGE, filtered.length)

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by day number, date, task, or pages..."
          className="h-9 rounded-xl border-slate-200 bg-white pl-9 text-xs font-medium placeholder:text-slate-400"
        />
      </div>

      {filtered.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 rounded-lg text-xs font-bold"
              disabled={safePage <= 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <p className="text-center text-[10px] font-semibold text-slate-600">
              Days {rangeStart}–{rangeEnd} of {filtered.length}
              {searchQuery.trim() ? (
                <span className="block text-[9px] font-medium text-slate-400">
                  {filtered.length} match{filtered.length === 1 ? '' : 'es'} · page {safePage + 1}/{totalPages}
                </span>
              ) : (
                <span className="block text-[9px] font-medium text-slate-400">
                  Page {safePage + 1} of {totalPages}
                </span>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 rounded-lg text-xs font-bold"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {visible.map(({ day, pageTarget, dayTopic, tasks, isToday }) => (
              <DayPlanCard
                key={day.id}
                day={day}
                pageTarget={pageTarget}
                dayTopic={dayTopic}
                tasks={tasks}
                onToggleTask={onToggleTask}
                togglingTaskId={togglingTaskId}
                isToday={isToday}
              />
            ))}
          </div>
        </>
      ) : sections.length > 0 ? (
        <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/50 py-6 text-center text-[11px] font-medium leading-relaxed text-amber-800">
          No days match &ldquo;{searchQuery.trim()}&rdquo;. Try another day number, date, or task name.
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs font-semibold text-slate-400">
          No days in this plan yet.
        </p>
      )}
    </div>
  )
}

export function StudentClassStudyPlanSection({
  planName,
  planDays,
  planSource,
  zoomLink,
  onToggleTask,
  togglingTaskId,
}: {
  planName: string
  planDays: StudentPlanDay[]
  planSource: StudyPlanPdfImport | null
  zoomLink?: string
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
}) {
  const releasedPlanDays = useMemo(
    () => planDays.filter((day) => isPlanDayReleased(day.scheduled_date)),
    [planDays],
  )

  const todayDay = getTodayPlanDay(releasedPlanDays)
  const todayTasks = todayDay ? sortTasksBySchedule(flattenPlanTasks([todayDay])) : []
  const todayPageTarget = todayDay ? getDayPageTarget(todayDay) : null
  const todayDayTopic = todayDay ? getDayTopic(todayDay) : null
  const todayDayId = todayDay?.id

  const daySections = useMemo(() => {
    return releasedPlanDays
      .map((day) => ({
        day,
        pageTarget: getDayPageTarget(day),
        dayTopic: getDayTopic(day),
        tasks: sortTasksBySchedule(flattenPlanTasks([day])),
        isToday: day.id === todayDayId,
      }))
      .filter((section) => section.tasks.length > 0 || section.pageTarget || section.dayTopic)
      .sort((a, b) => comparePlanDays(a.day, b.day))
  }, [releasedPlanDays, todayDayId])

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
            <Layers className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-900 sm:text-base">
              {planName}
            </h3>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              {releasedPlanDays.length} of {planDays.length} days available · study plan
            </p>
          </div>
        </div>
        {zoomLink ? (
          <Button
            variant="outline"
            className="min-h-0 h-10 shrink-0 rounded-xl border-blue-200 px-4 text-xs font-black text-blue-600 hover:bg-blue-50"
            onClick={() => window.open(zoomLink, '_blank')}
          >
            <Video className="h-4 w-4 shrink-0" /> Live Zoom
          </Button>
        ) : null}
      </div>

      {todayDay ? (
        <section className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Sparkles className="h-4 w-4 text-blue-600" />
            Today
          </h4>
          <DayPlanCard
            day={todayDay}
            pageTarget={todayPageTarget}
            dayTopic={todayDayTopic}
            tasks={todayTasks}
            onToggleTask={onToggleTask}
            togglingTaskId={togglingTaskId}
            isToday
          />
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
          <p className="text-xs font-semibold text-slate-500">
            No day is scheduled for today. Open your plan by day below.
          </p>
        </section>
      )}

      <StudyPlanPdfEmbed
        pdfUrl={planSource?.pdf_url}
        title="Study plan PDF"
        filename={planSource?.original_filename}
        emptyMessage="No PDF is available for this class yet."
      />

      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardHeader className="space-y-1 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-900">
            <ListChecks className="h-4 w-4 text-slate-500" />
            Study plan by day
          </CardTitle>
          <CardDescription className="text-[10px] font-semibold text-slate-400">
            Only today and earlier days are shown. Future days unlock on their scheduled date.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <StudyPlanByDayBrowser
            sections={daySections}
            onToggleTask={onToggleTask}
            togglingTaskId={togglingTaskId}
          />
        </CardContent>
      </Card>
    </div>
  )
}
