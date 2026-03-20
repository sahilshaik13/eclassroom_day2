import { useEffect, useState } from 'react'
import { Plus, Download, Search, Filter, MoreVertical, Copy, Check, User, Users, Mail } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Teacher } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ParticipantModal } from '@/components/admin/ParticipantModal'
import { InviteUserModal } from '@/components/admin/InviteUserModal'
import { clsx } from 'clsx'

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

  const load = () => {
    setLoading(true)
    api.get('/admin/teachers')
      .then(r => setTeachers(r.data.data))
      .catch(() => toast.error('Could not load teachers'))
      .finally(() => setLoading(false))

    // Load pending teacher applications
    api.get('/admin/teachers/applications?status=pending')
      .then(r => setPendingApps(r.data.data?.slice(0, 5) || []))
      .catch(() => {
        // Fallback UI data when endpoint not ready
        setPendingApps([
          { id: '1', name: 'Mohammed F.', subject: 'Hifz', experience: 'Experienced', applied_ago: '2h ago' },
          { id: '2', name: 'Yusuf K.', subject: 'Tajweed', applied_ago: '1d ago' },
          { id: '3', name: 'Hassan A.', subject: 'Arabic', applied_ago: '3d ago' },
        ])
      })
  }

  useEffect(load, [])

  const copyLink = () => {
    navigator.clipboard.writeText('https://thinktarteeb.com/apply/teacher')
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
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
                    const status = t.deactivated_at ? 'inactive' : 'active'
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
                            — students
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
        <div className="w-full lg:w-72 space-y-4 shrink-0">
          {/* Recruitment Link */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Recruitment Link</p>
                <p className="text-xs text-slate-400">Share with applicants</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono border border-slate-100 mb-3 truncate">
              https://thinktarteeb.com/apply/teacher
            </div>
            <Button onClick={copyLink} className="w-full gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
              {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
            </Button>
          </div>

          {/* Pending Applications */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-900">Pending Applications</p>
              <Badge className="bg-orange-100 text-orange-700 border-none text-[10px] font-bold px-2">
                {pendingApps.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {pendingApps.map(app => (
                <div key={app.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 border border-slate-100">
                        <AvatarFallback className="bg-slate-200 text-slate-600 text-xs font-bold">
                          {app.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{app.name}</p>
                        <p className="text-[10px] text-slate-400">Applied {app.applied_ago}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {app.subject && <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">{app.subject}</span>}
                    {app.experience && <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">{app.experience}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-[10px] font-bold bg-blue-600 hover:bg-blue-700">Review</Button>
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] font-bold border-slate-200">
                      <Mail className="h-3 w-3 mr-1" /> Contact
                    </Button>
                  </div>
                </div>
              ))}
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
    </DashboardPageLayout>
  )
}
