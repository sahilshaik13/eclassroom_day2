import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, CheckCircle2, Clock, Play, FileText, BarChart2, BadgeCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function StudentProgressPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [studyPlan, setStudyPlan] = useState<any>(null);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    percentage: 0
  });

  useEffect(() => {
    fetchMyClasses();
  }, []);

  const fetchMyClasses = async () => {
    try {
      const res = await api.get('/student/classes/my');
      const data = res.data.data || [];
      setClasses(data);
      if (data.length > 0) {
        setSelectedClassId(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      toast.error("Failed to load classes");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchStudyPlan(selectedClassId);
    }
  }, [selectedClassId]);

  const fetchStudyPlan = async (classId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/student/classes/${classId}/study-plan`);
      const plan = res.data.data;
      setStudyPlan(plan);
      
      if (plan) {
        // Calculate stats
        let total = 0;
        let completed = 0;
        
        plan.days.forEach((day: any) => {
          day.periods.forEach((period: any) => {
            period.tasks.forEach((task: any) => {
              total++;
              if (task.study_plan_submissions && task.study_plan_submissions.length > 0) {
                completed++;
              }
            });
          });
        });
        
        setStats({
          total,
          completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0
        });
      }
    } catch (err) {
      toast.error("Failed to load study plan");
    } finally {
      setLoading(false);
    }
  };

  if (loading && classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
        <TrendingUp className="w-12 h-12 mb-4 animate-pulse" />
        <p className="font-bold">Analyzing your progress...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header & Class Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Your Progress</h1>
          <p className="text-slate-500 font-bold mt-1">Track your journey and view teacher feedback.</p>
        </div>

        <div className="flex gap-3">
          <Button 
            onClick={() => navigate('/student/report')}
            className="rounded-2xl h-14 px-6 font-black gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-200"
          >
            <FileText className="h-5 w-5" /> View Detailed Report Card
          </Button>
        </div>
        
        {classes.length > 0 && (
          <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto no-scrollbar">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className={clsx(
                  "px-5 py-2.5 rounded-xl text-sm font-black transition-all whitespace-nowrap",
                  selectedClassId === c.id 
                    ? "bg-slate-900 text-white shadow-lg" 
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {!studyPlan ? (
        <Card className="rounded-[2.5rem] border-0 shadow-xl shadow-slate-200/50 p-12 text-center">
          <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-black text-slate-900">No active study plan found</h2>
          <p className="text-slate-500 font-bold mt-2 max-w-sm mx-auto">
            Once your teacher assigns and activates a study plan for this class, your progress will appear here.
          </p>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-[2rem] border-0 shadow-xl shadow-blue-500/10 bg-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                <BarChart2 className="w-24 h-24 text-blue-600" />
              </div>
              <CardContent className="p-8">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Overall Progress</p>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-5xl font-black text-slate-900">{stats.percentage}%</span>
                  <span className="text-slate-400 font-bold">Complete</span>
                </div>
                <Progress value={stats.percentage} className="h-3 bg-slate-100" indicatorClassName="bg-blue-600" />
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-0 shadow-xl shadow-emerald-500/10 bg-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="w-24 h-24 text-emerald-600" />
              </div>
              <CardContent className="p-8">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Tasks Completed</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-slate-900">{stats.completed}</span>
                  <span className="text-slate-400 font-bold">/ {stats.total} total</span>
                </div>
                <p className="text-emerald-600 text-xs font-bold mt-4 flex items-center gap-1">
                   Keep going, you're doing great!
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-[2rem] border-0 shadow-xl shadow-indigo-500/10 bg-gradient-to-br from-indigo-600 to-blue-700 text-white overflow-hidden">
               <CardContent className="p-8">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-4 border border-white/20">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-black mb-1">Stay Consistent</h3>
                <p className="text-indigo-100 text-sm font-bold leading-relaxed opacity-80">
                  Consistency is the key to mastering your goals. Check your daily tasks to stay on track.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Task List by Day */}
          <div className="space-y-12 mt-12">
            {studyPlan.days.map((day: any) => (
              <div key={day.id} className="relative">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center shrink-0 shadow-lg shadow-slate-200">
                    <span className="text-[10px] font-black uppercase tracking-tighter opacity-60">Day</span>
                    <span className="text-xl font-black leading-none">{day.day_number}</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      {day.scheduled_date ? new Date(day.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : `Session ${day.day_number}`}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                      {day.periods.reduce((acc: number, p: any) => acc + p.tasks.length, 0)} Tasks Scheduled
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {day.periods.map((period: any) => (
                    <div key={period.id} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="h-px bg-slate-200 flex-1" />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{period.title}</span>
                        <div className="h-px bg-slate-200 flex-1" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {period.tasks.map((task: any) => {
                          const submission = task.study_plan_submissions?.[0];
                          const isReviewed = submission?.status === 'reviewed';
                          const isSubmitted = !!submission;
                          
                          return (
                            <Card key={task.id} className="rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group">
                              <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className={clsx(
                                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                      task.task_type === 'mcq' ? 'bg-amber-50 text-amber-600' :
                                      task.task_type === 'recite' ? 'bg-emerald-50 text-emerald-600' :
                                      'bg-blue-50 text-blue-600'
                                    )}>
                                      {task.task_type === 'recite' ? <MicIcon className="w-5 h-5" /> : 
                                       task.task_type === 'mcq' ? <FileText className="w-5 h-5" /> : 
                                       <CheckCircle2 className="w-5 h-5" />}
                                    </div>
                                    <div>
                                      <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{task.title}</h4>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{task.task_type}</p>
                                    </div>
                                  </div>
                                  
                                  <div className={clsx(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    isReviewed ? "bg-emerald-100 text-emerald-700" :
                                    isSubmitted ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-500"
                                  )}>
                                    {isReviewed ? 'Published' : isSubmitted ? 'Under Review' : 'Pending'}
                                  </div>
                                </div>

                                {isSubmitted ? (
                                  <div className="space-y-4">
                                    {/* Feedback Section (The Correction Part) */}
                                    {isReviewed && (
                                      <div className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100 space-y-4 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 p-4 opacity-5">
                                          <BadgeCheck className="w-16 h-16 text-indigo-600" />
                                        </div>
                                        <div className="flex justify-between items-center relative z-10">
                                          <div className="flex items-center gap-2">
                                            <BadgeCheck className="w-4 h-4 text-indigo-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Final Result</span>
                                          </div>
                                          <div className="bg-white px-4 py-1.5 rounded-xl border border-indigo-200 shadow-sm">
                                            <span className="text-lg font-black text-slate-900">{submission.score}%</span>
                                          </div>
                                        </div>
                                        {submission.feedback ? (
                                          <div className="relative z-10 pl-4 border-l-2 border-indigo-200">
                                            <p className="text-sm text-slate-700 font-bold leading-relaxed italic">
                                              "{submission.feedback}"
                                            </p>
                                          </div>
                                        ) : (
                                          <p className="text-xs text-slate-400 italic">No teacher comments provided.</p>
                                        )}
                                      </div>
                                    )}

                                    {/* Submission Content Preview */}
                                    <div className="flex items-center gap-3">
                                      {submission.audio_url && (
                                        <div className="flex-1 bg-blue-50/50 rounded-xl p-3 flex items-center gap-3">
                                          <Play className="w-4 h-4 text-blue-600" />
                                          <audio src={submission.audio_url} controls className="h-8 flex-1" />
                                        </div>
                                      )}
                                      {!submission.audio_url && submission.content?.submission_text && (
                                         <div className="flex-1 bg-slate-50 rounded-xl p-3">
                                            <p className="text-xs text-slate-500 line-clamp-2">{submission.content.submission_text}</p>
                                         </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="py-4 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center opacity-50">
                                    <Clock className="w-6 h-6 text-slate-300 mb-1" />
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Not Started</p>
                                  </div>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MicIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
