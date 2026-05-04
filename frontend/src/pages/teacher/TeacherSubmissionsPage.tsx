import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Loader2, User, 
  BadgeCheck, AlertCircle, 
  Calendar, CheckCircle, ChevronDown, ChevronRight,
  TrendingUp, FileText, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export default function TeacherSubmissionsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [progressData, setProgressData] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const classesRes = await api.get('/teacher/classes');
      const classList = classesRes.data.data;
      setClasses(classList);
      
      if (classList.length > 0) {
        const firstClassId = classList[0].id;
        setSelectedClassId(firstClassId);
        await loadStudents(firstClassId);
      }
    } catch (err) {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (classId: string) => {
    try {
      const studentsRes = await api.get('/teacher/students', { params: { class_id: classId } });
      setStudents(studentsRes.data.data);
    } catch (err) {
      console.error("Failed to load students", err);
    }
  };

  const loadStudentProgress = async (studentId: string) => {
    if (!selectedClassId) return;
    setLoadingProgress(true);
    try {
      const res = await api.get(`/teacher/students/${studentId}/study-plan/${selectedClassId}/progress`);
      setProgressData(res.data.data);
    } catch (err) {
      toast.error("Failed to load student progress");
    } finally {
      setLoadingProgress(false);
    }
  };

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student);
    loadStudentProgress(student.id);
  };

  useEffect(() => {
    if (selectedClassId) {
      loadStudents(selectedClassId);
    }
    
    if (selectedStudent) {
      const isInNewClass = selectedStudent.classes.some((c: any) => c.id === selectedClassId);
      if (isInNewClass) {
        loadStudentProgress(selectedStudent.id);
      } else {
        setSelectedStudent(null);
        setProgressData(null);
      }
    }
  }, [selectedClassId]);

  const filteredStudents = students.filter(s => 
    s.classes.some((c: any) => c.id === selectedClassId)
  );

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <DashboardPageLayout
      title="Student Progress & Grading"
      description="Track study plan completion and evaluate student performance."
      actions={
        <div className="flex gap-3">
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="w-[220px] rounded-xl font-bold border-slate-200 bg-white">
              <SelectValue>
                {classes.find(c => c.id === selectedClassId)?.name || "Select Class"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {classes.map(c => (
                <SelectItem key={c.id} value={c.id} className="font-bold">
                  {c.name || 'Unnamed Class'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={() => navigate(-1)} className="rounded-xl font-bold text-slate-500">
            <ChevronLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Student Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Class Students</h3>
            <Badge className="bg-slate-100 text-slate-500 hover:bg-slate-100 border-none rounded-lg px-2 py-0.5">{filteredStudents.length}</Badge>
          </div>
          
          <div className="grid gap-2 overflow-y-auto max-h-[70vh] pr-2">
            {filteredStudents.map(student => (
              <Card 
                key={student.id} 
                className={clsx(
                  "cursor-pointer transition-all border-none shadow-sm group",
                  selectedStudent?.id === student.id ? "bg-indigo-600 shadow-indigo-200" : "bg-white hover:bg-slate-50"
                )}
                onClick={() => handleStudentSelect(student)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                      selectedStudent?.id === student.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600"
                    )}>
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        "font-black text-sm truncate",
                        selectedStudent?.id === student.id ? "text-white" : "text-slate-900"
                      )}>{student.name}</p>
                      <p className={clsx(
                        "text-[10px] font-bold uppercase tracking-tight truncate opacity-70",
                        selectedStudent?.id === student.id ? "text-indigo-100" : "text-slate-400"
                      )}>{student.phone || 'No phone'}</p>
                    </div>
                    {selectedStudent?.id === student.id && (
                      <ChevronRight className="h-4 w-4 text-white/50" />
                    )}
                  </div>
                  
                  {student.progress && (
                    <div className={clsx(
                      "pt-2 border-t flex items-center justify-between gap-4",
                      selectedStudent?.id === student.id ? "border-white/10" : "border-slate-50"
                    )}>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1 text-[8px] font-black uppercase tracking-tighter">
                          <span className={selectedStudent?.id === student.id ? "text-white/70" : "text-slate-400"}>Result: {student.progress.average_score}%</span>
                          <span className={selectedStudent?.id === student.id ? "text-white" : "text-slate-900"}>{student.progress.completed}/{student.progress.total} Tasks</span>
                        </div>
                        <Progress 
                          value={student.progress.pct} 
                          className="h-1 bg-black/5" 
                          indicatorClassName={selectedStudent?.id === student.id ? "bg-white" : "bg-indigo-500"} 
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {filteredStudents.length === 0 && (
              <div className="py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                <p className="text-xs font-bold text-slate-400">No students found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress Workspace */}
        <div className="lg:col-span-9">
          {selectedStudent ? (
            <div className="space-y-6">
              {/* Student Header */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="h-16 w-16 rounded-[1.5rem] bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">{selectedStudent.name}</h2>
                    <div className="flex items-center gap-3 mt-1">
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedStudent.phone}</span>
                       <div className="h-1 w-1 rounded-full bg-slate-300" />
                       <Badge variant="secondary" className="bg-indigo-50 text-indigo-600 border-none font-black text-[10px] uppercase">Active Student</Badge>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="rounded-2xl h-14 px-6 font-black gap-2 border-slate-200"
                    onClick={() => navigate(`/student/progress-report/${selectedStudent.id}`)}
                  >
                    <FileText className="h-5 w-5 text-indigo-600" /> View Report Card
                  </Button>
                </div>
              </div>

              {loadingProgress ? (
                <div className="h-[40vh] flex items-center justify-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                </div>
              ) : (!progressData || !progressData.days || progressData.days.length === 0) ? (
                <div className="h-[40vh] flex flex-col items-center justify-center bg-white rounded-[2.5rem] border border-dashed border-slate-200 text-center p-8">
                  <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-4">
                    <AlertCircle className="h-10 w-10 text-slate-300" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">No Study Plan Progress</h3>
                  <p className="text-slate-400 font-bold max-w-xs mt-2">This student hasn't started their study plan for the selected class yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {progressData.days.map((day: any) => (
                    <Card 
                      key={day.id} 
                      className="border-none shadow-sm rounded-[2rem] overflow-hidden group transition-all"
                    >
                      <CardHeader 
                        className={clsx(
                          "cursor-pointer p-6 flex flex-row items-center justify-between transition-colors",
                          expandedDay === day.id ? "bg-slate-50" : "bg-white hover:bg-slate-50/50"
                        )}
                        onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                      >
                        <div className="flex items-center gap-6 flex-1">
                          <div className={clsx(
                            "h-12 w-12 rounded-2xl flex items-center justify-center transition-all",
                            day.progress.pct === 100 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                          )}>
                            <Calendar className="h-6 w-6" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                               <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Day {day.day_number}</span>
                               {day.progress.completed > 0 && day.progress.completed === day.progress.reviewed && (
                                 <Badge className="bg-indigo-100 text-indigo-600 border-none font-black text-[8px] uppercase px-1.5 h-4">Corrected</Badge>
                               )}
                               {day.progress.completed > day.progress.reviewed && (
                                 <Badge className="bg-amber-100 text-amber-600 border-none font-black text-[8px] uppercase px-1.5 h-4">Not Corrected</Badge>
                               )}
                            </div>
                            <h3 className="text-lg font-black text-slate-900">{day.scheduled_date ? new Date(day.scheduled_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : `Day ${day.day_number}`}</h3>
                          </div>
                          
                          <div className="flex items-center gap-8 px-8 border-x border-slate-100">
                             <div className="text-center">
                                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Result</p>
                                <p className="font-black text-slate-900">{day.progress.average_score}%</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5">{day.progress.completed}/{day.progress.total} Tasks</p>
                             </div>
                             <div className="w-24">
                                <Progress value={day.progress.pct} className="h-1.5 bg-slate-100" indicatorClassName={day.progress.pct === 100 ? "bg-emerald-500" : "bg-indigo-600"} />
                             </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                           {expandedDay === day.id ? <ChevronDown className="h-6 w-6 text-slate-300" /> : <ChevronRight className="h-6 w-6 text-slate-300" />}
                        </div>
                      </CardHeader>
                      
                      <AnimatePresence>
                        {expandedDay === day.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-slate-50/30 border-t border-slate-100"
                          >
                            <div className="p-8 space-y-8">
                               {day.periods.map((period: any) => (
                                 <div key={period.id} className="space-y-4">
                                   <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                         <div className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                                            <Clock className="h-4 w-4" />
                                         </div>
                                         <h4 className="font-black text-slate-900">{period.title}</h4>
                                      </div>
                                      <div className="flex items-center gap-4">
                                         <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{period.progress.completed}/{period.progress.total} Completed</span>
                                            <div className="w-16">
                                               <Progress value={period.progress.pct} className="h-1 bg-slate-200" indicatorClassName="bg-indigo-400" />
                                            </div>
                                         </div>
                                         {period.progress.completed > 0 && period.progress.completed === period.progress.reviewed && (
                                           <Badge className="border-none font-black text-[8px] uppercase bg-emerald-50 text-emerald-600">
                                             Corrected
                                           </Badge>
                                         )}
                                         {period.progress.completed > period.progress.reviewed && (
                                           <Badge className="border-none font-black text-[8px] uppercase bg-amber-50 text-amber-600">
                                             Not Corrected
                                           </Badge>
                                         )}
                                      </div>
                                   </div>

                                   <div className="grid gap-3 pl-11">
                                      {period.tasks.map((task: any) => (
                                        <div key={task.id} className="bg-white rounded-2xl p-4 border border-slate-100 flex items-center justify-between group/task hover:border-indigo-200 transition-colors">
                                           <div className="flex items-center gap-4">
                                              <div className={clsx(
                                                "h-6 w-6 rounded-full flex items-center justify-center",
                                                task.submission ? "bg-emerald-50 text-emerald-500" : "bg-slate-50 text-slate-300"
                                              )}>
                                                {task.submission ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                              </div>
                                              <div>
                                                <p className="text-sm font-black text-slate-800">{task.title}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{task.task_type}</p>
                                              </div>
                                           </div>
                                           <div className="flex items-center gap-4">
                                              {task.submission && (
                                                <>
                                                  {task.submission.status === 'reviewed' ? (
                                                    <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
                                                      <span className="text-xs font-black text-slate-900">{task.submission.score}%</span>
                                                      <BadgeCheck className="h-4 w-4 text-emerald-500" />
                                                    </div>
                                                  ) : (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 text-[8px] font-black uppercase">Pending Review</Badge>
                                                  )}
                                                  <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="rounded-xl h-8 text-[10px] font-black text-indigo-600 hover:bg-indigo-50"
                                                    onClick={() => navigate(`/teacher/evaluate/submission/${task.submission.id}`)}
                                                  >
                                                    View Details
                                                  </Button>
                                                </>
                                              )}
                                           </div>
                                        </div>
                                      ))}
                                   </div>
                                 </div>
                               ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center bg-white rounded-[3rem] border border-dashed border-slate-200 text-center p-8">
               <div className="h-24 w-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6">
                  <TrendingUp className="h-12 w-12 text-slate-200" />
               </div>
               <h3 className="text-2xl font-black text-slate-900">Select a Student</h3>
               <p className="text-slate-400 font-bold max-w-sm mt-3">Choose a student from the sidebar to view their full study plan progress and begin evaluations.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  );
}
