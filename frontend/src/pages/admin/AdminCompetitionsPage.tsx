import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Copy, Check, MoreVertical, Users, Trash2, ShieldAlert, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Competition, CompetitionStatus, CompetitionCategory, Teacher, CompetitionGraderScore } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clsx } from 'clsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
  active: { label: 'Active', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  closed: { label: 'Closed', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
}

function graderCountsSafe(c: Competition) {
  const graders = c.graders || []
  const names = graders.map((g) => g.name.trim()).filter(Boolean)
  const corrIds = new Set((c.corrected_grader_ids || []).map(String))
  const corrCount = graders.filter((g) => corrIds.has(String(g.teacher_id))).length
  const pendCount = Math.max(0, graders.length - corrCount)
  return { names, corrCount, pendCount }
}

function NameListDropdown({
  label,
  names,
  className,
}: {
  label: string
  names: string[]
  className?: string
}) {
  const list = names.map((n) => n.trim()).filter(Boolean)
  if (!list.length) {
    return <span className="text-[11px] text-slate-400">—</span>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={clsx(
            'inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-md px-0.5 py-0.5 text-left text-[11px] text-slate-700 underline decoration-slate-300 underline-offset-2 hover:bg-slate-100/80 hover:decoration-slate-600',
            className,
          )}
        >
          <span className="truncate">{list.join(', ')}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <div className="max-h-64 w-60 overflow-y-auto p-0">
          <div className="border-b border-slate-100 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {label}
          </div>
          <ul className="px-2 py-1.5">
            {list.map((n, i) => (
              <li
                key={`${n}-${i}`}
                className="border-b border-slate-50 py-1.5 text-sm text-slate-800 last:border-0"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SetupTeachersCell({ teachers, dense }: { teachers: { name: string }[]; dense?: boolean }) {
  const names = teachers.map((t) => t.name).filter(Boolean)
  return (
    <NameListDropdown
      label="Setup teachers"
      names={names}
      className={dense ? '!py-px !text-[10px]' : undefined}
    />
  )
}

function GradersNamesAndProgress({ c, dense }: { c: Competition; dense?: boolean }) {
  const { names, corrCount, pendCount } = graderCountsSafe(c)
  if (!names.length) return <span className={dense ? 'text-[10px] text-slate-400' : 'text-[11px] text-slate-400'}>None</span>
  return (
    <div className={dense ? 'space-y-0.5' : 'space-y-1'}>
      <NameListDropdown label="Graders" names={names} className={dense ? '!py-px !text-[10px]' : undefined} />
      <div className={clsx('flex flex-wrap', dense ? 'gap-0.5' : 'gap-1')}>
        <span className={clsx(
          'rounded bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-emerald-100/80',
          dense ? 'px-1 py-px text-[9px]' : 'rounded-md px-1.5 py-0.5 text-[10px]',
        )}>
          Done {corrCount}
        </span>
        <span className={clsx(
          'rounded bg-amber-50 font-semibold text-amber-800 ring-1 ring-amber-100/80',
          dense ? 'px-1 py-px text-[9px]' : 'rounded-md px-1.5 py-0.5 text-[10px]',
        )}>
          Pending {pendCount}
        </span>
      </div>
    </div>
  )
}

export default function AdminCompetitionsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Form state
  const [showCreate, setShowCreate] = useState(false)
  const [newComp, setNewComp] = useState<Partial<Competition>>({ 
    title: '', 
    category: 'mcq' as CompetitionCategory,
    description: '', 
    start_date: '', 
    end_date: '', 
    status: 'draft' as CompetitionStatus,
    grader_teacher_ids: [],
    setup_teacher_ids: [],
  })
  
  const [editingComp, setEditingComp] = useState<Competition | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false) // For Hard Delete
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)   // For Soft Close
  const [targetId, setTargetId] = useState<string | null>(null)

  // Registrations state
  const [showRegistrations, setShowRegistrations] = useState(false)
  const [selectedCompForRegs, setSelectedCompForRegs] = useState<Competition | null>(null)
  const [registrations, setRegistrations] = useState<any[]>([])
  const [loadingRegs, setLoadingRegs] = useState(false)

  const {
    data: competitions = [],
    isPending: loading,
    isError: compsError,
  } = useQuery({
    queryKey: queryKeys.admin.competitions(),
    queryFn: async () => {
      const r = await competitionApi.getAdminCompetitions()
      if (!r.success) throw new Error(r.error.message)
      return r.data
    },
    staleTime: 30_000,
  })

  const { data: teachers = [] } = useQuery({
    queryKey: queryKeys.admin.teachers(),
    queryFn: async () => (await api.get('/admin/teachers')).data.data as Teacher[],
  })

  const refreshCompetitionsAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.competitions() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.teachers() })
  }

  useEffect(() => {
    if (compsError) toast.error('Could not load competitions')
  }, [compsError])

  const copyLink = (id: string) => {
    const link = `${window.location.origin}/compete/${id}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    toast.success('Registration link copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...newComp }
      if (!payload.grader_teacher_ids?.length) delete payload.grader_teacher_ids
      if (!payload.setup_teacher_ids?.length) delete payload.setup_teacher_ids
      const res = await competitionApi.createCompetition(payload)
      if (res.success) {
        toast.success("Competition created!")
        setShowCreate(false)
        setNewComp({ title: '', description: '', start_date: '', end_date: '', status: 'draft' as CompetitionStatus, grader_teacher_ids: [], setup_teacher_ids: [] })
        refreshCompetitionsAdmin()
      } else {
        // @ts-ignore
        toast.error(res.error?.message || "Failed to create")
      }
    } catch (e: any) {
      toast.error('Failed to create competition')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingComp) return
    try {
      const payload: Partial<Competition> = { ...editingComp }
      delete (payload as { graders?: unknown }).graders
      delete (payload as { setup_teachers?: unknown }).setup_teachers
      delete (payload as { assigned_teacher?: unknown }).assigned_teacher
      const res = await competitionApi.updateCompetition(editingComp.id, payload)
      if (res.success) {
        toast.success("Competition updated!")
        setShowEdit(false)
        refreshCompetitionsAdmin()
      } else {
        // @ts-ignore
        toast.error(res.error?.message || "Failed to update")
      }
    } catch (e) {
      toast.error('Failed to update competition')
    }
  }

  const handleClose = async () => {
    if (!targetId) return
    try {
      // Soft close via update status
      const res = await competitionApi.updateCompetition(targetId, { status: 'closed' })
      if (res.success) {
        toast.success("Competition closed")
        setShowCloseConfirm(false)
        refreshCompetitionsAdmin()
      }
    } catch (e) {
      toast.error('Failed to close competition')
    }
  }

  const handleDelete = async () => {
    if (!targetId) return
    try {
      // Hard delete
      const res = await competitionApi.deleteCompetition(targetId)
      if (res.success) {
        toast.success("Competition purged permanently")
        setShowDeleteConfirm(false)
        refreshCompetitionsAdmin()
      }
    } catch (e) {
      toast.error('Failed to delete competition')
    }
  }

  const handlePublishResults = async (competition: Competition) => {
    try {
      const res = await competitionApi.publishCompetitionResults(competition.id)
      if (res.success) {
        toast.success('Competition results published to students')
        refreshCompetitionsAdmin()
        if (selectedCompForRegs?.id === competition.id) {
          fetchRegistrations(competition.id)
        }
      } else {
        // @ts-ignore
        toast.error(res.error?.message || 'Failed to publish results')
      }
    } catch {
      toast.error('Failed to publish results')
    }
  }

  const openRegistrations = (comp: Competition) => {
    setSelectedCompForRegs(comp)
    setShowRegistrations(true)
    fetchRegistrations(comp.id)
  }

  const fetchRegistrations = async (id: string) => {
    setLoadingRegs(true)
    try {
      const res = await competitionApi.getCompetitionRegistrations(id)
      if (res.success) setRegistrations(res.data.registrations)
    } catch (e) {
      toast.error('Failed to load participants')
    } finally {
      setLoadingRegs(false)
    }
  }

  const handleRemoveRegistration = async (regId: string) => {
    if (!selectedCompForRegs) return
    if (!window.confirm("Remove this participant? All their results for this event will be lost.")) return
    
    try {
      const res = await competitionApi.deleteRegistration(selectedCompForRegs.id, regId)
      if (res.success) {
        toast.success("Participant removed")
        fetchRegistrations(selectedCompForRegs.id)
      }
    } catch (e) {
      toast.error('Failed to remove participant')
    }
  }

  const filtered = competitions.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  )

  const handleToggleExam = async (c: Competition, nextActive: boolean) => {
    try {
      const res = await competitionApi.updateCompetition(c.id, { is_exam_active: nextActive })
      if (res.success) {
        toast.success(nextActive ? 'Exam window opened for students' : 'Exam window closed')
        refreshCompetitionsAdmin()
      } else {
        toast.error(res.error.message || 'Could not update exam')
      }
    } catch {
      toast.error('Could not update exam')
    }
  }

  const openEditCompetition = (c: Competition) => {
    setEditingComp({
      ...c,
      grader_teacher_ids:
        c.graders?.length
          ? c.graders.map((g) => g.teacher_id)
          : c.assigned_teacher_id
            ? [c.assigned_teacher_id]
            : [],
      setup_teacher_ids:
        c.setup_teachers?.length
          ? c.setup_teachers.map((g) => g.teacher_id)
          : c.graders?.length
            ? c.graders.map((g) => g.teacher_id)
            : c.assigned_teacher_id
              ? [c.assigned_teacher_id]
              : [],
    })
    setShowEdit(true)
  }

  const renderCompetitionActions = (c: Competition, compact: boolean) => (
    <div
      className={clsx(
        'flex flex-wrap items-center',
        compact ? 'gap-1' : 'gap-1.5',
        compact ? 'justify-start' : 'justify-end',
      )}
    >
      {c.status !== 'closed' && (
        <Button
          size="sm"
          variant={c.is_exam_active ? 'outline' : 'default'}
          className={clsx(
            'min-h-0 shrink-0 rounded-md font-semibold',
            compact ? 'h-7 px-2 text-[10px]' : 'h-8 px-3 text-xs',
            !c.is_exam_active && 'bg-emerald-600 hover:bg-emerald-700 text-white',
            c.is_exam_active &&
              'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800',
          )}
          onClick={() => handleToggleExam(c, !c.is_exam_active)}
          title={c.is_exam_active ? 'Close the exam window for students' : 'Let registered students take the exam'}
        >
          {c.is_exam_active ? 'Stop exam' : 'Start exam'}
        </Button>
      )}
      <Button
        size="sm"
        className={clsx(
          'min-h-0 shrink-0 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
          compact ? 'h-7 px-2 text-[10px]' : 'h-8 px-3 text-xs',
        )}
        disabled={!c.can_publish_results}
        onClick={() => handlePublishResults(c)}
        title={
          c.can_publish_results
            ? 'Publish competition results to students'
            : c.submitted_registrations_count
              ? 'Waiting for all assigned graders to finish correction'
              : 'No submitted participants yet'
        }
      >
        Publish
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={clsx(
          'min-h-0 shrink-0 rounded-md border-slate-200',
          compact ? 'h-7 w-7 p-0' : 'h-8 px-2.5',
        )}
        onClick={() => copyLink(c.id)}
        title="Copy registration link"
      >
        {copiedId === c.id ? <Check className="h-3 w-3 text-green-600 sm:h-3.5 sm:w-3.5" /> : <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
        {!compact && <span className="ml-1">Link</span>}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={clsx(
              'inline-flex shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700',
              compact ? 'h-7 w-7' : 'h-8 w-8 border-transparent hover:border-slate-200',
            )}
            title="More actions"
          >
            <MoreVertical className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => openEditCompetition(c)}>Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={() => openRegistrations(c)}>
            <Users className="mr-2 h-4 w-4" /> Participants
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-amber-600 focus:text-amber-600"
            onClick={() => {
              setTargetId(c.id)
              setShowCloseConfirm(true)
            }}
            disabled={c.status === 'closed'}
          >
            Close Event
          </DropdownMenuItem>
          <DropdownMenuItem
            className="font-semibold text-red-600 focus:text-red-600"
            onClick={() => {
              setTargetId(c.id)
              setShowDeleteConfirm(true)
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Event
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  return (
    <DashboardPageLayout
      title="Competitions"
      description={`Manage and monitor ${competitions.length} competitions.`}
      className="space-y-3 pb-28 sm:space-y-4 md:pb-8"
      actions={
        <Button
          className="min-h-0 h-8 gap-1 px-3 text-xs font-semibold sm:h-9 sm:gap-2 sm:px-4"
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
        >
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>{showCreate ? 'Cancel' : 'New'}</span>
          <span className="hidden sm:inline">{showCreate ? '' : ' Competition'}</span>
        </Button>
      }
    >
      {showCreate && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:rounded-xl md:p-5">
          <h2 className="text-lg font-bold mb-4">Create Competition</h2>
          <form onSubmit={handleCreate} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1 uppercase text-[10px] text-slate-400 font-bold">Category</label>
                <select 
                  className="w-full border-slate-200 rounded-md p-2 border sm:text-sm"
                  value={newComp.category} 
                  onChange={e => setNewComp({...newComp, category: e.target.value as CompetitionCategory})}
                >
                  <option value="mcq">MCQ (Auto-Graded)</option>
                  <option value="hifz">Hifz (Audio Recording)</option>
                  <option value="khirat">Khirat (Audio Recording)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1 uppercase text-[10px] text-slate-400 font-bold">Title</label>
                <Input required value={newComp.title} onChange={e => setNewComp({...newComp, title: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea 
                className="w-full border-slate-200 rounded-md p-2 border sm:text-sm"
                value={newComp.description} 
                onChange={e => setNewComp({...newComp, description: e.target.value})}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <Input type="date" value={newComp.start_date} onChange={e => setNewComp({...newComp, start_date: e.target.value})} />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">End Date</label>
                <Input type="date" value={newComp.end_date} onChange={e => setNewComp({...newComp, end_date: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Grading teachers</label>
              <p className="text-[10px] text-slate-500 mb-2">
                Select one or more teachers. With <span className="font-semibold text-slate-700">two or more</span> graders, each only <span className="font-semibold">saves</span> a score; the official average is shown to students only after <span className="font-semibold">every</span> selected grader has submitted.
              </p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
                {teachers.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2">No teachers in this tenant.</p>
                ) : (
                  teachers.map(t => {
                    const sel = (newComp.grader_teacher_ids || []).includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={sel}
                          onChange={() => {
                            const cur = new Set(newComp.grader_teacher_ids || [])
                            if (cur.has(t.id)) cur.delete(t.id)
                            else cur.add(t.id)
                            setNewComp({ ...newComp, grader_teacher_ids: [...cur] })
                          }}
                        />
                        <span className="text-slate-800">{t.name}</span>
                      </label>
                    )
                  })
                )}
              </div>
              <p className="mt-1 text-[10px] text-blue-600 font-medium">
                Assigning at least one grader moves the competition from Draft to Active.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Exam setup teachers</label>
              <p className="text-[10px] text-slate-500 mb-2">
                Who may edit exam content and settings. Opening and closing the exam for students is done from this admin competitions list. Can differ from graders. If you leave this empty but pick graders, setup defaults to the same teachers.
              </p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-violet-50/40 p-2 space-y-1.5">
                {teachers.length === 0 ? (
                  <p className="text-xs text-slate-400 p-2">No teachers in this tenant.</p>
                ) : (
                  teachers.map(t => {
                    const sel = (newComp.setup_teacher_ids || []).includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={sel}
                          onChange={() => {
                            const cur = new Set(newComp.setup_teacher_ids || [])
                            if (cur.has(t.id)) cur.delete(t.id)
                            else cur.add(t.id)
                            setNewComp({ ...newComp, setup_teacher_ids: [...cur] })
                          }}
                        />
                        <span className="text-slate-800">{t.name}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Save</Button>
            </div>
          </form>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:rounded-xl">
        <div className="flex flex-col gap-1.5 border-b border-slate-100 p-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:p-3 md:p-3">
          <h2 className="text-xs font-bold text-slate-800 sm:text-sm md:text-base">All Competitions</h2>
          <div className="relative w-full sm:w-auto sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-8 w-full rounded-md border-slate-200 pl-7 text-xs sm:h-9 sm:rounded-lg sm:pl-8 sm:text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No competitions found.</div>
        ) : (
          <>
            <div className="space-y-1.5 p-2 md:hidden">
              {filtered.map((c) => {
                const statusStyle = STATUS_MAP[c.status] || STATUS_MAP.draft
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-2 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-tight text-slate-900">{c.title}</p>
                        <span className="mt-0.5 inline-block rounded bg-blue-50 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide text-blue-600">
                          {c.category}
                        </span>
                      </div>
                      <span
                        className={clsx(
                          'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold',
                          statusStyle.cls,
                        )}
                      >
                        {statusStyle.label}
                      </span>
                    </div>
                    <div className="mt-1.5 grid gap-1 text-[10px] leading-snug text-slate-600">
                      <div className="flex gap-1">
                        <span className="w-11 shrink-0 font-semibold text-slate-500">Setup</span>
                        <div className="min-w-0 flex-1">
                          {c.setup_teachers && c.setup_teachers.length > 0 ? (
                            <SetupTeachersCell teachers={c.setup_teachers} dense />
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <span className="w-11 shrink-0 font-semibold text-slate-500">Graders</span>
                        <div className="min-w-0 flex-1">
                          <GradersNamesAndProgress c={c} dense />
                        </div>
                      </div>
                      <div className="mt-1 border-t border-slate-100/80 pt-1.5 text-[10px] text-slate-500">
                        {c.start_date
                          ? new Date(c.start_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'TBD'}{' '}
                        →{' '}
                        {c.end_date
                          ? new Date(c.end_date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'TBD'}
                      </div>
                    </div>
                    <div className="mt-2 border-t border-slate-100 pt-2">{renderCompetitionActions(c, true)}</div>
                  </div>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Title
                    </th>
                    <th className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Exam setup
                    </th>
                    <th className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Graders
                    </th>
                    <th className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Dates
                    </th>
                    <th className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Status
                    </th>
                    <th className="border-b border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((c) => {
                    const statusStyle = STATUS_MAP[c.status] || STATUS_MAP.draft
                    return (
                      <tr key={c.id} className="group transition-colors hover:bg-slate-50/70">
                        <td className="max-w-[220px] px-3 py-2 align-top">
                          <p className="text-xs font-semibold text-slate-900">{c.title}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="rounded bg-blue-50 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-blue-600">
                              {c.category}
                            </span>
                            {c.description && (
                              <span className="line-clamp-1 text-[10px] text-slate-400">— {c.description}</span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[168px] px-3 py-2 align-top">
                          {c.setup_teachers && c.setup_teachers.length > 0 ? (
                            <SetupTeachersCell teachers={c.setup_teachers} />
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="max-w-[148px] px-3 py-2 align-top">
                          <GradersNamesAndProgress c={c} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-top text-[11px] text-slate-600">
                          {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'TBD'} —{' '}
                          {c.end_date ? new Date(c.end_date).toLocaleDateString() : 'TBD'}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={clsx(
                              'inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold',
                              statusStyle.cls,
                            )}
                          >
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">{renderCompetitionActions(c, false)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Competition</DialogTitle>
          </DialogHeader>
          {editingComp && (
            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Category</label>
                  <select 
                    className="w-full border-slate-200 rounded-md p-2 border sm:text-sm"
                    value={editingComp.category} 
                    onChange={e => setEditingComp({...editingComp, category: e.target.value as CompetitionCategory})}
                  >
                    <option value="mcq">MCQ</option>
                    <option value="hifz">Hifz</option>
                    <option value="khirat">Khirat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Title</label>
                  <Input required value={editingComp.title} onChange={e => setEditingComp({...editingComp, title: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Description</label>
                <textarea 
                  className="w-full border-slate-200 rounded-md p-2 border sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  value={editingComp.description || ''} 
                  onChange={e => setEditingComp({...editingComp, description: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">Start Date</label>
                  <Input type="date" value={editingComp.start_date || ''} onChange={e => setEditingComp({...editingComp, start_date: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-700">End Date</label>
                  <Input type="date" value={editingComp.end_date || ''} onChange={e => setEditingComp({...editingComp, end_date: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Status</label>
                <select 
                  className="w-full border-slate-200 rounded-md p-2 border sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  value={editingComp.status} 
                  onChange={e => setEditingComp({...editingComp, status: e.target.value as CompetitionStatus})}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Grading teachers</label>
                <p className="text-[10px] text-slate-500 mb-2">
                  With multiple graders, students see the official average only after every grader listed here has saved a score.
                </p>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
                  {teachers.map(t => {
                    const sel = (editingComp.grader_teacher_ids || []).includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={sel}
                          onChange={() => {
                            const cur = new Set(editingComp.grader_teacher_ids || [])
                            if (cur.has(t.id)) cur.delete(t.id)
                            else cur.add(t.id)
                            setEditingComp({ ...editingComp, grader_teacher_ids: [...cur] })
                          }}
                        />
                        <span className="text-slate-800">{t.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Exam setup teachers</label>
                <p className="text-[10px] text-slate-500 mb-2">Content and settings only. Start/stop exam is controlled from the competitions list.</p>
                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-violet-50/40 p-2 space-y-1.5">
                  {teachers.map(t => {
                    const sel = (editingComp.setup_teacher_ids || []).includes(t.id)
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={sel}
                          onChange={() => {
                            const cur = new Set(editingComp.setup_teacher_ids || [])
                            if (cur.has(t.id)) cur.delete(t.id)
                            else cur.add(t.id)
                            setEditingComp({ ...editingComp, setup_teacher_ids: [...cur] })
                          }}
                        />
                        <span className="text-slate-800">{t.name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Close Confirmation Dialog */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Close Competition?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              This will set the status to <span className="font-bold text-amber-700">Closed</span>. 
              New registrations will be blocked, but existing data and results remain accessible.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancel</Button>
            <Button type="button" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleClose}>Confirm Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HARD Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" /> Delete Permanently?
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              This action is <span className="font-black text-red-600 uppercase">Irreversible</span>. 
              Deleting this competition will immediately purge:
            </p>
            <ul className="text-xs text-slate-500 mt-2 list-disc pl-5 space-y-1">
              <li>All participant registrations</li>
              <li>All scores and competition results</li>
              <li>Registration links will stop working</li>
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete}>Purge Everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrations Modal */}
      <Dialog open={showRegistrations} onOpenChange={setShowRegistrations}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-6 border-b border-slate-100">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span>Participants</span>
              </div>
              <span className="text-sm font-normal text-slate-400">
                {registrations.length} Total
              </span>
            </DialogTitle>
            <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">
               {selectedCompForRegs?.title}
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {loadingRegs ? (
              <div className="py-12 text-center text-slate-400 text-sm italic">Loading participants...</div>
            ) : registrations.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No registrations yet.</div>
            ) : (
              <div className="space-y-3">
                {registrations.map(reg => {
                  const gScores = reg.competition_grader_scores || []
                  const official = reg.competition_results?.[0]
                  return (
                  <div key={reg.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-800">{reg.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-slate-500 font-mono">{reg.phone}</p>
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-300">
                          ID: {reg.student_id ? 'STUDENT' : 'EXTERNAL'}
                        </span>
                      </div>
                      {gScores.length > 0 && (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Scores by grader</p>
                          <ul className="space-y-1.5">
                            {gScores.map((s: CompetitionGraderScore) => (
                              <li key={s.id} className="flex justify-between gap-2 text-slate-700">
                                <span className="truncate">{s.grader_name || 'Evaluator'}</span>
                                <span className="font-bold tabular-nums shrink-0">{s.score}/100</span>
                              </li>
                            ))}
                          </ul>
                          {official && (
                            <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-slate-900 font-bold">
                              <span>Official average</span>
                              <span className="text-blue-600 tabular-nums">{official.score}/100</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 shrink-0 self-end sm:self-start">
                      {official && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                            {gScores.length > 1 ? 'Official avg.' : 'Score'}
                          </p>
                          <p className="text-sm font-black text-blue-600">{official.score}</p>
                        </div>
                      )}
                      <button 
                        onClick={() => handleRemoveRegistration(reg.id)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Remove Participant"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
          
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <Button variant="outline" className="w-full text-slate-600 font-bold" onClick={() => setShowRegistrations(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  )
}
