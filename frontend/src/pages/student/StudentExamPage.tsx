import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Send, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import { Button } from '@/components/ui/button'
import {
  ExamQuestionStudentView,
  type StudentExamAnswers,
} from '@/components/competition/ExamQuestionStudentView'
import {
  migrateExamContent,
  countAnswerableQuestions,
  isAnswerableQuestion,
  type ExamQuestion,
} from '@/lib/competitionExam'
import {
  clearLocalExamDraft,
  draftResponsesToAnswers,
  loadLocalExamDraft,
  pickNewerDraft,
  saveLocalExamDraft,
  type ExamDraftPhase,
} from '@/lib/examDraftStorage'
import { queryKeys } from '@/lib/queryKeys'
import { useCompetitionExamRealtime } from '@/hooks/useCompetitionRealtime'
import { competitionListQueryOptions } from '@/lib/competitionQueries'

type ExamPhase = 'loading' | 'welcome' | 'exam' | 'submitted'

export default function StudentExamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<ExamPhase>('loading')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [isExamActive, setIsExamActive] = useState(false)
  const [answers, setAnswers] = useState<StudentExamAnswers>({})
  const [submitting, setSubmitting] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)

  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const draftRestoredRef = useRef(false)
  const bootstrappedCompIdRef = useRef<string | null>(null)

  const answerableQuestions = useMemo(
    () => questions.filter(isAnswerableQuestion),
    [questions],
  )

  const buildResponses = useCallback(
    () =>
      answerableQuestions.map((q, index) => {
        const a = answers[q.id]
        return {
          index,
          question_id: q.id,
          type: q.type,
          answer: a,
        }
      }),
    [answerableQuestions, answers],
  )

  const applyDraftAnswers = useCallback((draftAnswers: StudentExamAnswers, draftPhase?: ExamDraftPhase) => {
    setAnswers(draftAnswers)
    const urls: Record<string, string> = {}
    for (const [qid, ans] of Object.entries(draftAnswers)) {
      if (typeof ans === 'object' && ans && 'audioDataUrl' in ans && typeof ans.audioDataUrl === 'string') {
        urls[qid] = ans.audioDataUrl
      }
    }
    setAudioUrls(urls)
    setHasDraft(Object.keys(draftAnswers).length > 0)
    if (draftPhase === 'exam') {
      setPhase('exam')
    }
  }, [])

  const restoreDraft = useCallback(
    async (competitionId: string, examActive: boolean) => {
      if (draftRestoredRef.current) return
      const local = loadLocalExamDraft(competitionId)
      let serverAnswers: StudentExamAnswers = {}
      let serverPhase: ExamDraftPhase | undefined
      let serverSavedAt: string | undefined
      try {
        const r = await competitionApi.getExamDraft(competitionId)
        if (r.success && r.data) {
          serverAnswers = draftResponsesToAnswers(
            (r.data.responses || []) as Array<{ question_id?: string; answer?: unknown }>,
          )
          serverPhase = (r.data.phase as ExamDraftPhase) || undefined
          serverSavedAt = r.data.saved_at ?? undefined
        }
      } catch {
        /* server draft optional */
      }
      const picked = pickNewerDraft(local, serverSavedAt, serverAnswers, serverPhase)
      if (picked && Object.keys(picked.answers).length > 0) {
        draftRestoredRef.current = true
        applyDraftAnswers(picked.answers, examActive ? picked.phase : undefined)
        toast.success('Your saved progress was restored')
      }
    },
    [applyDraftAnswers],
  )

  const { data: competitionInfo, isLoading: infoLoading } = useQuery({
    queryKey: queryKeys.competitions.info(id ?? ''),
    queryFn: async () => {
      const r = await competitionApi.getCompetitionInfo(id!)
      if (!r.success) throw new Error(r.error?.message || 'Failed to load exam')
      return r.data
    },
    enabled: !!id,
    ...competitionListQueryOptions(),
  })

  const title = competitionInfo?.title ?? ''

  useCompetitionExamRealtime(
    id,
    (active) => {
      setIsExamActive(active)
      if (!active && phase === 'exam') {
        toast.error('The exam window was closed. Your answers are saved.')
        setPhase('welcome')
      }
    },
    { showToast: true },
  )

  useEffect(() => {
    if (!id || !competitionInfo) return
    setIsExamActive(!!competitionInfo.is_exam_active)
    if (bootstrappedCompIdRef.current !== id) {
      bootstrappedCompIdRef.current = id
      draftRestoredRef.current = false
      setQuestions(migrateExamContent(competitionInfo.content, competitionInfo.category))
      setPhase('welcome')
      void restoreDraft(id, !!competitionInfo.is_exam_active)
    }
  }, [id, competitionInfo, restoreDraft])

  useEffect(() => {
    if (!id) return
    if (infoLoading && !competitionInfo) {
      setPhase('loading')
    }
  }, [id, infoLoading, competitionInfo])

  const setAnswer = (qid: string, value: StudentExamAnswers[string]) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }))
    setHasDraft(true)
  }

  const startRecording = useCallback(async (qid: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.onloadend = () => {
          const dataUrl = reader.result as string
          setAudioUrls((prev) => {
            if (prev[qid]?.startsWith('blob:')) URL.revokeObjectURL(prev[qid])
            return { ...prev, [qid]: dataUrl }
          })
          setAnswers((prev) => ({ ...prev, [qid]: { audioDataUrl: dataUrl } }))
          setHasDraft(true)
        }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach((t) => t.stop())
        setRecordingId(null)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingId(qid)
    } catch {
      toast.error('Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // Auto-save draft locally (immediate debounce) + server (longer debounce)
  useEffect(() => {
    if (!id || phase !== 'exam') return
    const localTimer = window.setTimeout(() => {
      saveLocalExamDraft({
        competitionId: id,
        answers,
        phase: 'exam',
        questions,
        savedAt: new Date().toISOString(),
      })
    }, 400)
    return () => clearTimeout(localTimer)
  }, [id, phase, answers, questions])

  useEffect(() => {
    if (!id || phase !== 'exam' || submitting) return
    const serverTimer = window.setTimeout(() => {
      const responses = buildResponses()
      if (responses.length === 0) return
      competitionApi.saveExamDraft(id, { responses, phase: 'exam' }).catch(() => {})
    }, 3000)
    return () => clearTimeout(serverTimer)
  }, [id, phase, answers, submitting, buildResponses])

  const answeredCount = answerableQuestions.filter((q) => {
    const a = answers[q.id]
    if (a === undefined || a === '') return false
    if (typeof a === 'object' && a && 'dataUrls' in a) return a.dataUrls.length > 0
    if (typeof a === 'object' && a && 'audioDataUrl' in a) return !!a.audioDataUrl
    return true
  }).length

  const handleSubmit = async () => {
    if (!id) return
    const unanswered = answerableQuestions.length - answeredCount
    if (unanswered > 0) {
      if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return
    }

    setSubmitting(true)
    try {
      const res = await competitionApi.submitExam(id, buildResponses())
      if (res.success) {
        clearLocalExamDraft(id)
        void queryClient.refetchQueries({
          queryKey: queryKeys.competitions.studentRegistrations(),
          type: 'active',
        })
        toast.success('Exam submitted successfully!')
        setPhase('submitted')
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      toast.error(err?.response?.data?.error?.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const displayIndexById = useMemo(() => {
    const map: Record<string, number> = {}
    let n = 0
    for (const q of questions) {
      if (isAnswerableQuestion(q)) {
        n += 1
        map[q.id] = n
      }
    }
    return map
  }, [questions])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Loading exam...</p>
        </div>
      </div>
    )
  }

  if (phase === 'submitted') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-blue-50 p-4">
        <div className="max-w-md rounded-3xl bg-white p-10 text-center shadow-xl">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-2xl font-black text-slate-900">Submission complete</h1>
          <p className="mb-8 text-sm leading-relaxed text-slate-500">
            Your answers have been submitted. MCQ items are auto-graded; other responses will be reviewed by your teachers.
          </p>
          <Button onClick={() => navigate('/student/competitions')} className="bg-blue-600 hover:bg-blue-700">
            Back to competitions
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'welcome') {
    const n = countAnswerableQuestions(questions)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-blue-950 p-4">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-10 text-center backdrop-blur-xl">
          <h1 className="mb-2 text-3xl font-black text-white">{title}</h1>
          <p className="mb-6 text-sm text-white/50">{n} question(s)</p>
          {hasDraft && (
            <p className="mb-4 text-xs font-medium text-emerald-300">Saved progress available — continue where you left off.</p>
          )}
          <div className="mb-8 space-y-2 rounded-2xl bg-white/5 p-5 text-left">
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-white/40">Rules</h3>
            <p className="text-sm text-white/70">1. Answer each question in order.</p>
            <p className="text-sm text-white/70">2. Your answers are saved automatically.</p>
            <p className="text-sm text-white/70">3. Review your work before submitting.</p>
          </div>
          {n === 0 ? (
            <div className="mb-4 flex items-center justify-center gap-2 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Exam not configured yet.
            </div>
          ) : !isExamActive ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <p className="text-sm font-medium text-amber-200">Waiting for the exam to start…</p>
              </div>
              <Button size="lg" disabled className="w-full cursor-not-allowed opacity-50">
                Enter exam
              </Button>
            </div>
          ) : (
            <Button
              size="lg"
              className="w-full bg-blue-600 py-3 text-base font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700"
              onClick={() => setPhase('exam')}
            >
              {hasDraft ? 'Resume exam' : 'Enter exam'}
            </Button>
          )}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mx-auto mt-4 block text-sm text-white/40 transition-colors hover:text-white/70"
          >
            <ArrowLeft className="mr-1 inline h-3 w-3" /> Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-black text-slate-800">{title}</h1>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {answeredCount} / {answerableQuestions.length} answered · auto-saved
            </p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-1 bg-emerald-600 hover:bg-emerald-700"
            size="sm"
          >
            <Send className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Submit all'}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        {questions.map((q) => (
          <ExamQuestionStudentView
            key={q.id}
            question={q}
            displayIndex={displayIndexById[q.id] ?? 0}
            answer={answers[q.id]}
            onAnswer={setAnswer}
            recordingId={recordingId}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            audioPreviewUrl={audioUrls[q.id]}
          />
        ))}
      </div>
    </div>
  )
}
