import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Trophy, Target, CheckCircle2, TrendingUp,
  Printer, GraduationCap, ChevronRight, ChevronLeft
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

/** Ring circumference for SVG dash animation (r=38 in 100×100 viewBox). */
const GRADE_RING_C = 2 * Math.PI * 38;

const REPORT_STAT_THEMES = {
  blue: {
    card: "border-blue-100/80 bg-blue-50/70 border-l-[3px] border-l-blue-500/45",
    iconWrap: "border-blue-100 bg-white text-blue-600",
    label: "text-blue-900/80",
  },
  emerald: {
    card: "border-emerald-100/80 bg-emerald-50/70 border-l-[3px] border-l-emerald-500/45",
    iconWrap: "border-emerald-100 bg-white text-emerald-600",
    label: "text-emerald-900/80",
  },
  amber: {
    card: "border-amber-100/80 bg-amber-50/70 border-l-[3px] border-l-amber-500/45",
    iconWrap: "border-amber-100 bg-white text-amber-600",
    label: "text-amber-900/80",
  },
} as const;

const ReportSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="bg-slate-100 rounded-2xl h-32 w-full" />
    <div className="grid grid-cols-3 gap-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-slate-100 rounded-lg h-20" />
      ))}
    </div>
    <div className="bg-white rounded-2xl border border-slate-100 h-72 w-full" />
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
        <div className="grid grid-cols-3 gap-2 w-full no-print items-stretch sm:flex sm:flex-wrap sm:items-stretch sm:gap-2 sm:w-auto">
          {/* Month Selector — same row height as select + export (h-10) */}
          <div className="flex h-10 min-h-10 items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-0.5 shadow-sm min-w-0">
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 shrink-0 p-0 rounded-lg"
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
            <div className="min-w-0 flex-1 px-1 text-center">
                <span className="text-xs font-black tabular-nums text-slate-900 truncate block">{months[selectedMonth - 1]} {selectedYear}</span>
            </div>
            <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 shrink-0 p-0 rounded-lg"
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
            <SelectTrigger className="h-10 min-h-10 w-full rounded-xl border-slate-200 bg-white px-3 text-xs font-bold shadow-sm sm:w-[220px] min-w-0 [&>span]:truncate">
              <GraduationCap className="mr-2 h-4 w-4 shrink-0 text-indigo-600" />
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
            size="sm"
            onClick={handlePrint}
            className="h-10 min-h-10 w-full rounded-xl px-3 text-xs font-black shadow-lg shadow-slate-200 sm:w-auto bg-slate-900 hover:bg-slate-800 text-white gap-2"
          >
            <Printer className="h-4 w-4 shrink-0" /> Export PDF
          </Button>
        </div>
      }
    >
      {loading ? (
        <ReportSkeleton />
      ) : (
        <div className="space-y-4 print:space-y-4">
          {!report ? (
            <div className="bg-white rounded-2xl sm:rounded-[2.5rem] p-8 sm:p-20 text-center border-2 border-slate-100 shadow-xl shadow-slate-200/50">
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
          <div className="relative flex flex-col items-stretch gap-4 overflow-hidden rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-xl shadow-slate-200/50 print:rounded-2xl print:p-5 md:flex-row md:items-center md:justify-between md:gap-6">
            <div className="absolute top-0 left-0 h-full w-1.5 bg-indigo-600" />
            <div className="flex w-full min-w-0 items-center gap-3 pl-2 md:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 print:h-12 print:w-12">
                  <FileText className="h-6 w-6 print:h-6 print:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge className="border-none bg-indigo-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">Official Progress Report</Badge>
                      <span className="hidden text-[10px] font-black uppercase tracking-widest text-slate-400 md:inline">Period: {months[selectedMonth - 1]} {selectedYear}</span>
                  </div>
                  <h1 className="truncate text-xl font-black text-slate-900 md:text-2xl print:text-xl">{report.student_name}</h1>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:text-xs">
                    {selectedClassId === 'overall' 
                        ? 'Cumulative Performance across all classes' 
                        : `Class Report: ${report.enrolled_classes?.find((c: any) => c.id === selectedClassId)?.name || 'Loading...'}`
                    }
                  </p>
                </div>
            </div>
            
            <div className="flex w-full items-center justify-start pl-2 md:w-auto md:justify-end md:pr-2">
                <div className="text-center">
                  <p className="mb-1 text-[10px] font-black uppercase text-slate-400">Total Grade</p>
                  <div className="relative inline-flex h-[4.75rem] w-[4.75rem] items-center justify-center md:h-[5.25rem] md:w-[5.25rem]">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
                        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="11" fill="transparent" className="text-slate-100" />
                        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="11" fill="transparent" strokeDasharray={GRADE_RING_C} strokeDashoffset={GRADE_RING_C - (GRADE_RING_C * report.overall_percentage) / 100} className="text-indigo-600 transition-all duration-1000" strokeLinecap="round" />
                      </svg>
                      <span className="absolute text-lg font-black tabular-nums text-slate-900 md:text-xl">{report.overall_percentage}%</span>
                  </div>
                </div>
            </div>
          </div>

          {/* Quick Stats — equal columns, unified type scale */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { label: 'Assigned Tasks', value: `${report.total_assigned} / ${report.total_month_tasks}`, icon: Target, theme: 'blue' as const },
                { label: 'Completions', value: `${report.total_completed} / ${report.total_assigned}`, icon: CheckCircle2, theme: 'emerald' as const },
                { label: 'Evaluated (Scores)', value: `${report.total_reviewed} / ${report.total_completed}`, icon: Trophy, theme: 'amber' as const },
              ] as const
            ).map((stat, i) => {
              const th = REPORT_STAT_THEMES[stat.theme];
              return (
              <Card key={i} className={clsx("rounded-lg border shadow-sm", th.card)}>
                <CardContent className="flex min-h-[5.25rem] items-center gap-0 px-3 py-3 sm:gap-2.5">
                  <div className={clsx("hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm sm:flex", th.iconWrap)}>
                    <stat.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-visible text-left">
                    <p
                      className={clsx(
                        "mb-0.5 text-[10px] font-black uppercase leading-snug tracking-wide text-pretty break-words [overflow-wrap:anywhere]",
                        th.label,
                      )}
                    >
                      {stat.label}
                    </p>
                    <p className="truncate text-lg font-black tabular-nums text-slate-900">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            );})}
          </div>

          {/* Dynamic Grid Tables */}
          {selectedClassId === 'overall' && report.class_reports?.map((cReport: any) => (
              <div key={cReport.class_id} className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white shadow-xl shadow-slate-200/50 print:border-slate-200 print:shadow-none">
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                      <GraduationCap className="h-5 w-5 shrink-0 text-indigo-600" />
                      <span className="truncate">Class Report: {cReport.class_name}</span>
                    </h3>
                    <p className="mt-0.5 text-xs font-bold italic text-slate-400">Scores from {cReport.class_name}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
                    <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 shrink-0 rounded bg-emerald-500" /> 80%+
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-500" /> 60%+
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 shrink-0 rounded bg-amber-500" /> 0%+
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full border-collapse min-w-[920px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="sticky left-0 z-10 w-36 border-r-2 border-slate-100 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 md:w-44">Metric</th>
                        {days.map(d => (
                          <th key={d} className="border-r border-slate-100 px-1.5 py-2 text-center text-[10px] font-black tabular-nums text-slate-400">
                            {d}
                          </th>
                        ))}
                        <th className="bg-indigo-50/60 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-600">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cReport.grid.map((row: any) => (
                        <tr key={row.task_type} className="transition-colors hover:bg-slate-50/40">
                          <td className="sticky left-0 z-10 border-r-2 border-slate-100 bg-white px-3 py-2">
                            <Badge className="w-full justify-center rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                              {row.task_type}
                            </Badge>
                          </td>
                          {days.map(d => {
                            const score = row.days[d];
                            return (
                              <td key={d} className="border-r border-slate-100 px-1.5 py-2 text-center">
                                {score !== undefined ? (
                                  <span className={clsx(
                                    "text-xs font-black tabular-nums",
                                    score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                                  )}>
                                    {score}
                                  </span>
                                ) : (
                                  <span className="font-bold text-slate-200">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="bg-indigo-50/15 px-2 py-2 text-center font-black">
                            {row.type_average !== null ? (
                              <span className="text-xs font-black tabular-nums text-indigo-600">{row.type_average}%</span>
                            ) : (
                              <span className="font-bold text-slate-200">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                       <tr className="bg-indigo-50/60 text-indigo-950">
                          <td className="sticky left-0 z-10 border-r border-indigo-100 bg-indigo-50/80 px-3 py-3 text-[10px] font-black uppercase tracking-wide text-indigo-700">Class Average</td>
                          <td colSpan={31} className="border-t border-indigo-100/80 px-3 py-3 text-right text-[10px] font-semibold italic text-slate-500">
                            Calculated based on all evaluated tasks for this class
                          </td>
                          <td className="border-t border-indigo-100/80 bg-indigo-100 px-3 py-3 text-center text-base font-black tabular-nums text-indigo-800">
                            {cReport.overall_percentage}%
                          </td>
                       </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
          ))}

          <div className="overflow-hidden rounded-2xl border-2 border-slate-100 bg-white shadow-xl shadow-slate-200/50 print:border-slate-200 print:shadow-none">
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
                  <TrendingUp className="h-5 w-5 shrink-0 text-indigo-600" />
                  <span className="truncate">{selectedClassId === 'overall' ? 'Overall Average' : 'Daily Breakdown'}</span>
                </h3>
                <p className="mt-0.5 text-xs font-bold italic text-slate-400">Scores are averaged for multiple tasks of the same type per day</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500">
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 shrink-0 rounded bg-emerald-500" /> 80%+
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-500" /> 60%+
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 shrink-0 rounded bg-amber-500" /> 0%+
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 w-36 border-r-2 border-slate-100 bg-slate-50 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 md:w-44">Metric</th>
                    {days.map(d => (
                      <th key={d} className="border-r border-slate-100 px-1.5 py-2 text-center text-[10px] font-black tabular-nums text-slate-400">
                        {d}
                      </th>
                    ))}
                    <th className="bg-indigo-50/60 px-2 py-2 text-center text-[10px] font-black uppercase tracking-wide text-indigo-600">Avg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.grid.map((row: any) => (
                    <tr key={row.task_type} className="transition-colors hover:bg-slate-50/40">
                      <td className="sticky left-0 z-10 border-r-2 border-slate-100 bg-white px-3 py-2">
                        <Badge className="w-full justify-center rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                          {row.task_type}
                        </Badge>
                      </td>
                      {days.map(d => {
                        const score = row.days[d];
                        return (
                          <td key={d} className="border-r border-slate-100 px-1.5 py-2 text-center">
                            {score !== undefined ? (
                              <span className={clsx(
                                "text-xs font-black tabular-nums",
                                score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                              )}>
                                {score}
                              </span>
                            ) : (
                              <span className="font-bold text-slate-200">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="bg-indigo-50/15 px-2 py-2 text-center font-black">
                        {row.type_average !== null ? (
                          <span className="text-xs font-black tabular-nums text-indigo-600">{row.type_average}%</span>
                        ) : (
                          <span className="font-bold text-slate-200">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                   <tr className="bg-slate-900 text-white">
                      <td className="sticky left-0 z-10 border-r border-white/10 bg-slate-900 px-3 py-3 text-[10px] font-black uppercase tracking-wide text-indigo-300">Monthly Average</td>
                      <td colSpan={31} className="px-3 py-3 text-right text-[10px] font-semibold italic text-slate-400">
                        Calculated based on all evaluated tasks for this period
                      </td>
                      <td className="bg-indigo-600 px-3 py-3 text-center text-base font-black tabular-nums text-white">
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
