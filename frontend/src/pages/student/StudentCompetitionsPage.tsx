import { useState, useEffect } from 'react'
import { Trophy, Calendar, ArrowRight, Loader2, Info, BookOpen, Mic } from 'lucide-react'
import { clsx } from 'clsx'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { competitionApi } from '@/services/competitionApi'
import type { CompetitionRegistration } from '@/types'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function supplementaryResultText(graderCount: number, remarks?: string | null) {
  const parts: string[] = []
  if (graderCount > 1) parts.push(`Average of ${graderCount} evaluators`)
  if (remarks?.trim()) parts.push(remarks.trim())
  return parts.join(' · ')
}

export default function StudentCompetitionsPage() {
  const [registrations, setRegistrations] = useState<CompetitionRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  
  // Feedback modal state
  const [feedbackReg, setFeedbackReg] = useState<CompetitionRegistration | null>(null)

  useEffect(() => {
    competitionApi.getStudentCompetitions()
      .then(res => {
        if (res.success) setRegistrations(res.data)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-5 pb-28 animate-in fade-in slide-in-from-bottom-4 duration-500 md:pb-20">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Competitions & Events 🏆</h1>
        <p className="text-slate-500 text-sm mt-0.5">Showcase your skills and track your achievements.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-medium">Fetching your competitions...</p>
        </div>
      ) : registrations.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 border border-slate-100">
              <Trophy className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No active registrations</h3>
            <p className="text-slate-500 text-sm max-w-[280px] mt-2">
              You haven't joined any competitions yet. Ask your teacher for registration links to get started!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:gap-4">
          {registrations.map(reg => {
            const comp = reg.competitions
            const hasResult = reg.competition_results && reg.competition_results.length > 0 && reg.results_released;
            const result = hasResult ? reg.competition_results?.[0] : null;
            const graderCount = reg.competition_grader_scores?.length ?? 0;
            const isUnderReview = reg.competition_results && reg.competition_results.length > 0 && !reg.results_released;
            const extraScoreDetail = hasResult ? supplementaryResultText(graderCount, result?.remarks) : ''

            return (
              <Card key={reg.id} className="overflow-hidden rounded-xl border-slate-200 transition-all duration-300 shadow-sm hover:border-blue-200 hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Status accent bar */}
                    <div className={clsx(
                      "w-1 md:w-2 shrink-0",
                      reg.status === 'registered' ? "bg-blue-500" : "bg-emerald-500"
                    )} />
                    
                    <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:items-stretch md:justify-between md:gap-6 md:p-5">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          <span className={clsx(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                            reg.status === 'registered' ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          )}>
                            {reg.status}
                          </span>
                          <span className="hidden text-slate-300 sm:inline">•</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3 shrink-0" /> 
                            {comp?.start_date ? new Date(comp.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                          </span>
                          {reg.is_submitted && (
                            <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                              Submitted
                            </span>
                          )}
                        </div>
                        <h3 className="text-base font-bold leading-tight text-slate-900 md:text-lg">
                          {comp?.title}
                        </h3>
                        {comp?.description && (
                          <p className="line-clamp-2 max-w-2xl text-sm text-slate-500">
                            {comp.description}
                          </p>
                        )}
                        {/* Category Badge */}
                        {comp?.category && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={clsx(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest",
                              comp.category === 'mcq' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
                            )}>
                              {comp.category === 'mcq' ? <BookOpen className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                              {comp.category}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-stretch md:flex-row md:items-stretch">
                        {hasResult ? (
                          <div className="relative flex min-h-[10.5rem] w-full min-w-0 flex-col rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3 pb-3 text-white shadow-md shadow-emerald-200/40 sm:w-[148px] md:min-w-[148px]">
                            <div className="mb-2 flex items-start justify-between gap-2 pr-0">
                              <p className="text-left text-[10px] font-bold uppercase tracking-wide text-white/85">
                                Final Score
                              </p>
                              <button 
                                type="button"
                                onClick={() => setFeedbackReg(reg)}
                                className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                                title="View Teacher Feedback"
                              >
                                <Info className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex flex-1 flex-col justify-center py-1">
                              <p className="text-center text-2xl font-black tabular-nums leading-none md:text-[1.65rem]">
                                {result?.score}<span className="text-sm font-semibold text-white/75">/100</span>
                              </p>
                            </div>
                            <div className="mt-auto flex h-[2.85rem] flex-col justify-start overflow-hidden border-t border-white/20 pt-2">
                              {extraScoreDetail ? (
                                <p className="break-words px-0.5 text-center text-[10px] italic leading-snug text-white/90 line-clamp-3">
                                  {extraScoreDetail}
                                </p>
                              ) : (
                                <span className="block min-h-[2rem] shrink-0" aria-hidden />
                              )}
                            </div>
                          </div>
                        ) : isUnderReview ? (
                          <div className="flex min-h-[10.5rem] w-full flex-col justify-center rounded-xl border border-amber-100 bg-amber-50 p-3 text-center sm:w-[148px] md:min-w-[148px]">
                            <p className="text-[10px] font-bold uppercase text-amber-600">Status</p>
                            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold text-amber-700">
                              <Info className="h-3.5 w-3.5 shrink-0" /> Under Review
                            </p>
                          </div>
                        ) : (
                          <div className="flex min-h-[10.5rem] w-full flex-col justify-center rounded-xl border border-slate-100 bg-slate-50 p-3 text-center sm:w-[148px] md:min-w-[148px]">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Status</p>
                            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-bold text-slate-600">
                              <Info className="h-3.5 w-3.5 shrink-0" /> Pending Start
                            </p>
                          </div>
                        )}
                        {!reg.is_submitted && (
                             <Button
                               size="sm"
                               disabled={!comp?.is_exam_active || comp?.status !== 'active'}
                               className={clsx(
                                 "h-10 min-h-10 w-full shrink-0 gap-1 text-xs shadow-sm transition-all sm:w-auto sm:self-center md:self-stretch md:px-4",
                                 (comp?.is_exam_active && comp?.status === 'active')
                                   ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" 
                                   : "cursor-not-allowed border border-slate-100 bg-slate-100 text-slate-400"
                               )}
                               onClick={() => navigate(`/student/competitions/${comp?.id}/exam`)}
                             >
                               {comp?.is_exam_active ? (
                                 <>Enter Exam <ArrowRight className="h-3.5 w-3.5" /></>
                               ) : comp?.status !== 'active' ? (
                                 <>Not Active</>
                               ) : (
                                 <>Waiting for Teacher...</>
                               )}
                             </Button>
                           )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
          <Info className="w-5 h-5 text-blue-600" />
        </div>
        <div>
           <p className="text-sm font-bold text-blue-900">How to join more competitions?</p>
           <p className="text-xs text-blue-700/70 mt-0.5 leading-relaxed">
             Open any competition link shared by your teacher or school admin. Once you sign in using that link, you'll be automatically registered and it will appear here.
           </p>
        </div>
      </div>

      {feedbackReg && (
        <Dialog open={!!feedbackReg} onOpenChange={(o) => (!o && setFeedbackReg(null))}>
          <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-black">Teacher Feedback</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              {feedbackReg.competitions?.content?.map((item: any, idx: number) => {
                const response = feedbackReg.responses?.find((r: any) => r.index === idx);
                if (!response || !response.teacher_comment) return null;
                
                return (
                  <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                    <div className="mb-2">
                       <span className="text-xs font-black text-blue-600 bg-blue-100 px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">
                         Question {idx + 1}
                       </span>
                       <p className="text-sm font-medium text-slate-800 line-clamp-2 italic border-l-2 border-slate-300 pl-3">
                         "{item.text || item.passage || item.question || `Content ${idx + 1}`}"
                       </p>
                    </div>
                    <div className="bg-white rounded-xl p-3 border border-emerald-100/50 border-l-4 border-l-emerald-500 shadow-sm mt-3">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">Teacher Notes</p>
                      <p className="text-sm text-slate-600 font-medium">{response.teacher_comment}</p>
                    </div>
                  </div>
                )
              })}
              {(!feedbackReg.responses || !feedbackReg.responses.some((r: any) => r.teacher_comment)) && (
                <div className="text-center py-8 text-slate-400 italic">
                  No specific question notes were provided by the teacher.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
