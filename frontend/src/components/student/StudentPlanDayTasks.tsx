import { useRef, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  Loader2,
  Upload,
  Mic,
  Square,
  Trash2,
} from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/button'
import { LiveWaveform } from '@/components/ui/live-waveform'
import { AudioWaveformPlayer } from '@/components/ui/audio-waveform-player'
import { formatStudyPlanPeriodLabel } from '@/lib/studyPlanLabels'
import {
  isTaskDone,
  requiresAudioOnToggle,
  type StudentPlanTask,
} from '@/lib/studentStudyPlanTasks'

type ToggleTaskHandler = (task: StudentPlanTask, checked: boolean, audioDataUrl?: string) => Promise<void>

function periodLabel(task: StudentPlanTask) {
  return formatStudyPlanPeriodLabel(task.periodTitle, {
    scheduledDate: task.scheduledDate,
    dayNumber: task.dayNumber,
  })
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
  onToggle: ToggleTaskHandler
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
      /* optional UX */
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
          {needsAudio ? (
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-violet-600">
              Audio required
            </p>
          ) : null}
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

      {showAudioField && !done ? (
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
              updateRate={90}
              historySize={140}
              height={52}
              barColor="#94a3b8"
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
            {audioDataUrl ? (
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
            ) : null}
          </div>
          {audioDataUrl ? (
            <AudioWaveformPlayer src={audioDataUrl} className="mt-2" height={38} />
          ) : null}
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
      ) : null}
    </div>
  )
}

export function StudentPlanDayTasks({
  tasks,
  highlightToday,
  onToggleTask,
  togglingTaskId,
}: {
  tasks: StudentPlanTask[]
  highlightToday?: boolean
  onToggleTask: ToggleTaskHandler
  togglingTaskId?: string | null
}) {
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          highlight={highlightToday}
          onToggle={onToggleTask}
          isBusy={togglingTaskId === task.id}
          showPeriodMeta
        />
      ))}
    </div>
  )
}
