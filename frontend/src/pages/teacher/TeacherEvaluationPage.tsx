import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ChevronLeft, Loader2, MessageSquare, 
  Save, User, Mic, SaveAll, BadgeCheck,
  Trophy, RefreshCcw, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AudioWaveformPlayer } from '@/components/ui/audio-waveform-player';

import clsx from 'clsx';

export default function TeacherEvaluationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, id, studentId } = useParams<{ mode: string, id: string, studentId?: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEvaluationData();
  }, [mode, id, studentId]);

  const loadEvaluationData = async () => {
    setLoading(true);
    try {
      let res;
      if (mode === 'period' && studentId) {
        // Fetch all submissions for a period
        res = await api.get(`/teacher/students/${studentId}/study-plan/period/${id}/submissions`);
      } else {
        // Fetch single submission
        res = await api.get(`/teacher/submissions/${id}`);
      }
      
      const evaluationData = res.data.data;
      setData(evaluationData);
      
      // Initialize reviews state
      const initialReviews: Record<string, any> = {};
      const submissions = Array.isArray(evaluationData) ? evaluationData : [evaluationData];
      
      submissions.forEach(sub => {
        initialReviews[sub.id] = {
          score: sub.score ?? null,
          feedback: sub.feedback || '',
          status: sub.status || 'submitted'
        };
      });
      setReviews(initialReviews);
    } catch (err) {
      toast.error(t('teacher.evaluation.loadFailed'));
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReview = (subId: string, updates: any) => {
    setReviews(prev => ({
      ...prev,
      [subId]: { ...prev[subId], ...updates }
    }));
  };

  const applyRubricPreset = (subId: string, rubric: 'excellent' | 'acceptable' | 'needs_repeat') => {
    const preset = {
      excellent: { score: 100, feedback: 'Excellent recitation. Keep this level.' },
      acceptable: { score: 75, feedback: 'Acceptable attempt. Keep practicing for cleaner delivery.' },
      needs_repeat: { score: 40, feedback: 'Needs repeat. Please re-record and submit again.' },
    }[rubric]
    handleUpdateReview(subId, {
      score: preset.score,
      feedback: preset.feedback,
      status: 'reviewed',
    })
  }

  const handleSaveAll = async (publish: boolean = false) => {
    setSaving(true);
    try {
      const promises = Object.entries(reviews).map(([subId, review]) => {
        const payload = {
          ...review,
          status: publish ? 'reviewed' : 'submitted'
        };
        return api.patch(`/teacher/submissions/${subId}/review`, payload);
      });
      
      await Promise.all(promises);
      toast.success(publish ? t('teacher.evaluation.resultsPublished') : t('teacher.evaluation.progressSaved'));
      if (publish) navigate(-1);
    } catch (err) {
      toast.error(t('teacher.evaluation.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  const submissions = Array.isArray(data) ? data : [data];
  const student = submissions[0]?.student || submissions[0]?.student_name || t('teacher.evaluation.studentFallback');
  const title = mode === 'period' ? t('teacher.evaluation.periodEval', { name: submissions[0]?.period_title || 'Period' }) : t('teacher.evaluation.taskEval', { name: submissions[0]?.task_title || 'Task' });

  return (
    <DashboardPageLayout
      title={t('teacher.evaluation.professionalEvaluation')}
      description={t('teacher.evaluation.evaluationDesc')}
      actions={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold text-slate-500">
            <ChevronLeft className="h-4 w-4 mr-2" /> {t('common.back')}
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleSaveAll(false)}
            disabled={saving}
            className="rounded-xl font-bold bg-white"
          >
            <Save className="w-4 h-4 mr-2" /> {t('teacher.evaluation.saveDraft')}
          </Button>
          <Button 
            onClick={() => handleSaveAll(true)}
            disabled={saving}
            className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
          >
            <SaveAll className="w-4 h-4 mr-2" /> {t('teacher.evaluation.publishResults')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header Profile */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden">
           <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                    <User className="h-6 w-6" />
                 </div>
                 <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 opacity-80">{t('teacher.evaluation.evaluatingParticipant')}</span>
                    <h1 className="text-xl font-black">{typeof student === 'string' ? student : student.name}</h1>
                    <p className="text-xs font-bold text-slate-300 mt-0.5">{title}</p>
                 </div>
              </div>
              
               <div className="flex items-center gap-4">
                  <div className="text-right">
                     <p className="text-[10px] font-black uppercase text-indigo-300 mb-1">{t('teacher.evaluation.dayResult')}</p>
                     <div className="flex items-center gap-2">
                        <div className="text-right">
                           <span className="text-xl font-black">{submissions[0]?.day_progress?.average_score ?? '—'}%</span>
                           <p className="text-[10px] font-bold text-indigo-300 mt-0.5">{submissions[0]?.day_progress?.completed || 0}/{submissions[0]?.day_progress?.total || 0} {t('teacher.evaluation.tasks')}</p>
                        </div>
                        <div className="w-20 h-2 bg-white/10 rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-indigo-500 transition-all duration-500" 
                             style={{ width: `${submissions[0]?.day_progress?.pct || 0}%` }}
                           />
                        </div>
                     </div>
                  </div>
               </div>
           </div>
        </div>

        {/* Evaluation Cards */}
        <div className="space-y-4">
          {submissions.map((sub, idx) => (
            <div key={sub.id} className="relative">
              <div className="absolute -left-4 top-10 w-1 bg-indigo-600 h-20 rounded-full hidden lg:block" />
              <Card className="border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                   {/* Left side: Content */}
                   <div className="p-4 sm:p-5 space-y-4 border-r border-slate-100">
                      <div className="flex items-center justify-between">
                         <div>
                            <div className="flex items-center gap-2 mb-2">
                               <BadgeCheck className="h-4 w-4 text-indigo-500" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('teacher.evaluation.taskOf', { idx: idx + 1, total: submissions.length })}</span>
                            </div>
                            <h3 className="text-lg font-black text-slate-900">{sub.task_title || sub.task?.title}</h3>
                         </div>
                         <Badge className="bg-slate-100 text-slate-500 border-none font-black text-[10px] uppercase px-3 py-1">
                            {sub.task_type || sub.task?.task_type}
                         </Badge>
                      </div>

                      <div className="space-y-4">
                         <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative group">
                            <Label className="absolute -top-3 left-8 bg-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100 shadow-sm">{t('teacher.evaluation.studentResponse')}</Label>
                            
                            {sub.audio_url ? (
                              <div className="flex flex-col items-center gap-3 py-2">
                                 <div className="w-10 h-10 rounded-full bg-white shadow-inner flex items-center justify-center text-indigo-600">
                                    <Mic className="w-5 h-5" />
                                 </div>
                                 <AudioWaveformPlayer src={sub.audio_url} className="w-full" height={36} />
                                 <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t('teacher.evaluation.audioRecording')}</p>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap font-medium text-slate-700 leading-relaxed text-sm italic">
                                 "{sub.content?.submission_text || sub.submission_text || t('teacher.evaluation.noWrittenResponse')}"
                              </div>
                            )}
                         </div>

                         {sub.content?.responses && (
                           <div className="space-y-4">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">{t('teacher.evaluation.mcqAnalysis')}</Label>
                              <div className="grid gap-3">
                                 {Object.entries(sub.content.responses).map(([key, val]: [string, any], qIdx) => (
                                   <div key={key} className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                                      <div className="flex items-center gap-4">
                                         <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400">Q{qIdx + 1}</div>
                                         <p className="font-bold text-slate-700">{val.answer}</p>
                                      </div>
                                      {val.is_correct ? (
                                        <Badge className="bg-emerald-50 text-emerald-600 border-none">{t('teacher.evaluation.correct')}</Badge>
                                      ) : (
                                        <Badge className="bg-rose-50 text-rose-600 border-none">{t('teacher.evaluation.incorrect')}</Badge>
                                      )}
                                   </div>
                                 ))}
                              </div>
                           </div>
                         )}
                      </div>
                   </div>

                   {/* Right side: Grading */}
                   <div className="p-4 sm:p-5 bg-slate-50/50 space-y-4">
                      <div className="flex items-center gap-3">
                         <Trophy className="h-6 w-6 text-indigo-600" />
                         <h4 className="text-base font-black text-slate-900">{t('teacher.evaluation.gradingSystem')}</h4>
                      </div>

                      <div className="space-y-4">
                         {/* Marks System */}
                         <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-3">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('teacher.evaluation.calculatedMarks')}</Label>
                               <div className="h-16 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center group transition-all hover:border-indigo-300">
                                  <span className="text-xl font-black text-slate-900">
                                    {sub.auto_score ?? sub.score ?? '—'}%
                                  </span>
                                  <span className="text-[8px] font-bold text-emerald-500 uppercase">{t('teacher.evaluation.aiSuggested')}</span>
                               </div>
                            </div>
                            <div className="space-y-3">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('teacher.evaluation.overrideMarks')}</Label>
                               <div className="relative">
                                  <Input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={reviews[sub.id]?.score ?? ''}
                                    onChange={(e) =>
                                      handleUpdateReview(sub.id, {
                                        score: e.target.value === '' ? null : Number(e.target.value),
                                      })
                                    }
                                    className="h-16 bg-white rounded-xl border-slate-200 text-xl font-black text-center focus:ring-indigo-500/20"
                                  />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 font-black text-sm">%</span>
                               </div>
                            </div>
                         </div>

                         {/* Feedback */}
                         <div className="space-y-3">
                            <div className="flex items-center justify-between px-2">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('teacher.evaluation.teacherRemarks')}</Label>
                               <span className="text-[10px] font-bold text-indigo-600 uppercase">{t('teacher.evaluation.visibleToStudent')}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => applyRubricPreset(sub.id, 'excellent')}
                                className="h-8 rounded-xl bg-emerald-600 px-3 text-[10px] font-black text-white hover:bg-emerald-700"
                              >
                                {t('teacher.evaluation.excellent')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => applyRubricPreset(sub.id, 'acceptable')}
                                className="h-8 rounded-xl bg-blue-600 px-3 text-[10px] font-black text-white hover:bg-blue-700"
                              >
                                {t('teacher.evaluation.acceptable')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => applyRubricPreset(sub.id, 'needs_repeat')}
                                className="h-8 rounded-xl px-3 text-[10px] font-black text-rose-700"
                              >
                                {t('teacher.evaluation.needsRepeat')}
                              </Button>
                            </div>
                            <div className="relative">
                               <Textarea 
                                 placeholder={t('teacher.evaluation.remarkPlaceholder')}
                                 value={reviews[sub.id]?.feedback}
                                 onChange={(e) => handleUpdateReview(sub.id, { feedback: e.target.value })}
                                 className="min-h-[100px] rounded-xl bg-white border-slate-200 pl-10 pt-4 font-medium focus:ring-indigo-500/20 text-sm leading-relaxed shadow-sm"
                               />
                               <MessageSquare className="absolute left-3 top-4 h-4 w-4 text-slate-300" />
                            </div>
                         </div>

                         <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                            <Info className="h-5 w-5 text-indigo-600 shrink-0" />
                            <p className="text-[10px] font-bold text-indigo-700 leading-tight">
                               {t('teacher.evaluation.publishWarning')}
                            </p>
                         </div>
                      </div>
                   </div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* Final Footer Actions */}
        <div className="pt-2 flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
           <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                 <BadgeCheck className="h-5 w-5" />
              </div>
              <div>
                 <h4 className="text-base font-black text-slate-900">{t('teacher.evaluation.finalizeEvaluation')}</h4>
                 <p className="text-xs font-bold text-slate-400">{t('teacher.evaluation.confirmScores', { mode })}</p>
              </div>
           </div>
           
           <div className="flex gap-4 w-full md:w-auto">
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 md:flex-none rounded-xl h-11 px-5 font-black border-slate-200"
                onClick={() => handleSaveAll(false)}
                disabled={saving}
              >
                <RefreshCcw className={clsx("h-5 w-5 mr-2", saving && "animate-spin")} /> {t('teacher.evaluation.saveProgress')}
              </Button>
              <Button 
                size="lg" 
                className="flex-1 md:flex-none rounded-xl h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white font-black"
                onClick={() => handleSaveAll(true)}
                disabled={saving}
              >
                <SaveAll className="h-5 w-5 mr-2" /> {t('teacher.evaluation.publishResults')}
              </Button>
           </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
