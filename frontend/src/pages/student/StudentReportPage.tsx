import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FileText, Calendar, 
  Trophy, Target, CheckCircle2, TrendingUp,
  Star, Printer, GraduationCap, ChevronRight, ChevronLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import clsx from 'clsx';

const ReportSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="bg-slate-100 rounded-[2.5rem] h-48 w-full" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-slate-100 rounded-[2rem] h-32" />
      ))}
    </div>
    <div className="bg-white rounded-[2.5rem] border border-slate-100 h-96 w-full" />
  </div>
);

export default function StudentReportPage() {
  const { studentId } = useParams<{ studentId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('overall');
  const [enrolledClasses, setEnrolledClasses] = useState<any[]>([]);
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    loadReport();
  }, [studentId, selectedClassId, selectedMonth, selectedYear]);

  const loadReport = async () => {
    setLoading(true);
    try {
      let url = studentId 
        ? `/teacher/students/${studentId}/report` 
        : `/student/progress-report`;
      
      const params: any = {
        month: selectedMonth,
        year: selectedYear
      };
      if (selectedClassId !== 'overall') {
        params.class_id = selectedClassId;
      }

      const res = await api.get(url, { params });
      const data = res.data.data;
      setReport(data);
      if (data.enrolled_classes) {
        setEnrolledClasses(data.enrolled_classes);
      }
    } catch (err) {
      toast.error("Failed to load progress report");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate day headers 1-31
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <DashboardPageLayout
      title="Performance Report Card"
      description="Detailed monthly breakdown of task-wise performance and evaluation."
      actions={
        <div className="flex flex-wrap items-center gap-3 no-print">
          {/* Month Selector */}
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 rounded-lg"
                onClick={() => {
                    if (selectedMonth === 1) {
                        setSelectedMonth(12);
                        setSelectedYear(prev => prev - 1);
                    } else {
                        setSelectedMonth(prev => prev - 1);
                    }
                }}
            >
                <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="px-3 min-w-[120px] text-center">
                <span className="text-sm font-black text-slate-900">{months[selectedMonth - 1]} {selectedYear}</span>
            </div>
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 rounded-lg"
                onClick={() => {
                    if (selectedMonth === 12) {
                        setSelectedMonth(1);
                        setSelectedYear(prev => prev + 1);
                    } else {
                        setSelectedMonth(prev => prev + 1);
                    }
                }}
            >
                <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Class Selector */}
          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="w-[220px] rounded-xl font-bold border-slate-200 bg-white shadow-sm">
              <GraduationCap className="h-4 w-4 mr-2 text-indigo-600" />
              <SelectValue placeholder="Select Context">
                {selectedClassId === 'overall' 
                  ? 'Overall Results' 
                  : enrolledClasses.find((c: any) => c.id === selectedClassId)?.name || 'Select Class'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall" className="font-bold text-indigo-600">Overall Results</SelectItem>
              {enrolledClasses.map((c: any) => (
                <SelectItem key={c.id} value={c.id} className="font-bold">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button 
            onClick={handlePrint}
            className="rounded-xl font-black bg-slate-900 hover:bg-slate-800 text-white gap-2 shadow-lg shadow-slate-200"
          >
            <Printer className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      }
    >
      {loading ? (
        <ReportSkeleton />
      ) : (
        <div className="space-y-8 print:space-y-4">
          {!report ? (
            <div className="bg-white rounded-[2.5rem] p-20 text-center border-2 border-slate-100 shadow-xl shadow-slate-200/50">
              <FileText className="h-20 w-20 text-slate-200 mx-auto mb-6" />
              <h2 className="text-2xl font-black text-slate-900 mb-2">No Report Found</h2>
              <Button onClick={() => navigate(-1)} className="rounded-xl bg-indigo-600">Go Back</Button>
            </div>
          ) : (
            <>
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              .no-print { display: none !important; }
              body { background: white !important; }
              .print-card { border: 1px solid #e2e8f0 !important; box-shadow: none !important; }
              @page { margin: 10mm; size: landscape; }
              .overflow-x-auto { overflow: visible !important; }
              .bg-indigo-600 { background-color: #4f46e5 !important; -webkit-print-color-adjust: exact; }
              .text-white { color: white !important; -webkit-print-color-adjust: exact; }
            }
          `}} />

          {/* Report Card Header */}
          <div className="bg-white rounded-[2.5rem] p-10 border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden print:p-6 print:rounded-2xl">
            <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600" />
            <div className="flex items-center gap-8">
                <div className="h-24 w-24 rounded-[2rem] bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 print:h-16 print:w-16">
                  <FileText className="h-12 w-12 print:h-8 print:w-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-indigo-600 text-white border-none font-black text-[10px] uppercase px-3 py-1">Official Progress Report</Badge>
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Period: {months[selectedMonth - 1]} {selectedYear}</span>
                  </div>
                  <h1 className="text-4xl font-black text-slate-900 print:text-2xl">{report.student_name}</h1>
                  <p className="text-slate-400 font-bold mt-1 uppercase tracking-widest text-xs">
                    {selectedClassId === 'overall' 
                        ? 'Cumulative Performance across all classes' 
                        : `Class Report: ${report.enrolled_classes?.find((c: any) => c.id === selectedClassId)?.name || 'Loading...'}`
                    }
                  </p>
                </div>
            </div>
            
            <div className="flex items-center gap-10 pr-6">
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Total Grade</p>
                  <div className="relative inline-flex items-center justify-center">
                      <svg className="w-24 h-24 transform -rotate-90 print:w-20 print:h-20">
                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray={251} strokeDashoffset={251 - (251 * report.overall_percentage) / 100} className="text-indigo-600 transition-all duration-1000" />
                      </svg>
                      <span className="absolute text-2xl font-black text-slate-900">{report.overall_percentage}%</span>
                  </div>
                </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { label: 'Assigned Tasks', value: `${report.total_assigned} / ${report.total_month_tasks}`, icon: Target, color: 'blue' },
              { label: 'Completions', value: `${report.total_completed} / ${report.total_assigned}`, icon: CheckCircle2, color: 'emerald' },
              { label: 'Evaluated (Scores)', value: `${report.total_reviewed} / ${report.total_completed}`, icon: Trophy, color: 'amber' }
            ].map((stat, i) => (
              <Card key={i} className={clsx("rounded-[2rem] border-none shadow-sm overflow-hidden relative", `bg-${stat.color}-50/50`)}>
                <div className={clsx("absolute top-0 left-0 w-1 h-full", `bg-${stat.color}-500/20`)} />
                <CardContent className="p-8 flex items-center gap-6">
                  <div className={clsx("h-14 w-14 rounded-2xl bg-white flex items-center justify-center shadow-md", `text-${stat.color}-600`)}>
                    <stat.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className={clsx("text-[10px] font-black uppercase tracking-widest mb-1 opacity-70", `text-${stat.color}-900`)}>{stat.label}</p>
                    <p className="text-3xl font-black text-slate-900">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Dynamic Grid Tables */}
          {selectedClassId === 'overall' && report.class_reports?.map((cReport: any) => (
              <div key={cReport.class_id} className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden print:shadow-none print:border-slate-200">
                <div className="px-10 py-8 bg-slate-50 border-b-2 border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                      <GraduationCap className="h-6 w-6 text-indigo-600" />
                      Class Report: {cReport.class_name}
                    </h3>
                    <p className="text-sm font-bold text-slate-400 mt-1 italic">Scores from {cReport.class_name}</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded bg-emerald-500" /> 80%+
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded bg-blue-500" /> 60%+
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded bg-amber-500" /> 0%+
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="sticky left-0 bg-slate-50 px-10 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 border-r-2 border-slate-100 z-10 w-48">Metric</th>
                        {days.map(d => (
                          <th key={d} className="px-4 py-6 text-[11px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">
                            {d}
                          </th>
                        ))}
                        <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600 bg-indigo-50/50">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-slate-100">
                      {cReport.grid.map((row: any) => (
                        <tr key={row.task_type} className="hover:bg-slate-50/30 transition-colors">
                          <td className="sticky left-0 bg-white px-10 py-6 border-r-2 border-slate-100 z-10">
                            <Badge className="bg-slate-900 text-white font-black text-[10px] uppercase px-3 py-1 rounded-lg w-full justify-center">
                              {row.task_type}
                            </Badge>
                          </td>
                          {days.map(d => {
                            const score = row.days[d];
                            return (
                              <td key={d} className="px-4 py-6 text-center border-r border-slate-100">
                                {score !== undefined ? (
                                  <span className={clsx(
                                    "text-sm font-black",
                                    score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                                  )}>
                                    {score}
                                  </span>
                                ) : (
                                  <span className="text-slate-100 font-bold">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-8 py-6 text-center bg-indigo-50/20 font-black">
                            {row.type_average !== null ? (
                              <span className="text-indigo-600 text-sm font-black">{row.type_average}%</span>
                            ) : (
                              <span className="text-slate-200 font-bold">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                       <tr className="bg-indigo-50/50 text-indigo-900">
                          <td className="sticky left-0 bg-indigo-50/50 px-10 py-8 font-black uppercase tracking-widest text-indigo-600 border-r border-indigo-100 z-10">Class Average</td>
                          <td colSpan={31} className="px-10 py-8 text-right font-bold text-slate-400 italic border-t border-indigo-100">
                            Calculated based on all evaluated tasks for this class
                          </td>
                          <td className="px-8 py-8 text-center bg-indigo-100 text-indigo-700 font-black text-xl border-t border-indigo-100">
                            {cReport.overall_percentage}%
                          </td>
                       </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
          ))}

          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden print:shadow-none print:border-slate-200">
            <div className="px-10 py-8 bg-slate-50 border-b-2 border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-indigo-600" />
                  {selectedClassId === 'overall' ? 'Overall Average' : 'Daily Breakdown'}
                </h3>
                <p className="text-sm font-bold text-slate-400 mt-1 italic">Scores are averaged for multiple tasks of the same type per day</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded bg-emerald-500" /> 80%+
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded bg-blue-500" /> 60%+
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded bg-amber-500" /> 0%+
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 bg-slate-50 px-10 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 border-r-2 border-slate-100 z-10 w-48">Metric</th>
                    {days.map(d => (
                      <th key={d} className="px-4 py-6 text-[11px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100">
                        {d}
                      </th>
                    ))}
                    <th className="px-8 py-6 text-[11px] font-black uppercase tracking-[0.2em] text-indigo-600 bg-indigo-50/50">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-100">
                  {report.grid.map((row: any) => (
                    <tr key={row.task_type} className="hover:bg-slate-50/30 transition-colors">
                      <td className="sticky left-0 bg-white px-10 py-6 border-r-2 border-slate-100 z-10">
                        <Badge className="bg-slate-900 text-white font-black text-[10px] uppercase px-3 py-1 rounded-lg w-full justify-center">
                          {row.task_type}
                        </Badge>
                      </td>
                      {days.map(d => {
                        const score = row.days[d];
                        return (
                          <td key={d} className="px-4 py-6 text-center border-r border-slate-100">
                            {score !== undefined ? (
                              <span className={clsx(
                                "text-sm font-black",
                                score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                              )}>
                                {score}
                              </span>
                            ) : (
                              <span className="text-slate-100 font-bold">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-8 py-6 text-center bg-indigo-50/20 font-black">
                        {row.type_average !== null ? (
                          <span className="text-indigo-600 text-sm font-black">{row.type_average}%</span>
                        ) : (
                          <span className="text-slate-200 font-bold">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                   <tr className="bg-slate-900 text-white">
                      <td className="sticky left-0 bg-slate-900 px-10 py-8 font-black uppercase tracking-widest text-indigo-400 border-r border-white/10 z-10">Monthly Average</td>
                      <td colSpan={31} className="px-10 py-8 text-right font-bold text-slate-400 italic">
                        Calculated based on all evaluated tasks for this period
                      </td>
                      <td className="px-8 py-8 text-center bg-indigo-600 font-black text-xl">
                        {report.overall_percentage}%
                      </td>
                   </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Helper Message for Empty Data */}
          {report.grid.every((r: any) => r.type_average === null) && (
            <div className="bg-white rounded-[2rem] p-10 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">No evaluated task data available for this period. Evaluation results appear once a teacher has reviewed your submissions.</p>
            </div>
          )}

          {/* Overall Context Message Removed */}
            </>
          )}
        </div>
      )}
    </DashboardPageLayout>
  );
}
