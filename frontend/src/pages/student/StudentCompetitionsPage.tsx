import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Calendar, ArrowRight, Loader2, Info, Search, SlidersHorizontal } from 'lucide-react'
import { clsx } from 'clsx'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { competitionApi } from '@/services/competitionApi'
import type { CompetitionRegistration } from '@/types'
import { useNavigate } from 'react-router-dom'
import { queryKeys } from '@/lib/queryKeys'
import { competitionListQueryOptions } from '@/lib/competitionQueries'
import { useStudentCompetitionRealtime } from '@/hooks/useCompetitionRealtime'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CompetitionTypeBadge, getCompetitionDisplayTag } from '@/components/competition/CompetitionTypeBadge'
import {
  COMPETITION_FILTER_OPTIONS,
  type CompetitionFilterType,
  matchesCompetitionFilter,
} from '@/lib/competitionExam'

type SortOrder = 'newest' | 'oldest'

function supplementaryResultText(graderCount: number, remarks?: string | null) {
  const parts: string[] = []
  if (graderCount > 1) parts.push(`Avg. ${graderCount} graders`)
  if (remarks?.trim()) parts.push(remarks.trim())
  return parts.join(' · ')
}

function regSortDate(reg: CompetitionRegistration): number {
  const comp = reg.competitions
  const raw = comp?.start_date || reg.registered_at
  if (!raw) return 0
  const t = Date.parse(raw.length <= 10 ? `${raw}T12:00:00` : raw)
  return Number.isNaN(t) ? 0 : t
}

function matchesSearch(reg: CompetitionRegistration, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const comp = reg.competitions
  const title = (comp?.title || reg.name || '').toLowerCase()
  if (title.includes(needle)) return true
  const start = comp?.start_date
    ? new Date(comp.start_date.length <= 10 ? `${comp.start_date}T12:00:00` : comp.start_date)
        .toLocaleDateString()
        .toLowerCase()
    : ''
  const end = comp?.end_date
    ? new Date(comp.end_date.length <= 10 ? `${comp.end_date}T12:00:00` : comp.end_date)
        .toLocaleDateString()
        .toLowerCase()
    : ''
  return start.includes(needle) || end.includes(needle) || needle.includes('/')
}

export default function StudentCompetitionsPage() {
  useStudentCompetitionRealtime()
  const navigate = useNavigate()
  const [feedbackReg, setFeedbackReg] = useState<CompetitionRegistration | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortOrder>('newest')
  const [typeFilter, setTypeFilter] = useState<CompetitionFilterType>('all')

  const {
    data: registrations = [],
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: queryKeys.competitions.studentRegistrations(),
    queryFn: async () => {
      const res = await competitionApi.getStudentCompetitions()
      if (!res.success) throw new Error(res.error?.message || 'Failed to load competitions')
      return res.data
    },
    ...competitionListQueryOptions(),
  })

  const loading = isLoading

  useEffect(() => {
    if (isError) toast.error('Could not load competitions')
  }, [isError])

  const filtered = useMemo(() => {
    let list = registrations.filter((reg) => {
      if (!matchesSearch(reg, search)) return false
      if (!reg.competitions) return typeFilter === 'all'
      const tag = getCompetitionDisplayTag(reg.competitions)
      return matchesCompetitionFilter(tag, typeFilter)
    })
    list = [...list].sort((a, b) => {
      const da = regSortDate(a)
      const db = regSortDate(b)
      return sort === 'newest' ? db - da : da - db
    })
    return list
  }, [registrations, search, sort, typeFilter])

  return (
    <div className="mx-auto max-w-4xl space-y-3 pb-24 md:pb-12">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 md:text-xl">Competitions</h1>
          <p className="text-xs text-slate-500">
            Your registrations and exam status
            {isFetching && !loading && (
              <span className="ml-2 text-[10px] font-medium text-slate-400">· Updating…</span>
            )}
          </p>
        </div>
        {!loading && registrations.length > 0 && (
          <p className="text-[11px] font-medium text-slate-400">
            {filtered.length} of {registrations.length}
          </p>
        )}
      </div>

      {!loading && registrations.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or date…"
              className="h-8 border-slate-200 pl-8 text-xs"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOrder)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="Sort competitions"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as CompetitionFilterType)}
              className="h-8 max-w-[9.5rem] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="Filter by competition type"
            >
              {COMPETITION_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-xs">Loading…</p>
        </div>
      ) : registrations.length === 0 ? (
        <Card className="border border-dashed border-slate-200 bg-slate-50/50">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <Trophy className="mb-2 h-8 w-8 text-slate-300" />
            <h3 className="text-sm font-semibold text-slate-900">No registrations</h3>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Use a competition link from your teacher to register.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-6 text-xs text-slate-500">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          No competitions match your search or filters.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((reg) => {
            const comp = reg.competitions
            const hasResult =
              !!reg.competition_results?.length && !!reg.results_released
            const result = hasResult ? reg.competition_results?.[0] : null
            const graderCount = reg.competition_grader_scores?.length ?? 0
            const isUnderReview =
              !!reg.competition_results?.length && !reg.results_released
            const extraScoreDetail = hasResult
              ? supplementaryResultText(graderCount, result?.remarks)
              : ''
            const canEnter =
              !reg.is_submitted && !!comp?.is_exam_active && comp?.status === 'active'
            const dateLabel = comp?.start_date
              ? new Date(
                  comp.start_date.length <= 10
                    ? `${comp.start_date}T12:00:00`
                    : comp.start_date,
                ).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Date TBD'

            return (
              <li
                key={reg.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:border-blue-200"
              >
                <div className="flex items-stretch gap-0">
                  <div
                    className={clsx(
                      'w-1 shrink-0',
                      reg.status === 'registered' ? 'bg-blue-500' : 'bg-emerald-500',
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-row items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                            reg.status === 'registered'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-emerald-50 text-emerald-600',
                          )}
                        >
                          {reg.status}
                        </span>
                        {comp && <CompetitionTypeBadge competition={comp} dense />}
                        {reg.is_submitted && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                            Submitted
                          </span>
                        )}
                      </div>
                      <h3 className="truncate text-sm font-semibold text-slate-900">
                        {comp?.title || 'Competition'}
                      </h3>
                      <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {dateLabel}
                        {comp?.end_date && (
                          <span className="text-slate-400">
                            →{' '}
                            {new Date(
                              comp.end_date.length <= 10
                                ? `${comp.end_date}T12:00:00`
                                : comp.end_date,
                            ).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
                      {hasResult ? (
                        <div className="flex w-[3.25rem] shrink-0 flex-col items-center rounded-md bg-emerald-600 px-1.5 py-1 text-white sm:w-[4.5rem] sm:px-2 sm:py-1.5">
                          <span className="text-[7px] font-bold uppercase tracking-wide text-white/80 sm:text-[8px]">
                            Score
                          </span>
                          <span className="text-base font-black leading-none tabular-nums sm:text-lg">
                            {result?.score}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFeedbackReg(reg)}
                            className="mt-0.5 text-[8px] text-white/80 underline sm:text-[9px]"
                          >
                            Feedback
                          </button>
                        </div>
                      ) : isUnderReview ? (
                        <span className="rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                          Review
                        </span>
                      ) : (
                        <span className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-500">
                          {reg.is_submitted ? 'Done' : 'Pending'}
                        </span>
                      )}

                      {!reg.is_submitted && (
                        <Button
                          size="sm"
                          disabled={!canEnter}
                          className={clsx(
                            'h-8 shrink-0 gap-1 px-2.5 text-[11px]',
                            canEnter
                              ? 'bg-blue-600 hover:bg-blue-700'
                              : 'cursor-not-allowed bg-slate-100 text-slate-400',
                          )}
                          onClick={() =>
                            comp?.id && navigate(`/student/competitions/${comp.id}/exam`)
                          }
                        >
                          {canEnter ? (
                            <>
                              Exam <ArrowRight className="h-3 w-3" />
                            </>
                          ) : comp?.status !== 'active' ? (
                            'Inactive'
                          ) : (
                            'Waiting'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {hasResult && extraScoreDetail && (
                  <p className="border-t border-slate-50 bg-slate-50/80 px-3 py-1 text-[10px] italic text-slate-500 line-clamp-1">
                    {extraScoreDetail}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <p className="text-[11px] leading-snug text-blue-800/90">
          Open a link from your teacher to join more competitions. Exam answers save automatically while you work.
        </p>
      </div>

      {feedbackReg && (
        <Dialog open={!!feedbackReg} onOpenChange={(o) => !o && setFeedbackReg(null)}>
          <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Teacher feedback</DialogTitle>
            </DialogHeader>
            <div className="mt-3 space-y-3">
              {feedbackReg.competitions?.content?.map((item: unknown, idx: number) => {
                const row = item as Record<string, unknown>
                const response = feedbackReg.responses?.find(
                  (r: { index?: number }) => r.index === idx,
                ) as { teacher_comment?: string } | undefined
                if (!response?.teacher_comment) return null
                const preview =
                  (row.text as string) ||
                  (row.passage as string) ||
                  (row.question as string) ||
                  (row.prompt as string) ||
                  `Item ${idx + 1}`
                return (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
                  >
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Q{idx + 1}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs italic text-slate-600">
                      {preview}
                    </p>
                    <p className="mt-2 text-xs text-slate-800">{response.teacher_comment}</p>
                  </div>
                )
              })}
              {!feedbackReg.responses?.some(
                (r: { teacher_comment?: string }) => r.teacher_comment,
              ) && (
                <p className="py-6 text-center text-xs italic text-slate-400">
                  No question notes from your teacher.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
