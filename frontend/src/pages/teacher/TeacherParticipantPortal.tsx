import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, CheckCircle, SaveAll, Mic, FileText, BadgeCheck, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { competitionApi } from '@/services/competitionApi'
import type { Competition, CompetitionRegistration } from '@/types'
import clsx from 'clsx'

export default function TeacherParticipantPortal() {
  const { competition_id, registration_id } = useParams<{ competition_id: string; registration_id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [registration, setRegistration] = useState<CompetitionRegistration | null>(null)

  // Evaluation state
  const [score, setScore] = useState<number>(0)
  const [remarks, setRemarks] = useState<string>('')
  const [responses, setResponses] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [competition_id, registration_id])

  const fetchData = async () => {
    if (!competition_id || !registration_id) return
    setLoading(true)
    try {
      const [compRes, regsRes] = await Promise.all([
        competitionApi.getCompetitionInfo(competition_id),
        competitionApi.getCompetitionRegistrations(competition_id)
      ])

      if (compRes.success) setCompetition(compRes.data)

      if (regsRes.success) {
        const reg = regsRes.data.find(r => r.id === registration_id)
        if (reg) {
          setRegistration(reg)
          setResponses(reg.responses || [])

          if (reg.competition_results && reg.competition_results.length > 0) {
            setScore(reg.competition_results[0].score)
            setRemarks(reg.competition_results[0].remarks || '')
          } else {
            // For MCQ, we could auto-calculate if it hasn't been saved yet, but we rely on the backend auto-eval
            setScore(0)
          }
        } else {
          toast.error("Participant not found")
          navigate(`/teacher/competitions`)
        }
      }
    } catch (err) {
      toast.error('Failed to load evaluation data')
    } finally {
      setLoading(false)
    }
  }

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
    setIsSaving(true)
    try {
      await competitionApi.evaluateParticipant(
        competition_id,
        registration_id,
        score,
        remarks,
        responses,
        releaseResults
      )
      toast.success(releaseResults ? 'Results Published to Student!' : 'Evaluation Draft Saved!')
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

  const isMcq = competition.category === 'mcq'
  const isReleased = registration.results_released

  return (
    <div className="max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-2 -ml-2 text-slate-500 hover:text-slate-900 border-none shadow-none">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Participants
          </Button>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Participant Review</h1>
            {isReleased ? (
              <div className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 border border-emerald-100">
                <CheckCircle className="w-3.5 h-3.5" /> Published
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 border border-amber-100">
                <AlertCircle className="w-3.5 h-3.5" /> Draft / Under Review
              </div>
            )}
          </div>
        </div>
        {!isReleased && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="rounded-xl font-bold bg-white"
            >
              <Save className="w-4 h-4 mr-2" /> Save Draft
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={isSaving}
              className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/30"
            >
              <SaveAll className="w-4 h-4 mr-2" /> Publish Results
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Content Review */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-[2rem] border-0 shadow-xl shadow-slate-200/50 overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                Submission Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {!registration.is_submitted ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Participant has not submitted the exam yet.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {(competition.content || []).map((item, index) => {
                    const response = responses.find(r => r.index === index)

                    if (isMcq) {
                      const isCorrectAuto = response?.answer === item.correct_option
                      const teacherOverride = response?.teacher_override // 'correct' | 'wrong' | undefined

                      const finalIsCorrect = teacherOverride === 'correct' ? true : teacherOverride === 'wrong' ? false : isCorrectAuto


                      return (
                        <div key={index} className="p-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
                          <div className="flex justify-between items-start gap-4 mb-4">
                            <h4 className="font-bold text-slate-800 text-lg">Q{index + 1}. {item.question}</h4>
                            <div className={clsx(
                              "px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider shrink-0",
                              finalIsCorrect ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                            )}>
                              {finalIsCorrect ? 'Correct' : 'Incorrect'}
                            </div>
                          </div>

                          <div className="space-y-3 mb-6">
                            {item.options.map((opt: string, optIdx: number) => {
                              const isSelected = response?.answer === optIdx
                              const isCorrectOpt = item.correct_option === optIdx

                              return (
                                <div
                                  key={optIdx}
                                  className={clsx(
                                    "p-3 rounded-xl border flex items-center justify-between text-sm font-medium transition-all",
                                    isSelected && isCorrectOpt ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                                      isSelected && !isCorrectOpt ? "bg-red-50 border-red-200 text-red-800" :
                                        !isSelected && isCorrectOpt ? "bg-emerald-50/50 border-emerald-100 text-emerald-700 border-dashed" :
                                          "bg-slate-50 border-slate-100 text-slate-600"
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400 shadow-sm shrink-0">
                                      {String.fromCharCode(65 + optIdx)}
                                    </span>
                                    {opt}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isSelected && (
                                      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">Selected</span>
                                    )}
                                    {isCorrectOpt && (
                                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100/50 px-2 py-0.5 rounded-md">Correct Option</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Manual Override</Label>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={teacherOverride === 'correct' ? 'default' : 'outline'}
                                className={clsx("rounded-lg", teacherOverride === 'correct' && "bg-emerald-600 hover:bg-emerald-700")}
                                onClick={() => handleUpdateResponse(index, { teacher_override: teacherOverride === 'correct' ? undefined : 'correct' })}
                                disabled={isReleased}
                              >
                                Mark as Correct
                              </Button>
                              <Button
                                size="sm"
                                variant={teacherOverride === 'wrong' ? 'default' : 'outline'}
                                className={clsx("rounded-lg", teacherOverride === 'wrong' && "bg-red-600 hover:bg-red-700")}
                                onClick={() => handleUpdateResponse(index, { teacher_override: teacherOverride === 'wrong' ? undefined : 'wrong' })}
                                disabled={isReleased}
                              >
                                Mark as Wrong
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Hifz / Khirat
                    return (
                      <div key={index} className="p-6 rounded-2xl border border-slate-100 bg-white shadow-sm">
                        <h4 className="font-bold text-slate-800 text-lg mb-2">Passage {index + 1}</h4>
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 mb-6 text-slate-700 font-medium">
                          {item.text}
                        </div>

                        <div className="mb-6">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Student Recording</Label>
                          {response?.audio_url ? (
                            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                <Mic className="w-5 h-5" />
                              </div>
                              <audio src={response.audio_url} controls className="w-full h-10 outline-none" />
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400 italic p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                              No audio recorded for this passage.
                            </div>
                          )}
                        </div>

                        <div>
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Teacher Feedback</Label>
                          <Textarea
                            placeholder="Add specific comments about pronunciation, tajweed, memorization..."
                            className="rounded-xl border-slate-200 min-h-[100px] resize-none focus:ring-indigo-500"
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

        {/* Right Column: Final Grading */}
        <div className="space-y-6">
          <Card className="rounded-[2rem] border-0 shadow-xl shadow-blue-900/5 bg-gradient-to-br from-indigo-600 to-blue-700 text-white overflow-hidden sticky top-6">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '16px 16px' }} />
            <CardHeader className="relative z-10 border-b border-white/10 pb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner">
                  <BadgeCheck className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">Participant</p>
                  <CardTitle className="text-xl font-black">{registration.name}</CardTitle>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-blue-100 font-medium">
                <span className="opacity-70">Phone:</span> {registration.phone}
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pt-6 space-y-6">
              <div>
                <Label className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2 block">Final Score (0-100)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    disabled={!registration.is_submitted || isReleased}
                    className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 text-4xl font-black h-20 rounded-2xl text-center focus-visible:ring-white/30 disabled:opacity-50"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-2 block">General Remarks</Label>
                <Textarea
                  placeholder="Excellent performance..."
                  disabled={!registration.is_submitted || isReleased}
                  className="bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 min-h-[140px] rounded-2xl resize-none focus-visible:ring-white/30 disabled:opacity-50"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {!isReleased && (
                <Button
                  className="w-full h-12 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-black shadow-lg"
                  onClick={() => handleSave(true)}
                  disabled={!registration.is_submitted || isSaving}
                >
                  {isSaving ? 'Processing...' : 'Publish Results'}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
