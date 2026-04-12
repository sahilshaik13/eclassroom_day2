import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, CheckCircle2, Send, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import { Button } from '@/components/ui/button'
import { clsx } from 'clsx'

interface MCQQuestion {
  question: string
  options: string[]
  correct_option: number
}

interface Passage {
  title: string
  text: string
  surah_ref?: string
}

type ExamPhase = 'loading' | 'welcome' | 'exam' | 'submitted'

export default function StudentExamPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<ExamPhase>('loading')
  const [category, setCategory] = useState<string>('mcq')
  const [questions, setQuestions] = useState<MCQQuestion[]>([])
  const [passages, setPassages] = useState<Passage[]>([])
  const [title, setTitle] = useState('')

  // MCQ answers: { index: number, answer: number }[]
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>({})

  // Audio recordings: { index: number, audio_url: string }[]
  const [audioBlobs, setAudioBlobs] = useState<Record<number, Blob>>({})
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({})
  const [recordingIdx, setRecordingIdx] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (!id) return
    // Load competition info first
    competitionApi.getCompetitionInfo(id).then(r => {
      if (r.success) {
        setTitle(r.data.title)
        setCategory(r.data.category || 'mcq')

        const content = r.data.content || []
        if (r.data.category === 'mcq') {
          setQuestions(content as MCQQuestion[])
        } else {
          setPassages(content as Passage[])
        }

        if (content.length === 0) {
          toast.error('This exam has not been set up yet.')
          setPhase('welcome')
        } else {
          setPhase('welcome')
        }
      }
    }).catch(() => toast.error('Failed to load exam'))
  }, [id])

  // ── Audio Recording ──
  const startRecording = useCallback(async (idx: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlobs(prev => ({ ...prev, [idx]: blob }))
        setAudioUrls(prev => {
          // Revoke old URL if exists
          if (prev[idx]) URL.revokeObjectURL(prev[idx])
          return { ...prev, [idx]: URL.createObjectURL(blob) }
        })
        stream.getTracks().forEach(t => t.stop())
        setRecordingIdx(null)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingIdx(idx)
    } catch (e) {
      toast.error('Microphone access denied')
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── MCQ Selection ──
  const selectAnswer = (qIdx: number, optIdx: number) => {
    setMcqAnswers(prev => ({ ...prev, [qIdx]: optIdx }))
  }

  // ── Submit ──
  const handleSubmit = async () => {
    if (!id) return

    if (category === 'mcq') {
      const unanswered = questions.length - Object.keys(mcqAnswers).length
      if (unanswered > 0) {
        if (!window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return
      }
    } else {
      const unrecorded = passages.length - Object.keys(audioBlobs).length
      if (unrecorded > 0) {
        if (!window.confirm(`You have ${unrecorded} unrecorded passage(s). Submit anyway?`)) return
      }
    }

    setSubmitting(true)
    try {
      let responses: any[] = []

      if (category === 'mcq') {
        responses = Object.entries(mcqAnswers).map(([idx, answer]) => ({
          index: parseInt(idx),
          answer
        }))
      } else {
        // Upload audio blobs to Supabase Storage placeholder URLs
        // For now, store as data URLs (production should use Storage)
        for (const [idx, blob] of Object.entries(audioBlobs)) {
          const reader = new FileReader()
          const dataUrl: string = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
          responses.push({
            index: parseInt(idx),
            audio_url: dataUrl,
            has_recording: true
          })
        }
      }

      const res = await competitionApi.submitExam(id, responses)
      if (res.success) {
        toast.success('Exam submitted successfully!')
        setPhase('submitted')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const isMCQ = category === 'mcq'

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading exam...</p>
        </div>
      </div>
    )
  }

  // ── Submitted ──
  if (phase === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">Submission Complete</h1>
          <p className="text-slate-500 text-sm mb-8 leading-relaxed">
            Your {isMCQ ? 'answers have been graded automatically' : 'recordings have been submitted for review'}.
            You may now close this window.
          </p>
          <Button onClick={() => navigate('/student/competitions')} className="bg-blue-600 hover:bg-blue-700">
            Back to Competitions
          </Button>
        </div>
      </div>
    )
  }

  // ── Welcome ──
  if (phase === 'welcome') {
    const contentCount = isMCQ ? questions.length : passages.length
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-950 flex items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 max-w-lg text-center">
          <h1 className="text-3xl font-black text-white mb-2">{title}</h1>
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className={clsx(
              'text-[10px] uppercase font-black tracking-widest px-3 py-1 rounded-full',
              isMCQ ? 'bg-violet-500/20 text-violet-300' : 'bg-emerald-500/20 text-emerald-300'
            )}>
              {category}
            </span>
            <span className="text-white/50 text-sm">{contentCount} {isMCQ ? 'questions' : 'passages'}</span>
          </div>

          <div className="bg-white/5 rounded-2xl p-5 mb-8 text-left space-y-2">
            <h3 className="text-xs uppercase font-black text-white/40 tracking-wider mb-3">Rules</h3>
            {isMCQ ? (
              <>
                <p className="text-sm text-white/70">1. Select one option for each question.</p>
                <p className="text-sm text-white/70">2. Your score will be calculated automatically.</p>
                <p className="text-sm text-white/70">3. You can review before submitting.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-white/70">1. Record your recitation for each passage.</p>
                <p className="text-sm text-white/70">2. You can re-record before final submission.</p>
                <p className="text-sm text-white/70">3. Click "Submit All" when you are ready.</p>
              </>
            )}
          </div>

          {contentCount === 0 ? (
            <div className="text-amber-400 text-sm flex items-center justify-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4" /> Exam content not yet configured by teacher.
            </div>
          ) : (
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-3 text-base"
              onClick={() => setPhase('exam')}
            >
              Enter Exam Hall
            </Button>
          )}

          <button onClick={() => navigate(-1)} className="block mx-auto mt-4 text-white/40 hover:text-white/70 text-sm transition-colors">
            <ArrowLeft className="h-3 w-3 inline mr-1" /> Go Back
          </button>
        </div>
      </div>
    )
  }

  // ── Exam Phase ──
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-black text-slate-800">{title}</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              {isMCQ
                ? `${Object.keys(mcqAnswers).length} / ${questions.length} answered`
                : `${Object.keys(audioBlobs).length} / ${passages.length} recorded`
              }
            </p>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1"
            size="sm"
          >
            <Send className="h-4 w-4" /> {submitting ? 'Submitting...' : 'Submit All'}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {/* ── MCQ Mode ── */}
        {isMCQ && questions.map((q, qIdx) => (
          <div key={qIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start gap-3 mb-5">
              <span className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-sm font-black shrink-0">
                {qIdx + 1}
              </span>
              <p className="text-base font-semibold text-slate-800 pt-1">{q.question}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-11">
              {q.options.map((opt, oIdx) => {
                const selected = mcqAnswers[qIdx] === oIdx
                return (
                  <button
                    key={oIdx}
                    onClick={() => selectAnswer(qIdx, oIdx)}
                    className={clsx(
                      'text-left px-4 py-3 rounded-xl border-2 transition-all text-sm font-medium',
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <span className="font-black mr-2 text-xs">{String.fromCharCode(65 + oIdx)}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* ── Audio Mode ── */}
        {!isMCQ && passages.map((p, pIdx) => {
          const isRecording = recordingIdx === pIdx
          const hasRecording = !!audioUrls[pIdx]
          return (
            <div key={pIdx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-black shrink-0">
                    {pIdx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{p.title}</p>
                    {p.surah_ref && <p className="text-xs text-slate-400">{p.surah_ref}</p>}
                  </div>
                </div>

                {/* Arabic Text */}
                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 mb-5">
                  <p className="text-xl text-slate-800 font-arabic text-right leading-loose" dir="rtl">
                    {p.text}
                  </p>
                </div>

                {/* Playback */}
                {hasRecording && (
                  <div className="mb-4 bg-emerald-50 rounded-xl p-3 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <audio src={audioUrls[pIdx]} controls className="flex-1 h-10" />
                  </div>
                )}

                {/* Record Controls */}
                <div className="flex items-center gap-3">
                  {isRecording ? (
                    <Button onClick={stopRecording} variant="destructive" size="sm" className="gap-1">
                      <MicOff className="h-4 w-4" /> Stop Recording
                    </Button>
                  ) : (
                    <Button
                      onClick={() => startRecording(pIdx)}
                      variant="outline"
                      size="sm"
                      className={clsx('gap-1', hasRecording && 'border-emerald-300 text-emerald-600')}
                      disabled={recordingIdx !== null}
                    >
                      <Mic className="h-4 w-4" /> {hasRecording ? 'Re-record' : 'Start Recording'}
                    </Button>
                  )}

                  {isRecording && (
                    <span className="flex items-center gap-2 text-red-500 text-xs font-bold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Recording...
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
