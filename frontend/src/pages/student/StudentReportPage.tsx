import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  FileText, 
  TrendingUp,
  Printer, GraduationCap, ChevronRight, ChevronLeft, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries';
import { useStudentProgressRealtime } from '@/hooks/useStudentProgressRealtime';
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout';
import { Button } from '@/components/ui/button';
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
  useStudentProgressRealtime();
  const { studentId } = useParams<{ studentId?: string }>();
  const navigate = useNavigate();
  const [selectedClassId, setSelectedClassId] = useState<string>('overall');
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // React Query with stale-while-revalidate pattern
  const { 
    data: report, 
    isLoading, 
    isFetching,
    refetch 
  } = useQuery({
    queryKey: studentId
      ? queryKeys.teacher.studentReport(studentId, selectedMonth, selectedYear, selectedClassId)
      : queryKeys.student.progressReport(selectedYear, selectedMonth, selectedClassId),
    queryFn: async () => {
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
      
      // Validate response matches current selection
      if (
        data?.selected_month != null &&
        (data.selected_month !== selectedMonth || data.selected_year !== selectedYear)
      ) {
        throw new Error('Stale data received');
      }
      
      return data;
    },
    retry: 2,
    refetchOnReconnect: true,
    ...studyPlanQueryOptions(),
  });

  // Extract enrolled classes from report
  const enrolledClasses = report?.enrolled_classes ?? [];

  const handlePrint = () => {
    window.print();
  };

  const handleManualRefresh = () => {
    refetch();
    toast.success('Refreshing report...', { duration: 2000 });
  };

  // Generate day headers 1-31
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <DashboardPageLayout
      title="Performance Report Card"
      description="Detailed monthly breakdown of task-wise performance and evaluation."
      actions={
        <div className="grid grid-cols-3 gap-2 w-full no-print items-stretch sm:flex sm:flex-wrap sm:items-stretch sm:gap-2 sm:w-auto">
          {/* Month Selector */}
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

          {/* Refresh Button - shows when data is stale */}
          <Button 
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isFetching}
            className={clsx(
              "h-10 min-h-10 w-full rounded-xl px-3 text-xs font-bold shadow-sm sm:w-auto gap-2",
              isFetching && "opacity-70"
            )}
          >
            <RefreshCw className={clsx("h-4 w-4 shrink-0", isFetching && "animate-spin")} />
            {isFetching ? 'Updating...' : 'Refresh'}
          </Button>

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
      {/* Show skeleton only on initial load, not during background refetch */}
      {isLoading && !report ? (
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
          <div className="relative flex flex-col items-stretch gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:rounded-xl print:p-4 md:flex-row md:items-center md:justify-between md:gap-4">
            <div className="absolute top-0 left-0 h-full w-1 bg-indigo-600" />
            <div className="flex w-full min-w-0 items-center gap-2 pl-2 md:gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600 print:h-10 print:w-10">
                  <FileText className="h-5 w-5 print:h-5 print:w-5" />
                </div>
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge className="border-none bg-indigo-600 px-1.5 py-0 text-[9px] font-bold uppercase text-white">Progress Report</Badge>
                      <span className="hidden text-[9px] font-bold uppercase tracking-wide text-slate-400 md:inline">{months[selectedMonth - 1]} {selectedYear}</span>
                  </div>
                  <h1 className="truncate text-lg font-bold text-slate-900 md:text-xl print:text-lg">{report.student_name}</h1>
                  <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">
                    {selectedClassId === 'overall' 
                        ? 'All classes' 
                        : enrolledClasses?.find((c: any) => c.id === selectedClassId)?.name || 'Loading...'
                    }
                  </p>
                </div>
            </div>
            
            <div className="flex w-full items-center justify-start pl-2 md:w-auto md:justify-end md:pr-2">
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase text-slate-400">Total</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">{report.total_cumulative_raw_400 ?? 0}/400</p>
                </div>
            </div>
          </div>

          {/* Dynamic Grid Tables */}
          {selectedClassId === 'overall' && report.class_reports?.map((cReport: any) => (
              <div key={cReport.class_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:border-slate-200 print:shadow-none">
                <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4 md:py-3">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <GraduationCap className="h-4 w-4 shrink-0 text-indigo-600" />
                      <span className="truncate">{cReport.class_name}</span>
                    </h3>
                    <p className="text-[10px] font-medium italic text-slate-400">Scores from class</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] font-medium text-slate-500">
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 shrink-0 rounded bg-emerald-500" /> 80%+
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 shrink-0 rounded bg-blue-500" /> 60%+
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="h-2 w-2 shrink-0 rounded bg-amber-500" /> 0%+
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <div className="min-w-[680px]">
                    {/* Grid Header - Compact */}
                    <div className="grid bg-slate-50" style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}>
                      <div className="sticky left-0 z-10 border-r border-slate-100 bg-slate-50 px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center">
                        Metric
                      </div>
                      {days.map(d => (
                        <div key={d} className="border-r border-slate-100 px-0.5 py-1 text-center text-[9px] font-bold tabular-nums text-slate-400 flex items-center justify-center">
                          {d}
                        </div>
                      ))}
                      <div className="bg-indigo-50/60 px-1 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-indigo-600 flex items-center justify-center">
                        Tot
                      </div>
                    </div>
                    
                    {/* Grid Body - Compact */}
                    <div className="divide-y divide-slate-100">
                      {cReport.grid.map((row: any) => (
                        <div key={row.task_type} className="grid transition-colors hover:bg-slate-50/40" style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}>
                          <div className="sticky left-0 z-10 border-r border-slate-100 bg-white px-2 py-1 flex items-center">
                            <Badge className="w-full justify-center rounded bg-slate-900 px-1 py-0 text-[9px] font-bold uppercase text-white">
                              {row.task_type}
                            </Badge>
                          </div>
                          {days.map(d => {
                            const score = row.days[d];
                            return (
                              <div key={d} className="border-r border-slate-100 px-0.5 py-1 flex items-center justify-center min-h-[28px]">
                                {score !== undefined ? (
                                  <span className={clsx(
                                    "text-[10px] font-bold tabular-nums",
                                    score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                                  )}>
                                    {score}
                                  </span>
                                ) : (
                                  <span className="font-bold text-slate-200 text-[10px]">—</span>
                                )}
                              </div>
                            );
                          })}
                          <div className="bg-indigo-50/15 px-1 py-1 flex items-center justify-center font-bold min-h-[28px]">
                            {row.row_cumulative_100 != null ? (
                              <span className="text-[10px] font-bold tabular-nums text-indigo-600">{row.row_cumulative_100}</span>
                            ) : (
                              <span className="font-bold text-slate-200 text-[10px]">—</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Grid Footer - Compact */}
                    <div className="grid bg-indigo-50/60 text-indigo-950" style={{ gridTemplateColumns: '90px 1fr 55px' }}>
                      <div className="sticky left-0 z-10 border-r border-indigo-100 bg-indigo-50/80 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-indigo-700 flex items-center">
                        Total
                      </div>
                      <div className="border-t border-indigo-100/80 px-2 py-2 text-right text-[9px] font-medium italic text-slate-500 flex items-center justify-end">
                        {report.marks_formula || 'Day mark = sum of reviewed task marks. Total = cumulative sum.'}
                      </div>
                      <div className="border-t border-indigo-100/80 bg-indigo-100 px-2 py-2 text-center text-sm font-bold tabular-nums text-indigo-800 flex items-center justify-center">
                        {cReport.total_cumulative_raw_400 ?? 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          ))}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:border-slate-200 print:shadow-none">
            <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 md:flex-row md:items-center md:justify-between md:px-4 md:py-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <TrendingUp className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span className="truncate">{selectedClassId === 'overall' ? 'Overall Marks' : 'Daily Breakdown'}</span>
                </h3>
                <p className="text-[10px] font-medium italic text-slate-400">Reviewed marks by day</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] font-medium text-slate-500">
                <div className="flex items-center gap-1">
                    <div className="h-2 w-2 shrink-0 rounded bg-emerald-500" /> 80%+
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-2 w-2 shrink-0 rounded bg-blue-500" /> 60%+
                </div>
                <div className="flex items-center gap-1">
                    <div className="h-2 w-2 shrink-0 rounded bg-amber-500" /> 0%+
                </div>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-hide">
              <div className="min-w-[680px]">
                {/* Grid Header - Compact */}
                <div className="grid bg-slate-50" style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}>
                  <div className="sticky left-0 z-10 border-r border-slate-100 bg-slate-50 px-2 py-1 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center">
                    Metric
                  </div>
                  {days.map(d => (
                    <div key={d} className="border-r border-slate-100 px-0.5 py-1 text-center text-[9px] font-bold tabular-nums text-slate-400 flex items-center justify-center">
                      {d}
                    </div>
                  ))}
                  <div className="bg-indigo-50/60 px-1 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-indigo-600 flex items-center justify-center">
                    Tot
                  </div>
                </div>
                
                {/* Grid Body - Compact */}
                <div className="divide-y divide-slate-100">
                  {report.grid.map((row: any) => (
                    <div key={row.task_type} className="grid transition-colors hover:bg-slate-50/40" style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}>
                      <div className="sticky left-0 z-10 border-r border-slate-100 bg-white px-2 py-1 flex items-center">
                        <Badge className="w-full justify-center rounded bg-slate-900 px-1 py-0 text-[9px] font-bold uppercase text-white">
                          {row.task_type}
                        </Badge>
                      </div>
                      {days.map(d => {
                        const score = row.days[d];
                        return (
                          <div key={d} className="border-r border-slate-100 px-0.5 py-1 flex items-center justify-center min-h-[28px]">
                            {score !== undefined ? (
                              <span className={clsx(
                                "text-[10px] font-bold tabular-nums",
                                score >= 80 ? "text-emerald-500" : score >= 60 ? "text-blue-500" : "text-amber-500"
                              )}>
                                {score}
                              </span>
                            ) : (
                              <span className="font-bold text-slate-200 text-[10px]">—</span>
                            )}
                          </div>
                        );
                      })}
                      <div className="bg-indigo-50/15 px-1 py-1 flex items-center justify-center font-bold min-h-[28px]">
                        {row.row_cumulative_100 != null ? (
                          <span className="text-[10px] font-bold tabular-nums text-indigo-600">{row.row_cumulative_100}</span>
                        ) : (
                          <span className="font-bold text-slate-200 text-[10px]">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Grid Footer - Compact */}
                <div className="grid bg-slate-900 text-white" style={{ gridTemplateColumns: '90px 1fr 55px' }}>
                  <div className="sticky left-0 z-10 border-r border-white/10 bg-slate-900 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-indigo-300 flex items-center">
                    Total
                  </div>
                  <div className="px-2 py-2 text-right text-[9px] font-medium italic text-slate-400 flex items-center justify-end">
                    {report.marks_formula || 'Day mark = sum of reviewed task marks. Total = cumulative sum.'}
                  </div>
                  <div className="bg-indigo-600 px-2 py-2 text-center text-sm font-bold tabular-nums text-white flex items-center justify-center">
                    {report.total_cumulative_raw_400 ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Helper Message for Empty Data */}
          {report.grid.every((r: any) => r.row_cumulative_100 == null) &&
            (!report.class_reports?.length ||
              report.class_reports.every((c: any) =>
                (c.grid || []).every((row: any) => row.row_cumulative_100 == null)
              )) && (
            <div className="bg-white rounded-[2rem] p-10 text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">
                  No reviewed marks for lessons scheduled in {months[selectedMonth - 1]} {selectedYear}.
                  Switch month to see other parts of your study plan (e.g. if your plan starts in another month).
                </p>
            </div>
          )}
            </>
          )}
        </div>
      )}
    </DashboardPageLayout>
  );
}
