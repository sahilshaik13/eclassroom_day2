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
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
        <div className="grid gap-4">
          {registrations.map(reg => {
            const comp = reg.competitions
            const hasResult = reg.competition_results && reg.competition_results.length > 0 && reg.results_released;
            const result = hasResult ? reg.competition_results?.[0] : null;
            const isUnderReview = reg.competition_results && reg.competition_results.length > 0 && !reg.results_released;

            return (
              <Card key={reg.id} className="overflow-hidden border-slate-200 hover:border-blue-200 transition-all duration-300 shadow-sm hover:shadow-md">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Status accent bar */}
                    <div className={clsx(
                      "w-1 md:w-2 shrink-0",
                      reg.status === 'registered' ? "bg-blue-500" : "bg-emerald-500"
                    )} />
                    
                    <div className="p-5 flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={clsx(
                            "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                            reg.status === 'registered' ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-emerald-50 text-emerald-600 border-emerald-100"
                          )}>
                            {reg.status}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
                            <Calendar className="w-3 h-3" /> 
                            {comp?.start_date ? new Date(comp.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 leading-tight">
                          {comp?.title}
                        </h3>
                        {comp?.description && (
                          <p className="text-sm text-slate-500 line-clamp-2 max-w-2xl">
                            {comp.description}
                          </p>
                        )}
                        {/* Category Badge */}
                        {comp?.category && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={clsx(
                              "text-[9px] uppercase font-black tracking-widest px-2 py-0.5 rounded-full inline-flex items-center gap-1",
                              comp.category === 'mcq' ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'
                            )}>
                              {comp.category === 'mcq' ? <BookOpen className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                              {comp.category}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {hasResult ? (
                          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-4 rounded-2xl shadow-lg shadow-emerald-200/50 min-w-[120px] text-center relative">
                            <button 
                              onClick={() => setFeedbackReg(reg)}
                              className="absolute top-2 right-2 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                              title="View Teacher Feedback"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <p className="text-[10px] font-bold uppercase opacity-80 mb-1">Final Score</p>
                            <p className="text-3xl font-black leading-none">{result?.score}<span className="text-sm font-normal opacity-60">/100</span></p>
                            {result?.remarks && (
                              <div className="mt-2 pt-2 border-t border-white/20">
                                <p className="text-[10px] italic line-clamp-1 opacity-90">"{result.remarks}"</p>
                              </div>
                            )}
                          </div>
                        ) : isUnderReview ? (
                          <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-center min-w-[120px]">
                            <p className="text-[10px] font-bold text-amber-500 uppercase mb-1">Status</p>
                            <p className="text-sm font-bold text-amber-600 flex items-center justify-center gap-1.5">
                              <Info className="w-3.5 h-3.5" /> Under Review
                            </p>
                          </div>
                        ) : (
                          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl text-center min-w-[120px]">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
                            <p className="text-sm font-bold text-slate-600 flex items-center justify-center gap-1.5">
                              <Info className="w-3.5 h-3.5" /> Pending Start
                            </p>
                          </div>
                        )}
                        <div className="flex flex-col gap-2 min-w-[140px]">
                           {!reg.is_submitted && (
                             <Button
                               size="sm"
                               disabled={!comp?.is_exam_active || comp?.status !== 'active'}
                               className={clsx(
                                 "gap-1 text-xs transition-all w-full shadow-sm hover:shadow-md",
                                 (comp?.is_exam_active && comp?.status === 'active')
                                   ? "bg-blue-600 hover:bg-blue-700 shadow-blue-200" 
                                   : "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-100"
                               )}
                               onClick={() => navigate(`/student/competitions/${comp?.id}/exam`)}
                             >
                               {comp?.is_exam_active ? (
                                 <>Enter Exam <ArrowRight className="w-3.5 h-3.5" /></>
                               ) : comp?.status !== 'active' ? (
                                 <>Not Active</>
                               ) : (
                                 <>Waiting for Teacher...</>
                               )}
                             </Button>
                           )}
                           {reg.is_submitted && (
                             <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-center">Submitted</span>
                           )}
                        </div>
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
