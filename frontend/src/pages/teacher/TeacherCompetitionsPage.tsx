import { useEffect, useState } from 'react'
import { Search, Copy, Check, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import type { Competition, CompetitionRegistration } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clsx } from 'clsx'
import { useNavigate } from 'react-router-dom'


const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'text-slate-500 bg-slate-50 border-slate-200' },
  active: { label: 'Active', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  closed: { label: 'Closed', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
}

export default function TeacherCompetitionsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [selectedComp, setSelectedComp] = useState<Competition | null>(null)
  const [registrations, setRegistrations] = useState<CompetitionRegistration[]>([])
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    competitionApi.getTeacherCompetitions()
      .then(r => { if (r.success) setCompetitions(r.data) })
      .catch(() => toast.error('Could not load competitions'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const copyLink = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const link = `${window.location.origin}/compete/${id}`
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    toast.success('Registration link copied!')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const loadRegistrations = (comp: Competition) => {
    setSelectedComp(comp)
    setLoadingRegs(true)
    competitionApi.getCompetitionRegistrations(comp.id)
      .then(r => {
        if (r.success) {
          setRegistrations(r.data.registrations)
        }
      })
      .catch(() => toast.error('Could not load participants'))
      .finally(() => setLoadingRegs(false))
  }


  const filtered = competitions.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DashboardPageLayout
      title="My Assigned Competitions"
      description="View and grade participants for your assigned competitions."
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Competitions List */}
        <div className="w-full lg:w-1/3 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
          <div className="p-5 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search competitions..."
                className="pl-9 border-slate-200 text-sm w-full"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {loading ? (
              <div className="p-5 text-center text-slate-400 text-sm">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-5 text-center text-slate-400 text-sm">No competitions found.</div>
            ) : (
              filtered.map(c => {
                const statusStyle = STATUS_MAP[c.status] || STATUS_MAP.draft
                const isSelected = selectedComp?.id === c.id
                return (
                  <div 
                    key={c.id} 
                    className={clsx("p-4 cursor-pointer hover:bg-slate-50 transition-colors", isSelected && "bg-blue-50 border-l-4 border-l-blue-600")}
                    onClick={() => loadRegistrations(c)}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">{c.title}</p>
                        <div className="flex items-center gap-2 mt-2">
                           <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded border', statusStyle.cls)}>
                            {statusStyle.label}
                           </span>
                           <span className="text-[9px] uppercase font-black tracking-widest text-blue-500 px-1.5 py-0.5 bg-blue-50 rounded">
                             {c.category || 'mcq'}
                           </span>
                           <span className="text-xs text-slate-500">
                             {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'TBD'}
                           </span>
                         </div>
                         {c.my_can_setup !== false && (
                         <button
                           onClick={(e) => { e.stopPropagation(); navigate(`/teacher/competitions/${c.id}/setup`) }}
                           className="mt-2 flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:text-violet-800 transition-colors"
                         >
                           <Settings2 className="h-3 w-3" /> Setup Exam
                         </button>
                         )}
                      </div>
                      <button 
                        onClick={(e) => copyLink(c.id, e)}
                        className={clsx(
                          "p-1.5 rounded-md border transition-all",
                          copiedId === c.id ? "bg-green-50 border-green-200 text-green-600" : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300"
                        )}
                        title="Copy Registration Link"
                      >
                        {copiedId === c.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
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
                Select a competition to view and score participants.
             </div>
          ) : (
             <>
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">{selectedComp.title} Participants</h2>
                    <p className="text-sm text-slate-500">{registrations.length} registered</p>
                  </div>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <p className="text-xs text-slate-500 sm:text-right">
                      Exam for students:{' '}
                      <span
                        className={clsx(
                          'font-semibold',
                          selectedComp.is_exam_active ? 'text-emerald-600' : 'text-slate-500',
                        )}
                      >
                        {selectedComp.is_exam_active ? 'Open' : 'Closed'}
                      </span>
                      <span className="text-slate-400"> · Set by admin</span>
                    </p>
                  </div>
                </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Participant</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Phone</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Status</th>
                      <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loadingRegs ? (
                      <tr><td colSpan={4} className="p-5 text-center text-slate-400 text-sm">Loading participants...</td></tr>
                    ) : registrations.length === 0 ? (
                      <tr><td colSpan={4} className="p-5 text-center text-slate-400 text-sm">No participants registered yet.</td></tr>
                    ) : (
                      registrations.map(reg => (
                        <tr
                          key={reg.id}
                          className={clsx(
                            'hover:bg-slate-50/70',
                            selectedComp.my_can_grade !== false ? 'cursor-pointer' : 'cursor-default'
                          )}
                          onClick={() => {
                            if (selectedComp.my_can_grade !== false) {
                              navigate(`/teacher/competitions/${selectedComp.id}/evaluate/${reg.id}`)
                            }
                          }}
                        >
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-900">{reg.name}</p>
                            <span className="text-[10px] uppercase font-bold text-slate-400">
                              {reg.is_submitted ? "Submitted" : reg.status}
                            </span>
                          </td>
                          <td className="px-5 py-4"><span className="text-sm text-slate-600">{reg.phone}</span></td>
                          <td className="px-5 py-4">
                             {reg.results_released ? (
                               <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">Published</span>
                             ) : reg.competition_results && reg.competition_results.length > 0 ? (
                               <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-md">Draft Saved</span>
                             ) : (
                               <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">Pending</span>
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
                                 navigate(`/teacher/competitions/${selectedComp.id}/evaluate/${reg.id}`)
                              }}
                             >
                               Evaluate
                             </Button>
                             ) : (
                               <span className="text-[10px] font-bold text-slate-400 uppercase">Grading N/A</span>
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
