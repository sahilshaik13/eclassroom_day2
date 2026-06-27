import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileText,
  TrendingUp,
  Printer,
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import { studyPlanQueryOptions } from '@/lib/studyPlanQueries'
import { useStudentProgressRealtime } from '@/hooks/useStudentProgressRealtime'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import clsx from 'clsx'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function scoreTone(score: number) {
  if (score >= 80) return 'text-emerald-600 bg-emerald-50'
  if (score >= 60) return 'text-blue-600 bg-blue-50'
  return 'text-amber-600 bg-amber-50'
}

function ScoreLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[
        { label: '80%+', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
        { label: '60%+', className: 'bg-blue-50 text-blue-700 ring-blue-100' },
        { label: 'Below 60%', className: 'bg-amber-50 text-amber-700 ring-amber-100' },
      ].map((item) => (
        <span
          key={item.label}
          className={clsx(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1',
            item.className,
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-36 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-50" />
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-indigo-50/60" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-indigo-100/80 bg-white" />
    </div>
  )
}

function SoftToolbarButton({
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={clsx(
        'h-10 shrink-0 rounded-xl border-indigo-100/90 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#ffffff_100%)] px-3 text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/50',
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  )
}

interface GridRow {
  task_type: string
  days: Record<number, number | undefined>
  row_cumulative_100?: number | null
}

function MarksGridTable({
  title,
  subtitle,
  icon,
  rows,
  total,
  formula,
}: {
  title: string
  subtitle: string
  icon: ReactNode
  rows: GridRow[]
  total: number
  formula?: string
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-100/80 bg-white shadow-sm shadow-indigo-100/20 print:border-slate-200 print:shadow-none">
      <div className="flex flex-col gap-3 border-b border-indigo-50 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#f5f3ff_35%,_#ffffff_100%)] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 text-indigo-600 shadow-sm ring-1 ring-indigo-100">
              {icon}
            </span>
            <span className="truncate">{title}</span>
          </h3>
          <p className="mt-0.5 pl-10 text-[11px] font-medium text-slate-500">{subtitle}</p>
        </div>
        <ScoreLegend />
      </div>

      <div className="overflow-x-auto scrollbar-hide">
        <div className="min-w-[680px]">
          <div
            className="grid bg-indigo-50/50"
            style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}
          >
            <div className="sticky left-0 z-10 flex items-center border-r border-indigo-100/80 bg-indigo-50/80 px-2 py-1.5 text-left text-[9px] font-bold uppercase tracking-wide text-indigo-600">
              Metric
            </div>
            {DAYS.map((d) => (
              <div
                key={d}
                className="flex items-center justify-center border-r border-indigo-100/60 px-0.5 py-1.5 text-center text-[9px] font-bold tabular-nums text-slate-400"
              >
                {d}
              </div>
            ))}
            <div className="flex items-center justify-center bg-violet-50/80 px-1 py-1.5 text-center text-[9px] font-bold uppercase tracking-wide text-violet-700">
              Tot
            </div>
          </div>

          <div className="divide-y divide-indigo-50">
            {rows.map((row) => (
              <div
                key={row.task_type}
                className="grid transition-colors hover:bg-indigo-50/20"
                style={{ gridTemplateColumns: '90px repeat(31, minmax(22px, 1fr)) 55px' }}
              >
                <div className="sticky left-0 z-10 flex items-center border-r border-indigo-50 bg-white px-2 py-1">
                  <span className="w-full truncate rounded-lg bg-indigo-100/80 px-1.5 py-0.5 text-center text-[9px] font-bold uppercase text-indigo-800">
                    {row.task_type}
                  </span>
                </div>
                {DAYS.map((d) => {
                  const score = row.days[d]
                  return (
                    <div
                      key={d}
                      className="flex min-h-[28px] items-center justify-center border-r border-indigo-50/80 px-0.5 py-1"
                    >
                      {score !== undefined ? (
                        <span
                          className={clsx(
                            'rounded-md px-1 py-0.5 text-[10px] font-bold tabular-nums',
                            scoreTone(score),
                          )}
                        >
                          {score}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-200">—</span>
                      )}
                    </div>
                  )
                })}
                <div className="flex min-h-[28px] items-center justify-center bg-violet-50/40 px-1 py-1">
                  {row.row_cumulative_100 != null ? (
                    <span className="text-[10px] font-bold tabular-nums text-violet-700">
                      {row.row_cumulative_100}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-200">—</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            className="grid bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#ede9fe_100%)] text-indigo-950"
            style={{ gridTemplateColumns: '90px 1fr 55px' }}
          >
            <div className="sticky left-0 z-10 flex items-center border-r border-indigo-100/80 bg-indigo-100/40 px-2 py-2.5 text-[9px] font-bold uppercase tracking-wide text-indigo-800">
              Total
            </div>
            <div className="flex items-center justify-end border-t border-indigo-100/60 px-3 py-2.5 text-right text-[10px] font-medium italic text-slate-500">
              {formula || 'Day mark = sum of reviewed task marks. Total = cumulative sum.'}
            </div>
            <div className="flex items-center justify-center border-t border-indigo-100/60 bg-indigo-200/50 px-2 py-2.5 text-center text-sm font-bold tabular-nums text-indigo-900">
              {total}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StudentReportPage() {
  const { t } = useTranslation()
  useStudentProgressRealtime()
  const { studentId } = useParams<{ studentId?: string }>()
  const navigate = useNavigate()
  const [selectedClassId, setSelectedClassId] = useState<string>('overall')

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())

  const {
    data: report,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: studentId
      ? queryKeys.teacher.studentReport(studentId, selectedMonth, selectedYear, selectedClassId)
      : queryKeys.student.progressReport(selectedYear, selectedMonth, selectedClassId),
    queryFn: async () => {
      const url = studentId ? `/teacher/students/${studentId}/report` : `/student/progress-report`
      const params: Record<string, number | string> = {
        month: selectedMonth,
        year: selectedYear,
      }
      if (selectedClassId !== 'overall') {
        params.class_id = selectedClassId
      }
      const res = await api.get(url, { params })
      const data = res.data.data
      if (
        data?.selected_month != null &&
        (data.selected_month !== selectedMonth || data.selected_year !== selectedYear)
      ) {
        throw new Error('Stale data received')
      }
      return data
    },
    retry: 2,
    refetchOnReconnect: true,
    ...studyPlanQueryOptions(),
  })

  const enrolledClasses = report?.enrolled_classes ?? []
  const monthLabel = `${MONTHS[selectedMonth - 1]} ${selectedYear}`
  const classLabel =
    selectedClassId === 'overall'
      ? 'All classes'
      : enrolledClasses.find((c: { id: string; name: string }) => c.id === selectedClassId)?.name ||
        'Loading...'

  const shiftMonth = (delta: -1 | 1) => {
    if (delta === -1) {
      if (selectedMonth === 1) {
        setSelectedMonth(12)
        setSelectedYear((y) => y - 1)
      } else {
        setSelectedMonth((m) => m - 1)
      }
    } else if (selectedMonth === 12) {
      setSelectedMonth(1)
      setSelectedYear((y) => y + 1)
    } else {
      setSelectedMonth((m) => m + 1)
    }
  }

  const isEmptyReport =
    report &&
    report.grid.every((r: GridRow) => r.row_cumulative_100 == null) &&
    (!report.class_reports?.length ||
      report.class_reports.every((c: { grid?: GridRow[] }) =>
        (c.grid || []).every((row) => row.row_cumulative_100 == null),
      ))

  return (
    <DashboardPageLayout
      title={t('student.report.title')}
      description={t('student.report.description')}
    >
      <div className="no-print -mt-1 mb-1 flex w-full items-center justify-start gap-2 overflow-x-auto pb-0.5 sm:justify-end [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex h-10 shrink-0 items-center gap-0.5 overflow-hidden rounded-xl border border-indigo-100/90 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#ffffff_100%)] px-0.5 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 rounded-lg p-0 text-indigo-600 hover:bg-indigo-100/60"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[5.5rem] px-1 text-center">
              <span className="whitespace-nowrap text-xs font-black tabular-nums text-slate-800">
                {monthLabel}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 rounded-lg p-0 text-indigo-600 hover:bg-indigo-100/60"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Select value={selectedClassId} onValueChange={setSelectedClassId}>
            <SelectTrigger className="h-10 min-h-10 w-[11.5rem] shrink-0 rounded-xl border-indigo-100/90 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#ffffff_100%)] px-3 text-xs font-bold shadow-sm [&>span]:truncate">
              <GraduationCap className="mr-2 h-4 w-4 shrink-0 text-indigo-600" />
              <SelectValue placeholder="Select class">
                {selectedClassId === 'overall' ? 'Overall Results' : classLabel}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overall" className="font-bold text-indigo-600">
                Overall Results
              </SelectItem>
              {enrolledClasses.map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id} className="font-bold">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SoftToolbarButton
            onClick={() => {
              void refetch()
              toast.success('Refreshing report...', { duration: 2000 })
            }}
            disabled={isFetching}
            className={clsx(isFetching && 'opacity-70')}
          >
            <RefreshCw className={clsx('h-4 w-4 shrink-0 text-indigo-600', isFetching && 'animate-spin')} />
            {isFetching ? 'Updating…' : 'Refresh'}
          </SoftToolbarButton>

          <Button
            size="sm"
            onClick={() => window.print()}
            className="h-10 shrink-0 gap-2 rounded-xl border-0 bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#7c3aed_52%,_#4338ca_100%)] px-4 text-xs font-black text-white shadow-md shadow-indigo-500/25 hover:opacity-95"
          >
            <Printer className="h-4 w-4 shrink-0" /> Export PDF
          </Button>
        </div>
      </div>

      {isLoading && !report ? (
        <ReportSkeleton />
      ) : (
        <div className="space-y-5 print:space-y-4">
          {!report ? (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-[radial-gradient(ellipse_at_top_left,_#eef2ff_0%,_#ffffff_100%)] p-10 text-center shadow-sm">
              <FileText className="mx-auto mb-4 h-14 w-14 text-indigo-200" />
              <h2 className="text-xl font-bold text-slate-900">No report found</h2>
              <p className="mt-1 text-sm text-slate-500">Try another month or class.</p>
              <Button
                onClick={() => navigate(-1)}
                className="mt-5 rounded-xl bg-indigo-600 hover:bg-indigo-700"
              >
                Go back
              </Button>
            </div>
          ) : (
            <>
              <style
                dangerouslySetInnerHTML={{
                  __html: `
            @media print {
              .no-print { display: none !important; }
              body { background: white !important; }
              @page { margin: 10mm; size: landscape; }
              .overflow-x-auto { overflow: visible !important; }
            }
          `,
                }}
              />

              {/* Hero summary */}
              <div className="relative overflow-hidden rounded-2xl border-0 bg-[radial-gradient(ellipse_at_top_left,_#6366f1_0%,_#7c3aed_55%,_#4338ca_100%)] p-5 text-white shadow-lg shadow-indigo-500/20 md:p-6">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-25"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 2px 2px, rgb(255 255 255 / 0.15) 1px, transparent 0)',
                    backgroundSize: '20px 20px',
                  }}
                />
                <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-100/90">
                        {monthLabel} · {classLabel}
                      </p>
                      <h2 className="truncate text-xl font-bold md:text-2xl">{report.student_name}</h2>
                      <p className="mt-0.5 text-sm font-medium text-indigo-100/90">
                        Monthly performance report
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20 backdrop-blur-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-100">
                      Total score
                    </p>
                    <p className="text-3xl font-black tabular-nums">{report.total_cumulative_raw_400 ?? 0}</p>
                    <p className="text-[11px] font-medium text-indigo-100/80">out of 400</p>
                  </div>
                </div>
              </div>

              {selectedClassId === 'overall' &&
                report.class_reports?.map(
                  (cReport: {
                    class_id: string
                    class_name: string
                    grid: GridRow[]
                    total_cumulative_raw_400?: number
                  }) => (
                    <MarksGridTable
                      key={cReport.class_id}
                      title={cReport.class_name}
                      subtitle="Class breakdown"
                      icon={<GraduationCap className="h-4 w-4" />}
                      rows={cReport.grid}
                      total={cReport.total_cumulative_raw_400 ?? 0}
                      formula={report.marks_formula}
                    />
                  ),
                )}

              <MarksGridTable
                title={selectedClassId === 'overall' ? 'Overall marks' : 'Daily breakdown'}
                subtitle="Reviewed marks by day"
                icon={<TrendingUp className="h-4 w-4" />}
                rows={report.grid}
                total={report.total_cumulative_raw_400 ?? 0}
                formula={report.marks_formula}
              />

              {isEmptyReport ? (
                <div className="rounded-2xl border border-dashed border-indigo-200/80 bg-[radial-gradient(ellipse_at_top_left,_#f5f3ff_0%,_#ffffff_100%)] px-6 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-600">
                    No reviewed marks for lessons scheduled in {monthLabel}.
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-xs font-medium text-slate-500">
                    Switch month to see other parts of your study plan if your plan starts in another
                    month.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </DashboardPageLayout>
  )
}
