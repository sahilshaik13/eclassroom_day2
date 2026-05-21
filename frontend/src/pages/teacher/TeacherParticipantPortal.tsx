import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, CheckCircle, SaveAll, FileText, BadgeCheck, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { AudioWaveformPlayer } from '@/components/ui/audio-waveform-player'
import { competitionApi } from '@/services/competitionApi'
import type { Competition, CompetitionRegistration, CompetitionRegistrationsMeta } from '@/types'
import clsx from 'clsx'
import { useAuthStore } from '@/stores/authStore'
import { useCompetitionGradingRealtime } from '@/hooks/useCompetitionRealtime'
import { isAutoGradableMcq, migrateExamContent } from '@/lib/competitionExam'

export default function TeacherParticipantPortal() {
  const { competition_id, registration_id } = useParams<{ competition_id: string; registration_id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [registration, setRegistration] = useState<CompetitionRegistration | null>(null)

  // Evaluation state
  const [score, setScore] = useState<number | null>(null)
  const [remarks, setRemarks] = useState<string>('')
  const [responses, setResponses] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [evalMeta, setEvalMeta] = useState<CompetitionRegistrationsMeta | null>(null)

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!competition_id || !registration_id) return
    if (!opts?.silent) setLoading(true)
    try {
      const [compRes, regsRes] = await Promise.all([
        competitionApi.getCompetitionInfo(competition_id),
        competitionApi.getCompetitionRegistrations(competition_id)
      ])

      if (compRes.success) setCompetition(compRes.data)

      if (regsRes.success) {
        const { registrations: regList, meta } = regsRes.data
        setEvalMeta(meta)
        const reg = regList.find(r => r.id === registration_id)
        if (reg) {
          setRegistration(reg)
          setResponses(reg.responses || [])

          const gs = reg.competition_grader_scores || []
          const mine = user?.id ? gs.find((s) => s.grader_user_id === user.id) : undefined
          if (mine) {
            setScore(mine.score)
            setRemarks(mine.remarks || '')
          } else if (gs.length === 0 && reg.competition_results?.length) {
            setScore(reg.competition_results[0].score)
            setRemarks('')
          } else {
            setScore(null)
            setRemarks('')
          }
        } else {
          toast.error("Participant not found")
          navigate(`/teacher/competitions`)
        }
      }
    } catch (err) {
      if (!opts?.silent) toast.error('Failed to load evaluation data')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [competition_id, registration_id, user?.id, navigate])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useCompetitionGradingRealtime(competition_id, () => {
    void fetchData({ silent: true })
  })

  const handleUpdateResponse = (index: number, updates: any) => {
    const newResponses = [...responses]
    const existing = newResponses.find(r => r.index === index) || { index }
    newResponses[newResponses.findIndex(r => r.index === index) > -1 ? newResponses.findIndex(r => r.index === index) : newResponses.length] = {
      ...existing,
      ...updates
    }
    setResponses(newResponses)
  }

  const handleSave = async (releaseResults: boolean) => {
    if (!competition_id || !registration_id) return
    if (score === null) {
      toast.error('Please enter a score before saving')
      return
    }
    const collaborative = evalMeta?.collaborative_grading ?? false
    const effectiveRelease = collaborative ? false : releaseResults
    setIsSaving(true)
    try {
      await competitionApi.evaluateParticipant(
        competition_id,
        registration_id,
        score,
        remarks,
        responses,
        effectiveRelease
      )
      if (collaborative) {
        toast.success('Your score was saved. Once every grader submits, the admin can publish the results to students.')
      } else {
        toast.success(releaseResults ? 'Results Published to Student!' : 'Evaluation Draft Saved!')
      }
      await fetchData()
    } catch (err) {
      toast.error('Failed to save evaluation')
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64 text-slate-400 gap-3">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      Loading participant data...
    </div>
  )

  if (!competition || !registration) return null

  if (user?.role === 'teacher' && evalMeta && !evalMeta.my_can_grade) {
    return (
      <div className="max-w-lg mx-auto py-20 px-6 text-center space-y-4">
        <p className="text-lg font-bold text-slate-800">Grading not assigned</p>
        <p className="text-sm text-slate-600">
          You can configure this exam if you have setup access, but you are not on the grading roster for this competition.
        </p>
        <Button variant="outline" onClick={() => navigate('/teacher/competitions')}>Back to competitions</Button>
      </div>
    )
  }

  const examQuestions = migrateExamContent(competition.content, competition.category)
  const isReleased = registration.results_released
  const graderScores = registration.competition_grader_scores || []
  const official = registration.competition_results?.[0]
  const collaborative = evalMeta?.collaborative_grading ?? false
  const expectedN = evalMeta?.expected_grader_count ?? 0
  const submittedN = new Set(graderScores.map((s) => s.grader_user_id)).size
  const allGradersSubmitted = collaborative && expectedN > 0 && submittedN >= expectedN

  const statusBadge = isReleased ? (
    <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 sm:text-xs">
      <CheckCircle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> Released
    </div>
  ) : allGradersSubmitted ? (
    <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800 sm:text-xs">
      <AlertCircle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> Admin publish
    </div>
  ) : collaborative ? (
    <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 sm:text-xs">
      <AlertCircle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
      <span>Graders {submittedN}/{expectedN}</span>
    </div>
  ) : (
    <div className="inline-flex w-fit items-center gap-1 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 sm:text-xs">
      <AlertCircle className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" /> Draft
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl pb-28 md:pb-20">
      {/* Header — stack on mobile so title and badge never overlap */}
      <header className="mb-4 space-y-3 md:mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="-ml-2 h-9 px-2 text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
              Participant review
            </h1>
            {statusBadge}
          </div>

          {!isReleased && (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={isSaving || score === null}
                size="sm"
                className="h-10 min-h-10 w-full gap-1.5 font-semibold sm:w-auto sm:min-w-[8.5rem]"
              >
                <Save className="h-4 w-4 shrink-0" />
                <span className="truncate">{collaborative ? 'Save' : 'Save draft'}</span>
              </Button>
              {!collaborative && (
                <Button
                  onClick={() => handleSave(true)}
                  disabled={isSaving || score === null}
                  size="sm"
                  className="h-10 min-h-10 w-full gap-1.5 font-semibold sm:w-auto sm:min-w-[8.5rem] bg-blue-600 hover:bg-blue-700"
                >
                  <SaveAll className="h-4 w-4 shrink-0" />
                  <span className="truncate">Publish</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Participant summary first on mobile — then questions; sidebar on lg */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
        {/* Grading sidebar — order-1 on mobile, order-2 on lg stays right via grid placement */}
        <div className="order-1 space-y-4 lg:order-2 lg:space-y-6">
          <Card className="relative overflow-hidden rounded-xl border-0 bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-lg shadow-blue-900/10 lg:sticky lg:top-4">
            <div
              className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '16px 16px',
              }}
            />
            <CardHeader className="relative z-10 border-b border-white/10 p-4 pb-4 lg:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 backdrop-blur-sm lg:h-12 lg:w-12 lg:rounded-2xl">
                  <BadgeCheck className="h-5 w-5 text-white lg:h-6 lg:w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">Participant</p>
                  <CardTitle className="truncate text-lg font-black lg:text-xl">{registration.name}</CardTitle>
                  <p className="mt-1 truncate text-xs text-blue-100/90">
                    <span className="opacity-70">Phone</span> {registration.phone}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4 p-4 pt-4 lg:p-6 lg:pt-6">
              {official && graderScores.length > 0 && (
                <div className="space-y-1 rounded-lg border border-white/20 bg-white/10 p-3 text-xs text-blue-50">
                  <p className="font-bold text-white/90">
                    {allGradersSubmitted && !isReleased
                      ? 'All grader scores in — awaiting admin publish'
                      : collaborative && !isReleased
                        ? 'Provisional average (hidden from students)'
                        : graderScores.length > 1
                          ? 'Official average'
                          : 'Official score'}
                  </p>
                  <p className="text-2xl font-black text-white">{official.score}/100</p>
                  {collaborative && expectedN > 0 && (
                    <p className="pt-1 text-[10px] opacity-90">
                      {allGradersSubmitted
                        ? `Submitted ${submittedN} / ${expectedN} — admin can publish`
                        : `Submitted ${submittedN} / ${expectedN}`}
                    </p>
                  )}
                  <ul className="mt-2 space-y-0.5 text-[11px] opacity-90">
                    {graderScores.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span className="truncate">{s.grader_name || 'Evaluator'}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{s.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <Label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-blue-100 lg:text-xs">
                  {collaborative
                    ? 'Your score (0–100), averaged when all graders save'
                    : 'Final score (0–100)'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  disabled={!registration.is_submitted || isReleased}
                  className="h-14 rounded-xl border-white/20 bg-white/10 text-center text-2xl font-black text-white placeholder:text-blue-200/50 focus-visible:ring-white/30 disabled:opacity-50 lg:h-16 lg:text-3xl"
                  value={score ?? ''}
                  onChange={(e) => setScore(e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>

              <div>
                <Label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-blue-100 lg:text-xs">
                  General remarks
                </Label>
                <Textarea
                  placeholder="Overall feedback…"
                  disabled={!registration.is_submitted || isReleased}
                  className="min-h-[100px] resize-none rounded-xl border-white/20 bg-white/10 text-sm text-white placeholder:text-blue-200/50 focus-visible:ring-white/30 disabled:opacity-50 lg:min-h-[120px]"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {!isReleased && !collaborative && (
                <Button
                  className="h-11 w-full rounded-xl bg-white font-black text-blue-700 hover:bg-blue-50"
                  onClick={() => handleSave(true)}
                  disabled={!registration.is_submitted || isSaving || score === null}
                >
                  {isSaving ? 'Processing…' : 'Publish results'}
                </Button>
              )}
              {!isReleased && collaborative && (
                <Button
                  className="h-11 w-full rounded-xl bg-white font-black text-blue-700 hover:bg-blue-50"
                  onClick={() => handleSave(false)}
                  disabled={!registration.is_submitted || isSaving || score === null}
                >
                  {isSaving ? 'Saving…' : 'Save your score'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Questions / submission */}
        <div className="order-2 min-w-0 space-y-4 lg:order-1 lg:col-span-2 lg:space-y-6">
          <Card className="overflow-hidden rounded-xl border border-slate-100 shadow-md">
            <CardHeader className="border-b border-slate-100 bg-slate-50/80 p-4">
              <CardTitle className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <FileText className="h-4 w-4 shrink-0 text-indigo-500 sm:h-5 sm:w-5" />
                Submission details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {!registration.is_submitted ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
                  <AlertCircle className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="font-medium text-slate-500">Participant has not submitted the exam yet.</p>
                </div>
              ) : (
                <div className="space-y-6 sm:space-y-8">
                  {examQuestions.map((item, index) => {
                    const response = responses.find(r => r.index === index)

                    if (isAutoGradableMcq(item) && Array.isArray(item.options)) {
                      const isCorrectAuto = response?.answer === item.correct_option
                      const teacherOverride = response?.teacher_override // 'correct' | 'wrong' | undefined

                      const finalIsCorrect = teacherOverride === 'correct' ? true : teacherOverride === 'wrong' ? false : isCorrectAuto


                      return (
                        <div key={index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <h4 className="min-w-0 flex-1 text-sm font-bold leading-snug text-slate-900 sm:text-base">
                              Q{index + 1}. {item.prompt}
                            </h4>
                            <div className={clsx(
                              'inline-flex w-fit shrink-0 rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wide sm:text-xs',
                              finalIsCorrect ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'
                            )}>
                              {finalIsCorrect ? 'Correct' : 'Incorrect'}
                            </div>
                          </div>

                          <div className="mb-4 space-y-2">
                            {(item.options ?? []).map((opt: string, optIdx: number) => {
                              const isSelected = response?.answer === optIdx
                              const isCorrectOpt = item.correct_option === optIdx

                              return (
                                <div
                                  key={optIdx}
                                  className={clsx(
                                    'rounded-lg border px-3 py-2.5 text-sm transition-colors',
                                    isSelected && isCorrectOpt ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
                                      isSelected && !isCorrectOpt ? 'border-red-200 bg-red-50 text-red-900' :
                                        !isSelected && isCorrectOpt ? 'border-dashed border-emerald-200 bg-emerald-50/60 text-emerald-800' :
                                          'border-slate-100 bg-slate-50 text-slate-700'
                                  )}
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-sm">
                                        {String.fromCharCode(65 + optIdx)}
                                      </span>
                                      <span className="min-w-0 flex-1 break-words font-medium leading-snug">{opt}</span>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
                                      {isSelected && (
                                        <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200/80">
                                          Selected
                                        </span>
                                      )}
                                      {isCorrectOpt && (
                                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/80">
                                          Key
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                            <Label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Manual override
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant={teacherOverride === 'correct' ? 'default' : 'outline'}
                                className={clsx(
                                  'h-9 rounded-lg px-3 text-xs font-semibold',
                                  teacherOverride === 'correct' && 'bg-emerald-600 hover:bg-emerald-700'
                                )}
                                onClick={() => handleUpdateResponse(index, { teacher_override: teacherOverride === 'correct' ? undefined : 'correct' })}
                                disabled={isReleased}
                              >
                                Mark correct
                              </Button>
                              <Button
                                size="sm"
                                variant={teacherOverride === 'wrong' ? 'default' : 'outline'}
                                className={clsx(
                                  'h-9 rounded-lg px-3 text-xs font-semibold',
                                  teacherOverride === 'wrong' && 'bg-red-600 hover:bg-red-700'
                                )}
                                onClick={() => handleUpdateResponse(index, { teacher_override: teacherOverride === 'wrong' ? undefined : 'wrong' })}
                                disabled={isReleased}
                              >
                                Mark wrong
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Hifz / Khirat
                    return (
                      <div key={index} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                        <h4 className="mb-2 text-sm font-bold text-slate-800 sm:text-base">Passage {index + 1}</h4>
                        <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm font-medium leading-relaxed text-slate-700">
                          {item.prompt}
                        </div>

                        <div className="mb-4">
                          <Label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Student recording
                          </Label>
                          {response?.audio_url ? (
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50/80 p-3">
                              <AudioWaveformPlayer src={response.audio_url} height={38} />
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm italic text-slate-400">
                              No audio recorded for this passage.
                            </div>
                          )}
                        </div>

                        <div>
                          <Label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Teacher feedback
                          </Label>
                          <Textarea
                            placeholder="Pronunciation, tajweed, memorization…"
                            className="min-h-[88px] resize-none rounded-lg border-slate-200 text-sm focus-visible:ring-indigo-500"
                            value={response?.teacher_comment || ''}
                            onChange={(e) => handleUpdateResponse(index, { teacher_comment: e.target.value })}
                            disabled={isReleased}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
