import { useRef } from 'react'
import { Mic, MicOff, ImagePlus, CheckCircle2 } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/button'
import { LiveWaveform } from '@/components/ui/live-waveform'
import type { ExamQuestion } from '@/lib/competitionExam'
import { isAnswerableQuestion } from '@/lib/competitionExam'

export type StudentExamAnswers = Record<
  string,
  | number
  | number[]
  | string
  | { dataUrls: string[] }
  | { audioDataUrl: string }
>

type Props = {
  question: ExamQuestion
  displayIndex: number
  answer: StudentExamAnswers[string] | undefined
  onAnswer: (id: string, value: StudentExamAnswers[string]) => void
  recordingId: string | null
  onStartRecording: (id: string) => void
  onStopRecording: () => void
  audioPreviewUrl?: string
  recordingStream?: MediaStream | null
}

export function ExamQuestionStudentView({
  question,
  displayIndex,
  answer,
  onAnswer,
  recordingId,
  onStartRecording,
  onStopRecording,
  audioPreviewUrl,
  recordingStream,
}: Props) {
  if (!isAnswerableQuestion(question)) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{question.prompt}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-600">
          {displayIndex}
        </span>
        <p className="pt-1 text-base font-semibold text-slate-800">{question.prompt}</p>
      </div>

      {question.type === 'mcq' && (
        <McqAnswer
          question={question}
          answer={answer}
          onAnswer={(v) => onAnswer(question.id, v)}
        />
      )}
      {question.type === 'short_answer' && (
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          maxLength={question.max_length}
          value={(answer as string) || ''}
          onChange={(e) => onAnswer(question.id, e.target.value)}
          placeholder={`Up to ${question.max_length} characters`}
        />
      )}
      {question.type === 'long_answer' && (
        <textarea
          className="min-h-[120px] w-full rounded-lg border border-slate-200 p-3 text-sm"
          value={(answer as string) || ''}
          onChange={(e) => onAnswer(question.id, e.target.value)}
          placeholder="Type your answer…"
        />
      )}
      {question.type === 'image_upload' && (
        <ImageAnswer
          maxFiles={question.max_files}
          answer={answer as { dataUrls: string[] } | undefined}
          onAnswer={(v) => onAnswer(question.id, v)}
        />
      )}
      {question.type === 'audio_upload' && (
        <AudioAnswer
          questionId={question.id}
          isRecording={recordingId === question.id}
          audioPreviewUrl={audioPreviewUrl}
          hasRecording={!!audioPreviewUrl}
          onStart={() => onStartRecording(question.id)}
          onStop={onStopRecording}
          onUpload={(dataUrl) => onAnswer(question.id, { audioDataUrl: dataUrl })}
          recordingStream={recordingStream}
        />
      )}
    </div>
  )
}

function McqAnswer({
  question,
  answer,
  onAnswer,
}: {
  question: Extract<ExamQuestion, { type: 'mcq' }>
  answer: StudentExamAnswers[string] | undefined
  onAnswer: (v: number | number[]) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 pl-11 sm:grid-cols-2">
      {question.options.map((opt, oIdx) => {
        const selected = question.allow_multiple
          ? Array.isArray(answer) && (answer as number[]).includes(oIdx)
          : answer === oIdx
        return (
          <button
            key={oIdx}
            type="button"
            onClick={() => {
              if (question.allow_multiple) {
                const cur = new Set(Array.isArray(answer) ? (answer as number[]) : [])
                if (cur.has(oIdx)) cur.delete(oIdx)
                else cur.add(oIdx)
                onAnswer([...cur].sort((a, b) => a - b))
              } else {
                onAnswer(oIdx)
              }
            }}
            className={clsx(
              'rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all',
              selected
                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            <span className="mr-2 text-xs font-black">{String.fromCharCode(65 + oIdx)}.</span>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function ImageAnswer({
  maxFiles,
  answer,
  onAnswer,
}: {
  maxFiles: number
  answer?: { dataUrls: string[] }
  onAnswer: (v: { dataUrls: string[] }) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = answer?.dataUrls ?? []

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).slice(0, maxFiles)
    Promise.all(
      list.map(
        (file) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(file)
          }),
      ),
    ).then((dataUrls) => onAnswer({ dataUrls: [...urls, ...dataUrls].slice(0, maxFiles) }))
  }

  return (
    <div className="space-y-3 pl-11">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => inputRef.current?.click()}>
        <ImagePlus className="h-4 w-4" />
        {urls.length ? 'Add more images' : 'Upload image(s)'}
      </Button>
      <p className="text-[10px] text-slate-400">Up to {maxFiles} file(s)</p>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <img key={i} src={url} alt="" className="h-20 w-20 rounded-lg border object-cover" />
          ))}
        </div>
      )}
    </div>
  )
}

function AudioAnswer({
  questionId: _questionId,
  isRecording,
  audioPreviewUrl,
  hasRecording,
  onStart,
  onStop,
  onUpload,
  recordingStream,
}: {
  questionId: string
  isRecording: boolean
  audioPreviewUrl?: string
  hasRecording: boolean
  onStart: () => void
  onStop: () => void
  onUpload: (dataUrl: string) => void
  recordingStream?: MediaStream | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3 pl-11">
      {hasRecording && audioPreviewUrl && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <audio src={audioPreviewUrl} controls className="h-10 flex-1" />
        </div>
      )}
      <div className="flex items-center gap-3">
        {isRecording ? (
          <Button type="button" onClick={onStop} variant="destructive" size="sm" className="gap-1">
            <MicOff className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button type="button" onClick={onStart} variant="outline" size="sm" className="gap-1">
            <Mic className="h-4 w-4" /> {hasRecording ? 'Re-record' : 'Record'}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onloadend = () => onUpload(reader.result as string)
            reader.readAsDataURL(file)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRecording}
          onClick={() => fileRef.current?.click()}
        >
          Upload audio
        </Button>
        {isRecording && (
          <span className="animate-pulse text-xs font-bold text-red-500">Recording…</span>
        )}
      </div>
      {isRecording ? (
        <LiveWaveform
          active
          mode="scrolling"
          stream={recordingStream ?? null}
          height={56}
          className="bg-white"
        />
      ) : null}
    </div>
  )
}
