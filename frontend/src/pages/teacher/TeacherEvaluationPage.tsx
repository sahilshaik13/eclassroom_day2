import { useEffect, useState } from 'react';
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

import clsx from 'clsx';

export default function TeacherEvaluationPage() {
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
          score: sub.score !== null ? sub.score : (sub.auto_score || 0),
          feedback: sub.feedback || '',
          status: sub.status || 'submitted'
        };
      });
      setReviews(initialReviews);
    } catch (err) {
      toast.error("Failed to load evaluation data");
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
      toast.success(publish ? "Results Published successfully!" : "Progress saved successfully!");
      if (publish) navigate(-1);
    } catch (err) {
      toast.error("Failed to save evaluations");
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
  const student = submissions[0]?.student || submissions[0]?.student_name || 'Student';
  const title = mode === 'period' ? `Period Evaluation: ${submissions[0]?.period_title || 'Period'}` : `Task Evaluation: ${submissions[0]?.task_title || 'Task'}`;

  return (
    <DashboardPageLayout
      title="Professional Evaluation"
      description="Review student work, calculate scores, and publish final results."
      actions={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold text-slate-500">
            <ChevronLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleSaveAll(false)}
            disabled={saving}
            className="rounded-xl font-bold bg-white"
          >
            <Save className="w-4 h-4 mr-2" /> Save Draft
          </Button>
          <Button 
            onClick={() => handleSaveAll(true)}
            disabled={saving}
            className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
          >
            <SaveAll className="w-4 h-4 mr-2" /> Publish Results
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Header Profile */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
           <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
           <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex items-center gap-6">
                 <div className="h-20 w-20 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                    <User className="h-10 w-10" />
                 </div>
                 <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 opacity-80">Evaluating Participant</span>
                    <h1 className="text-3xl font-black">{typeof student === 'string' ? student : student.name}</h1>
                    <p className="text-sm font-bold text-slate-300 mt-1">{title}</p>
                 </div>
              </div>
              
               <div className="flex items-center gap-8">
                  <div className="text-right">
                     <p className="text-[10px] font-black uppercase text-indigo-300 mb-1">Day Result</p>
                     <div className="flex items-center gap-4">
                        <div className="text-right">
                           <span className="text-3xl font-black">{submissions[0]?.day_progress?.average_score || 0}%</span>
                           <p className="text-[10px] font-bold text-indigo-300 mt-0.5">{submissions[0]?.day_progress?.completed || 0}/{submissions[0]?.day_progress?.total || 0} Tasks</p>
                        </div>
                        <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
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
        <div className="space-y-12">
          {submissions.map((sub, idx) => (
            <div key={sub.id} className="relative">
              <div className="absolute -left-4 top-10 w-1 bg-indigo-600 h-20 rounded-full hidden lg:block" />
              <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[3rem] overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                   {/* Left side: Content */}
                   <div className="p-10 lg:p-12 space-y-8 border-r border-slate-50">
                      <div className="flex items-center justify-between">
                         <div>
                            <div className="flex items-center gap-2 mb-2">
                               <BadgeCheck className="h-4 w-4 text-indigo-500" />
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Task {idx + 1} of {submissions.length}</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900">{sub.task_title || sub.task?.title}</h3>
                         </div>
                         <Badge className="bg-slate-100 text-slate-500 border-none font-black text-[10px] uppercase px-3 py-1">
                            {sub.task_type || sub.task?.task_type}
                         </Badge>
                      </div>

                      <div className="space-y-6">
                         <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 relative group">
                            <Label className="absolute -top-3 left-8 bg-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100 shadow-sm">Student Response</Label>
                            
                            {sub.audio_url ? (
                              <div className="flex flex-col items-center gap-6 py-4">
                                 <div className="w-16 h-16 rounded-full bg-white shadow-inner flex items-center justify-center text-indigo-600">
                                    <Mic className="w-8 h-8" />
                                 </div>
                                 <audio src={sub.audio_url} controls className="w-full h-12 outline-none" />
                                 <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Audio Recording Provided</p>
                              </div>
                            ) : (
                              <div className="whitespace-pre-wrap font-medium text-slate-700 leading-relaxed text-lg italic">
                                 "{sub.content?.submission_text || sub.submission_text || 'No written response provided.'}"
                              </div>
                            )}
                         </div>

                         {sub.content?.responses && (
                           <div className="space-y-4">
                              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">MCQ Answers Analysis</Label>
                              <div className="grid gap-3">
                                 {Object.entries(sub.content.responses).map(([key, val]: [string, any], qIdx) => (
                                   <div key={key} className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm">
                                      <div className="flex items-center gap-4">
                                         <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-[10px] font-black text-slate-400">Q{qIdx + 1}</div>
                                         <p className="font-bold text-slate-700">{val.answer}</p>
                                      </div>
                                      {val.is_correct ? (
                                        <Badge className="bg-emerald-50 text-emerald-600 border-none">Correct</Badge>
                                      ) : (
                                        <Badge className="bg-rose-50 text-rose-600 border-none">Incorrect</Badge>
                                      )}
                                   </div>
                                 ))}
                              </div>
                           </div>
                         )}
                      </div>
                   </div>

                   {/* Right side: Grading */}
                   <div className="p-10 lg:p-12 bg-slate-50/50 space-y-10">
                      <div className="flex items-center gap-3">
                         <Trophy className="h-6 w-6 text-indigo-600" />
                         <h4 className="text-xl font-black text-slate-900">Grading System</h4>
                      </div>

                      <div className="space-y-8">
                         {/* Marks System */}
                         <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Calculated Marks</Label>
                               <div className="h-20 bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center group transition-all hover:border-indigo-300">
                                  <span className="text-3xl font-black text-slate-900">{sub.auto_score || sub.score || 0}%</span>
                                  <span className="text-[8px] font-bold text-emerald-500 uppercase">AI Suggested</span>
                               </div>
                            </div>
                            <div className="space-y-3">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Override Marks</Label>
                               <div className="relative">
                                  <Input 
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={reviews[sub.id]?.score}
                                    onChange={(e) => handleUpdateReview(sub.id, { score: Number(e.target.value) })}
                                    className="h-20 bg-white rounded-3xl border-slate-200 text-3xl font-black text-center focus:ring-indigo-500/20"
                                  />
                                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-xl">%</span>
                               </div>
                            </div>
                         </div>

                         {/* Feedback */}
                         <div className="space-y-3">
                            <div className="flex items-center justify-between px-2">
                               <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Teacher's Remarks</Label>
                               <span className="text-[10px] font-bold text-indigo-600 uppercase">Visible to student</span>
                            </div>
                            <div className="relative">
                               <Textarea 
                                 placeholder="Excellent work! Keep improving..."
                                 value={reviews[sub.id]?.feedback}
                                 onChange={(e) => handleUpdateReview(sub.id, { feedback: e.target.value })}
                                 className="min-h-[160px] rounded-[2rem] bg-white border-slate-200 pl-14 pt-6 font-medium focus:ring-indigo-500/20 text-lg leading-relaxed shadow-sm"
                               />
                               <MessageSquare className="absolute left-6 top-7 h-6 w-6 text-slate-300" />
                            </div>
                         </div>

                         <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                            <Info className="h-5 w-5 text-indigo-600 shrink-0" />
                            <p className="text-[10px] font-bold text-indigo-700 leading-tight">
                               Once published, these marks will be added to the student's progress report and cannot be modified. Ensure accuracy before hitting publish.
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
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl">
           <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
                 <BadgeCheck className="h-7 w-7" />
              </div>
              <div>
                 <h4 className="text-xl font-black text-slate-900">Finalize Evaluation</h4>
                 <p className="text-sm font-bold text-slate-400">Confirm all scores and remarks for this {mode}.</p>
              </div>
           </div>
           
           <div className="flex gap-4 w-full md:w-auto">
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 md:flex-none rounded-2xl h-16 px-10 font-black border-slate-200"
                onClick={() => handleSaveAll(false)}
                disabled={saving}
              >
                <RefreshCcw className={clsx("h-5 w-5 mr-2", saving && "animate-spin")} /> Save Progress
              </Button>
              <Button 
                size="lg" 
                className="flex-1 md:flex-none rounded-2xl h-16 px-12 bg-blue-600 hover:bg-blue-700 text-white font-black shadow-xl shadow-blue-500/30"
                onClick={() => handleSaveAll(true)}
                disabled={saving}
              >
                <SaveAll className="h-5 w-5 mr-2" /> Publish Results
              </Button>
           </div>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
