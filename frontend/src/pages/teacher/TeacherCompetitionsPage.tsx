import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Search, Copy, Check, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import type { Competition, CompetitionRegistration } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clsx } from 'clsx'
import { useNavigate } from 'react-router-dom'
import { queryKeys } from '@/lib/queryKeys'
import { competitionListQueryOptions } from '@/lib/competitionQueries'
import { useTeacherCompetitionRealtime } from '@/hooks/useCompetitionRealtime'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'teacher.competitions.draft', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
  active: { label: 'common.active', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  closed: { label: 'teacher.competitions.closed', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export default function TeacherCompetitionsPage() {
  const { t } = useTranslation()
  useTeacherCompetitionRealtime()
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null)
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const {
    data: competitions = [],
    isLoading,
    isFetching,
    isError,
  } = useQuery({
    queryKey: queryKeys.teacher.competitions(),
    queryFn: async () => {
      const r = await competitionApi.getTeacherCompetitions()
      if (!r.success) throw new Error(t('teacher.competitions.couldNotLoad'))
      return r.data
    },
    ...competitionListQueryOptions(),
  })

  useEffect(() => {
    if (isError) toast.error(t('teacher.competitions.couldNotLoad'))
  }, [isError])

  const selectedComp =
    competitions.find((c) => c.id === selectedCompId) ?? null

  const {
    data: registrations = [],
    isLoading: loadingRegsInitial,
    isFetching: loadingRegsFetching,
  } = useQuery({
    queryKey: queryKeys.competitions.registrations(selectedCompId ?? ''),
    queryFn: async () => {
      const r = await competitionApi.getCompetitionRegistrations(selectedCompId!)
      if (!r.success) throw new Error('Could not load participants')
      return r.data.registrations as CompetitionRegistration[]
    },
    enabled: !!selectedCompId,
    ...competitionListQueryOptions(),
  })

  const loading = isLoading
  const loadingRegs = loadingRegsInitial && registrations.length === 0
  const regsUpdating = loadingRegsFetching && !loadingRegs

  const copyLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const link = `${window.location.origin}/compete/${id}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    toast.success(t('teacher.competitions.linkCopied'))
    setTimeout(() => setCopiedId(null), 2000)
  }

  const selectCompetition = (comp: Competition) => {
    setSelectedCompId(comp.id)
  }

  const filtered = competitions.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <DashboardPageLayout
      title={t('teacher.competitions.title')}
      description={
        isFetching && !loading
          ? t('teacher.competitions.descriptionUpdating')
          : t('teacher.competitions.description')
      }
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Competitions List */}
        <div className="w-full lg:w-1/3 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
          <div className="p-5 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('teacher.competitions.searchPlaceholder')}
                className="pl-9 border-slate-200 text-sm w-full"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="p-5 text-center text-slate-400 text-sm">{t('common.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="p-5 text-center text-slate-400 text-sm">{t('teacher.competitions.noFound')}</div>
            ) : (
              filtered.map((c) => {
                const statusStyle = STATUS_MAP[c.status] || STATUS_MAP.draft
                const isSelected = selectedCompId === c.id
                return (
                  <div
                    key={c.id}
                    className={clsx(
                      'p-4 cursor-pointer hover:bg-slate-50 transition-colors',
                      isSelected && 'bg-blue-50 border-l-4 border-l-blue-600',
                    )}
                    onClick={() => selectCompetition(c)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{c.title}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className={clsx(
                              'text-[10px] font-bold px-2 py-0.5 rounded border',
                              statusStyle.cls,
                            )}
                          >
                            {statusStyle.label ? t(statusStyle.label) : ''}
                          </span>
                          <span className="text-[9px] uppercase font-black tracking-widest text-blue-500 px-1.5 py-0.5 bg-blue-50 rounded">
                            {c.category || 'mcq'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {c.start_date ? new Date(c.start_date).toLocaleDateString() : t('teacher.competitions.tbd')}
                          </span>
                        </div>
                        {c.my_can_setup !== false && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/teacher/competitions/${c.id}/setup`)
                            }}
                            className="mt-2 flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:text-violet-800 transition-colors"
                          >
                            <Settings2 className="h-3 w-3" /> {t('teacher.competitions.setupExam')}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={(e) => copyLink(c.id, e)}
                        className={clsx(
                          'p-1.5 rounded-md border transition-all',
                          copiedId === c.id
                            ? 'bg-green-50 border-green-200 text-green-600'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300',
                        )}
                        title={t('teacher.competitions.copyLink')}
                      >
                        {copiedId === c.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Registrations and Result Entry */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
          {!selectedComp ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              {t('teacher.competitions.selectToView')}
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {selectedComp.title} {t('teacher.competitions.participants')}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {registrations.length} {t('teacher.competitions.registered')}
                    {regsUpdating && (
                      <span className="ml-2 text-[10px] text-slate-400">· Updating…</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <p className="text-xs text-slate-500 sm:text-right">
                    {t('teacher.competitions.examForStudents')}{' '}
                    <span
                      className={clsx(
                        'font-semibold',
                        selectedComp.is_exam_active ? 'text-emerald-600' : 'text-slate-500',
                      )}
                    >
                      {selectedComp.is_exam_active ? t('teacher.competitions.open') : t('teacher.competitions.closed')}
                    </span>
                    <span className="text-slate-400"> · {t('teacher.competitions.setByAdmin')}</span>
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        {t('teacher.competitions.participant')}
                      </th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        {t('teacher.competitions.phone')}
                      </th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        {t('common.status')}
                      </th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">
                        {t('common.action')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loadingRegs ? (
                      <tr>
                        <td colSpan={4} className="p-5 text-center text-slate-400 text-sm">
                          {t('teacher.competitions.loadingParticipants')}
                        </td>
                      </tr>
                    ) : registrations.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-5 text-center text-slate-400 text-sm">
                          {t('teacher.competitions.noParticipants')}
                        </td>
                      </tr>
                    ) : (
                      registrations.map((reg) => (
                        <tr
                          key={reg.id}
                          className={clsx(
                            'hover:bg-slate-50/70',
                            selectedComp.my_can_grade !== false
                              ? 'cursor-pointer'
                              : 'cursor-default',
                          )}
                          onClick={() => {
                            if (selectedComp.my_can_grade !== false) {
                              navigate(
                                `/teacher/competitions/${selectedComp.id}/evaluate/${reg.id}`,
                              )
                            }
                          }}
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-900">{reg.name}</p>
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              {reg.is_submitted ? 'Submitted' : reg.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-sm text-slate-600">{reg.phone}</span>
                          </td>
                          <td className="px-5 py-4">
                            {reg.results_released ? (
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                                {t('teacher.competitions.published')}
                              </span>
                            ) : reg.competition_results &&
                              reg.competition_results.length > 0 ? (
                              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">
                                {t('teacher.competitions.draftSaved')}
                              </span>
                            ) : (
                              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                                {t('common.pending')}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {selectedComp.my_can_grade !== false ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(
                                    `/teacher/competitions/${selectedComp.id}/evaluate/${reg.id}`,
                                  )
                                }}
                              >
                                {t('teacher.competitions.evaluate')}
                              </Button>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 uppercase">
                                {t('teacher.competitions.gradingNA')}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardPageLayout>
  )
}
