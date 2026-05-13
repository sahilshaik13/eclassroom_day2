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
    <div className="space-y-4 pb-20">
      {/* Header & Class Selector */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight text-slate-900 md:text-2xl">Your Progress</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 md:text-sm">Track your journey and view teacher feedback.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button 
            size="sm"
            onClick={() => navigate('/student/report')}
            className="h-10 min-h-10 rounded-xl px-4 text-xs font-black shadow-lg shadow-indigo-200 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <FileText className="h-4 w-4 shrink-0" /> View Detailed Report Card
          </Button>
        
        {classes.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm no-scrollbar">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                className={clsx(
                  "h-9 shrink-0 rounded-lg px-3 text-xs font-black transition-all whitespace-nowrap",
                  selectedClassId === c.id 
                    ? "bg-slate-900 text-white shadow-md" 
                    : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        </div>
      </div>

      {!studyPlan ? (
        <Card className="rounded-2xl border-0 p-8 text-center shadow-xl shadow-slate-200/50">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
            <Clock className="h-7 w-7 text-slate-300" />
          </div>
          <h2 className="text-lg font-black text-slate-900 md:text-xl">No active study plan found</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs font-semibold text-slate-500 md:text-sm">
            Once your teacher assigns and activates a study plan for this class, your progress will appear here.
          </p>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="group relative overflow-hidden rounded-xl border-0 bg-white shadow-lg shadow-blue-500/10">
              <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-[0.06] transition-transform group-hover:scale-110">
                <BarChart2 className="h-16 w-16 text-blue-600" />
              </div>
              <CardContent className="p-4">
                <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Overall Progress</p>
                <div className="mb-3 flex items-baseline gap-2">
                  <span className="text-2xl font-black tabular-nums text-slate-900 md:text-3xl">{stats.percentage}%</span>
                  <span className="text-xs font-semibold text-slate-400">Complete</span>
                </div>
                <Progress value={stats.percentage} className="h-2 bg-slate-100" indicatorClassName="bg-blue-600" />
              </CardContent>
            </Card>

            <Card className="group relative overflow-hidden rounded-xl border-0 bg-white shadow-lg shadow-emerald-500/10">
              <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-[0.06] transition-transform group-hover:scale-110">
                <CheckCircle2 className="h-16 w-16 text-emerald-600" />
              </div>
              <CardContent className="p-4">
                <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Tasks Completed</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black tabular-nums text-slate-900 md:text-3xl">{stats.completed}</span>
                  <span className="text-xs font-semibold text-slate-400">/ {stats.total} total</span>
                </div>
                <p className="mt-3 flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                   Keep going, you're doing great!
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden rounded-xl border-0 bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-lg shadow-indigo-500/20">
               <CardContent className="p-4">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 backdrop-blur-sm">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <h3 className="mb-1 text-base font-black md:text-lg">Stay Consistent</h3>
                <p className="text-xs font-semibold leading-relaxed text-indigo-100/90">
                  Consistency is the key to mastering your goals. Check your daily tasks to stay on track.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Task List by Day */}
          <div className="mt-6 space-y-8">
            {studyPlan.days.map((day: any) => (
              <div key={day.id} className="relative">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-900 text-white shadow-md shadow-slate-200">
                    <span className="text-[9px] font-black uppercase tracking-tighter opacity-70">Day</span>
                    <span className="text-base font-black leading-none tabular-nums">{day.day_number}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-slate-900 md:text-lg">
                      {day.scheduled_date ? new Date(day.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : `Session ${day.day_number}`}
                    </h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {day.periods.reduce((acc: number, p: any) => acc + p.tasks.length, 0)} Tasks Scheduled
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {day.periods.map((period: any) => (
                    <div key={period.id} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{period.title}</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {period.tasks.map((task: any) => {
                          const submission = task.study_plan_submissions?.[0];
                          const isReviewed = submission?.status === 'reviewed';
                          const isSubmitted = !!submission;
                          
                          return (
                            <Card key={task.id} className="group overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition-all hover:shadow-md">
                              <div className="p-4">
                                <div className="mb-3 flex justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-2.5">
                                    <div className={clsx(
                                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                      task.task_type === 'mcq' ? 'bg-amber-50 text-amber-600' :
                                      task.task_type === 'recite' ? 'bg-emerald-50 text-emerald-600' :
                                      'bg-blue-50 text-blue-600'
                                    )}>
                                      {task.task_type === 'recite' ? <MicIcon className="h-4 w-4" /> : 
                                       task.task_type === 'mcq' ? <FileText className="h-4 w-4" /> : 
                                       <CheckCircle2 className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-bold text-slate-800 transition-colors group-hover:text-blue-600">{task.title}</h4>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{task.task_type}</p>
                                    </div>
                                  </div>
                                  
                                  <div className={clsx(
                                    "h-fit shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide",
                                    isReviewed ? "bg-emerald-100 text-emerald-700" :
                                    isSubmitted ? "bg-amber-100 text-amber-700" :
                                    "bg-slate-100 text-slate-500"
                                  )}>
                                    {isReviewed ? 'Published' : isSubmitted ? 'Under Review' : 'Pending'}
                                  </div>
                                </div>

                                {isSubmitted ? (
                                  <div className="space-y-3">
                                    {/* Feedback Section (The Correction Part) */}
                                    {isReviewed && (
                                      <div className="relative space-y-3 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                                        <div className="pointer-events-none absolute right-0 top-0 p-3 opacity-[0.06]">
                                          <BadgeCheck className="h-12 w-12 text-indigo-600" />
                                        </div>
                                        <div className="relative z-10 flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2">
                                            <BadgeCheck className="h-4 w-4 shrink-0 text-indigo-600" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Final Result</span>
                                          </div>
                                          <div className="rounded-lg border border-indigo-200 bg-white px-3 py-1 shadow-sm">
                                            <span className="text-base font-black tabular-nums text-slate-900">{submission.score}%</span>
                                          </div>
                                        </div>
                                        {submission.feedback ? (
                                          <div className="relative z-10 border-l-2 border-indigo-200 pl-3">
                                            <p className="text-xs font-semibold italic leading-relaxed text-slate-700">
                                              "{submission.feedback}"
                                            </p>
                                          </div>
                                        ) : (
                                          <p className="relative z-10 text-xs italic text-slate-400">No teacher comments provided.</p>
                                        )}
                                      </div>
                                    )}

                                    {/* Submission Content Preview */}
                                    <div className="flex items-center gap-2">
                                      {submission.audio_url && (
                                        <div className="flex flex-1 items-center gap-2 rounded-lg bg-blue-50/60 p-2.5">
                                          <Play className="h-4 w-4 shrink-0 text-blue-600" />
                                          <audio src={submission.audio_url} controls className="h-8 flex-1" />
                                        </div>
                                      )}
                                      {!submission.audio_url && submission.content?.submission_text && (
                                         <div className="flex-1 rounded-lg bg-slate-50 p-2.5">
                                            <p className="text-xs text-slate-500 line-clamp-2">{submission.content.submission_text}</p>
                                         </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-100 py-4 opacity-50">
                                    <Clock className="mb-1 h-5 w-5 text-slate-300" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Not Started</p>
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
