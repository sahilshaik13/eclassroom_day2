import { useEffect, useState } from 'react'
import { Plus, Search, Copy, Check, MoreVertical, Users, Trash2, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import api from '@/services/api'
import type { Competition, CompetitionStatus, CompetitionCategory, Teacher } from '@/types'
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

export default function AdminCompetitionsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
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
    status: 'draft' as CompetitionStatus 
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

  const load = () => {
    setLoading(true)
    competitionApi.getAdminCompetitions()
      .then(r => { if (r.success) setCompetitions(r.data) })
      .catch(() => toast.error('Could not load competitions'))
      .finally(() => setLoading(false))

    api.get('/admin/teachers')
      .then(r => setTeachers(r.data.data))
      .catch(() => {})
  }

  useEffect(() => {
    load()
  }, [])

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
      const res = await competitionApi.createCompetition(newComp)
      if (res.success) {
        toast.success("Competition created!")
        setShowCreate(false)
        setNewComp({ title: '', description: '', start_date: '', end_date: '', status: 'draft' as CompetitionStatus })
        load()
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
      const res = await competitionApi.updateCompetition(editingComp.id, editingComp)
      if (res.success) {
        toast.success("Competition updated!")
        setShowEdit(false)
        load()
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
        load()
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
        load()
      }
    } catch (e) {
      toast.error('Failed to delete competition')
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
      if (res.success) setRegistrations(res.data)
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

  const filtered = competitions.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DashboardPageLayout
      title="Competitions"
      description={`Manage and monitor ${competitions.length} competitions.`}
      actions={
        <Button className="gap-2" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4" /> {showCreate ? 'Cancel' : 'New Competition'}
        </Button>
      }
    >
      {showCreate && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
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
              <label className="block text-sm font-medium mb-1">Assign Teacher</label>
              <select 
                className="w-full border-slate-200 rounded-md p-2 border sm:text-sm"
                value={newComp.assigned_teacher_id || ''} 
                onChange={e => setNewComp({...newComp, assigned_teacher_id: e.target.value})}
              >
                <option value="">Select a teacher...</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-blue-500 font-medium italic">
                * Note: Assigning a teacher will automatically move the competition from "Draft" to "Active".
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">Save</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800">All Competitions</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 h-9 w-44 border-slate-200 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Title</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Teacher</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Dates</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Status</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">Loading...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-400">No competitions found.</td>
                </tr>
              ) : (
                filtered.map(c => {
                  const statusStyle = STATUS_MAP[c.status] || STATUS_MAP.draft
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                           <span className="text-[9px] uppercase font-black tracking-widest text-blue-500 px-1.5 py-0.5 bg-blue-50 rounded">
                              {c.category}
                           </span>
                           {c.description && <span className="text-xs text-slate-400 line-clamp-1">— {c.description}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-600">
                          {c.assigned_teacher?.name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-600">
                          {c.start_date ? new Date(c.start_date).toLocaleDateString() : 'TBD'} - {c.end_date ? new Date(c.end_date).toLocaleDateString() : 'TBD'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={clsx('text-[10px] font-bold px-2.5 py-1 rounded-full border', statusStyle.cls)}>
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mr-2"
                          onClick={() => copyLink(c.id)}
                        >
                          {copiedId === c.id ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />} 
                          <span className="ml-1 sr-only sm:not-sr-only">Link</span>
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-slate-300 hover:text-slate-600 transition-colors inline-flex mt-1 align-middle p-1 rounded-md hover:bg-slate-100">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => { setEditingComp(c); setShowEdit(true); }}>
                              Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openRegistrations(c)}>
                              <Users className="h-4 w-4 mr-2" /> Participants
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-amber-600 focus:text-amber-600"
                              onClick={() => { setTargetId(c.id); setShowCloseConfirm(true); }}
                              disabled={c.status === 'closed'}
                            >
                              Close Event
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600 focus:text-red-600 font-semibold"
                              onClick={() => { setTargetId(c.id); setShowDeleteConfirm(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete Event
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
                <label className="block text-sm font-medium mb-1 text-slate-700">Assigned Teacher</label>
                <select 
                  className="w-full border-slate-200 rounded-md p-2 border sm:text-sm focus:ring-blue-500 focus:border-blue-500"
                  value={editingComp.assigned_teacher_id || ''} 
                  onChange={e => setEditingComp({...editingComp, assigned_teacher_id: e.target.value})}
                >
                  <option value="">Unassigned</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
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
                {registrations.map(reg => (
                  <div key={reg.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{reg.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-slate-500 font-mono">{reg.phone}</p>
                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-300">
                          ID: {reg.student_id ? 'STUDENT' : 'EXTERNAL'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {reg.competition_results?.length > 0 && (
                        <div className="text-right hidden sm:block">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Current Score</p>
                           <p className="text-sm font-black text-blue-600">{reg.competition_results[0].score}</p>
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
                ))}
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
