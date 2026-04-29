import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, MessageSquare, Save, Award, User, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function TeacherSubmissionsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSub, setSelectedSub] = useState<any>(null);
  const [review, setReview] = useState({ score: 0, feedback: '', status: 'approved' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSubmissions();
  }, []);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      // In a real app, we'd filter by classroom/day. For now, fetch all pending reviews.
      const res = await api.get('/teacher/submissions/pending');
      setSubmissions(res.data.data);
      if (res.data.data.length > 0) handleSelect(res.data.data[0]);
    } catch (err) {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (sub: any) => {
    setSelectedSub(sub);
    setReview({
      score: sub.score || 0,
      feedback: sub.feedback || '',
      status: sub.status || 'approved'
    });
  };

  const handleSaveReview = async () => {
    setSaving(true);
    try {
      await api.patch(`/teacher/submissions/${selectedSub.id}/review`, review);
      toast.success("Review saved successfully");
      setSubmissions(prev => prev.map(s => s.id === selectedSub.id ? { ...s, ...review } : s));
    } catch (err) {
      toast.error("Failed to save review");
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

  return (
    <DashboardPageLayout
      title="Submission Review"
      description="Evaluate student work, provide feedback, and manage scores."
      actions={
        <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold">
          <ChevronLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Submissions List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Student Feed</h3>
          </div>
          
          <div className="grid gap-3">
            {submissions.map(sub => (
              <Card 
                key={sub.id} 
                className={`cursor-pointer transition-all border-none shadow-sm ${selectedSub?.id === sub.id ? 'ring-2 ring-blue-600' : 'hover:bg-slate-50'}`}
                onClick={() => handleSelect(sub)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <User className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">{sub.student_name || 'Student'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{sub.task_title}</p>
                  </div>
                  <Badge variant="outline" className={`text-[8px] font-black uppercase ${sub.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                    {sub.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
            {submissions.length === 0 && (
              <div className="py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <Clock className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-400">All caught up!</p>
              </div>
            )}
          </div>
        </div>

        {/* Review Workspace */}
        <div className="lg:col-span-8">
          {selectedSub ? (
            <div className="space-y-6">
              <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
                <CardHeader className="bg-slate-900 text-white p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                         <BookOpen className="h-4 w-4 text-blue-400" />
                         <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Task Detail</span>
                      </div>
                      <CardTitle className="text-2xl font-black">{selectedSub.task_title}</CardTitle>
                      <p className="text-slate-400 text-sm mt-1">Submitted by <span className="text-white font-bold">{selectedSub.student_name}</span></p>
                    </div>
                    {selectedSub.submitted_at && (
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Submitted On</p>
                        <p className="text-sm font-bold">{new Date(selectedSub.submitted_at).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                  {/* Submission Content */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Student's Response</Label>
                      <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 min-h-[150px] whitespace-pre-wrap font-medium text-slate-700 leading-relaxed">
                        {selectedSub.submission_text || "No text provided."}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Media/Links</Label>
                      {selectedSub.media_url ? (
                        <a 
                          href={selectedSub.media_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-6 bg-blue-50 rounded-2xl border border-blue-100 group transition-all hover:bg-blue-600 hover:border-blue-600"
                        >
                          <div className="flex items-center gap-3">
                            <ExternalLink className="h-6 w-6 text-blue-600 group-hover:text-white" />
                            <span className="font-black text-blue-900 group-hover:text-white">View Attachment</span>
                          </div>
                          <ChevronLeft className="h-5 w-5 text-blue-300 rotate-180 group-hover:text-white" />
                        </a>
                      ) : (
                        <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                          <p className="text-xs font-bold text-slate-400 italic">No media attached.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* Review Form */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                       <Award className="h-5 w-5 text-blue-600" />
                       <h3 className="text-lg font-black text-slate-900">Evaluation</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Score</Label>
                        <Input 
                          type="number" 
                          value={review.score}
                          onChange={(e) => setReview({ ...review, score: Number(e.target.value) })}
                          className="h-14 rounded-2xl border-slate-200 font-black text-lg focus:ring-blue-500/20"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Teacher's Feedback</Label>
                        <div className="relative">
                          <Textarea 
                            placeholder="Add a personalized comment..."
                            value={review.feedback}
                            onChange={(e) => setReview({ ...review, feedback: e.target.value })}
                            className="min-h-[80px] rounded-2xl border-slate-200 pl-12 pt-4 font-medium focus:ring-blue-500/20"
                          />
                          <MessageSquare className="absolute left-4 top-4 h-5 w-5 text-slate-300" />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                      <Button 
                        onClick={() => setReview({ ...review, status: 'approved' })}
                        className={`flex-1 h-14 rounded-2xl font-black gap-2 ${review.status === 'approved' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                      >
                        <CheckCircle2 className="h-5 w-5" /> Approved
                      </Button>
                      <Button 
                        onClick={() => setReview({ ...review, status: 'rejected' })}
                        className={`flex-1 h-14 rounded-2xl font-black gap-2 ${review.status === 'rejected' ? 'bg-rose-600 text-white shadow-lg shadow-rose-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
                      >
                        <XCircle className="h-5 w-5" /> Revision Required
                      </Button>
                      <Button 
                        onClick={handleSaveReview} 
                        disabled={saving}
                        className="flex-1 h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black shadow-xl shadow-slate-200 gap-2"
                      >
                        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Save Review
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center bg-slate-50/50 rounded-[3rem] border border-dashed border-slate-200 text-center p-8">
               <div className="h-20 w-20 bg-white rounded-3xl flex items-center justify-center shadow-sm mb-6 border border-slate-100">
                  <User className="h-10 w-10 text-slate-200" />
               </div>
               <h3 className="text-xl font-black text-slate-900">No Student Selected</h3>
               <p className="text-slate-400 font-bold max-w-xs mt-2">Pick a submission from the left panel to begin your evaluation.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  );
}
