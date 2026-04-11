import { useEffect, useState } from 'react'
import { Plus, Download, Search, Filter, MoreVertical, Copy, Check, User, Users, Loader2, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Teacher } from '@/types'
import { supabase } from '@/lib/supabase'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ParticipantModal } from '@/components/admin/ParticipantModal'
import { InviteUserModal } from '@/components/admin/InviteUserModal'
import { clsx } from 'clsx'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  inactive: { label: 'Inactive', cls: 'text-slate-500  bg-slate-50  border-slate-200' },
  leave: { label: 'On Leave', cls: 'text-amber-700  bg-amber-50  border-amber-200' },
}

interface PendingApp {
  id: string
  name: string
  subject?: string
  experience?: string
  applied_ago?: string
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [pendingApps, setPendingApps] = useState<PendingApp[]>([])
  const [tenant, setTenant] = useState<{ id: string; name: string; slug: string } | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [appToReject, setAppToReject] = useState<PendingApp | null>(null)

  const load = () => {
    setLoading(true)
    api.get('/admin/teachers')
      .then(r => setTeachers(r.data.data))
      .catch(() => toast.error('Could not load teachers'))
      .finally(() => setLoading(false))

    // Load tenant info for the recruitment link
    api.get('/admin/tenant-info')
      .then(r => setTenant(r.data.data))
      .catch(() => {})

    // Load pending teacher applications
    api.get('/admin/teachers/applications?status=pending')
      .then(r => setPendingApps(r.data.data || []))
      .catch(() => {})
  }

  useEffect(() => {
    load();

    // Subscribe to realtime updates if we have a tenant ID
    if (!tenant?.id) return;

    const channel = supabase
      .channel(`public:teacher_applications:${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'teacher_applications',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          // Reload pending applications list
          api.get('/admin/teachers/applications?status=pending')
            .then(r => setPendingApps(r.data.data || []));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenant?.id]);

  const copyLink = () => {
    if (!tenant) return toast.error('Organization info not loaded')
    const link = `${window.location.origin}/apply/${tenant.slug}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success('Recruitment link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApprove = async (appId: string) => {
    setProcessingId(appId)
    try {
      await api.post(`/admin/teachers/applications/${appId}/approve`)
      toast.success('Application approved! Invitation sent.')
      load()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to approve')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = (app: PendingApp) => {
    setAppToReject(app)
  }

  const confirmReject = async () => {
    if (!appToReject) return
    const appId = appToReject.id
    setProcessingId(appId)
    setAppToReject(null)
    try {
      await api.post(`/admin/teachers/applications/${appId}/reject`)
      toast.success('Application rejected')
      // Realtime will handle the list update, but load() ensures consistency
      load()
    } catch (e: any) {
      toast.error('Failed to reject')
    } finally {
      setProcessingId(null)
    }
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <DashboardPageLayout
      title="Teacher Management"
      description={`Manage and monitor ${teachers.length} registered teachers.`}
      actions={
        <>
          <Button variant="outline" size="sm" className="hidden sm:flex gap-2 border-slate-200">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button className="gap-2" size="sm" onClick={() => setInviteModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Teacher
          </Button>
        </>
      }
    >
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: Active Teachers */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
          {/* Table header */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-800">Active Teachers</h2>
              <p className="text-sm text-slate-400">Manage your current teaching staff</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search teachers..."
                  className="pl-9 h-9 w-44 border-slate-200 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9 border-slate-200">
                <Filter className="h-4 w-4" />
              </Button>
              <Button size="sm" className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setInviteModalOpen(true)}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Teacher Name</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Classes</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Students</th>
                  <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Status</th>
                  <th className="px-5 py-3 border-b border-slate-100"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-4">
                        <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">
                      No teachers found.
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => {
                    const status = t.deactivated_at ? 'leave' : 'active'
                    const statusStyle = STATUS_MAP[status]
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                        onClick={() => { setSelected(t); setModalOpen(true) }}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-slate-100">
                              <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-bold">
                                {t.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                              <p className="text-xs text-slate-400">{t.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm text-slate-600">{t.class_count} {t.class_count === 1 ? 'class' : 'classes'}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-sm text-slate-600 flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-slate-400" />
                            {t.student_count} {t.student_count === 1 ? 'student' : 'students'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={clsx('text-[10px] font-bold px-2.5 py-1 rounded-full border', statusStyle.cls)}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button className="text-slate-300 hover:text-slate-600 transition-colors">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Recruitment + Pending Applications */}
        <div className="w-full lg:w-80 space-y-4 shrink-0">
          {/* Recruitment Link */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Recruitment Link</p>
                <p className="text-xs text-slate-400">Public application page</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-[10px] text-slate-500 font-mono border border-slate-100 mb-3 break-all">
              {tenant ? `${window.location.origin}/apply/${tenant.slug}` : 'Loading...'}
            </div>
            <Button onClick={copyLink} className="w-full gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
              {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
            </Button>
          </div>

          {/* Pending Applications */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-900">Pending Applications</p>
              <Badge className="bg-blue-100 text-blue-700 border-none text-[10px] font-bold px-2">
                {pendingApps.length}
              </Badge>
            </div>
            <div className="space-y-4">
              {pendingApps.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-slate-400 italic">No pending applications</p>
                </div>
              ) : (
                pendingApps.map(app => (
                  <div key={app.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7 border border-slate-100">
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-[10px] font-bold">
                            {app.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-tight">{app.name}</p>
                          <p className="text-[10px] text-slate-400">{app.applied_ago}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {app.subject && <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md border border-blue-100/50">{app.subject}</span>}
                    </div>
                    {app.experience && (
                      <p className="text-[10px] text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                        {app.experience}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        disabled={processingId === app.id}
                        onClick={() => handleApprove(app.id)}
                        className="flex-1 h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 border-none shadow-sm shadow-emerald-900/10"
                      >
                        {processingId === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        disabled={processingId === app.id}
                        onClick={() => handleReject(app)}
                        className="flex-1 h-7 text-[10px] font-bold text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        {processingId === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reject'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {selected && (
        <ParticipantModal
          item={selected}
          type="teacher"
          onSave={() => { load(); setModalOpen(false) }}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      )}

      <InviteUserModal
        type="teacher"
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onSuccess={load}
      />
      {/* Reject Confirmation Modal */}
      <Dialog open={!!appToReject} onOpenChange={(open) => !open && setAppToReject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <UserX className="h-5 w-5" />
              Reject Application
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 mb-2">
              Are you sure you want to reject the application from <span className="font-bold text-slate-900">{appToReject?.name}</span>?
            </p>
            <p className="text-xs text-slate-400">
              This action will mark the application as rejected. The applicant will not be notified automatically by this action alone, but they will no longer appear in your pending list.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="ghost" 
              onClick={() => setAppToReject(null)}
              className="font-semibold text-slate-600"
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmReject}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  )
}
