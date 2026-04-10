import { useEffect, useState } from 'react'
import { Plus, Download, Search, MoreVertical, User, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Student } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ParticipantModal } from '@/components/admin/ParticipantModal'
import { InviteUserModal } from '@/components/admin/InviteUserModal'
import { clsx } from 'clsx'

interface StudentRow extends Student {
  class_name?: string
  teacher_name?: string
  last_checkin?: string
  status?: string
}

const STATUS_STYLES: Record<string, string> = {
  Active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Struggling: 'text-amber-700  bg-amber-50  border-amber-200',
  Absent: 'text-red-700    bg-red-50    border-red-200',
  Excelling: 'text-blue-700   bg-blue-50   border-blue-200',
  Inactive: 'text-slate-500  bg-slate-50  border-slate-200',
  Disabled: 'text-slate-500  bg-slate-50  border-slate-200',
}

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')
  const [strugglingOnly, setStrugglingOnly] = useState(false)
  const [selected, setSelected] = useState<StudentRow | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/students?limit=100')
      .then(r => setStudents(r.data.data))
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Unique class names for filter
  const classNames = [...new Set(students.map(s => s.class_name).filter(Boolean))] as string[]

  const filtered = students.filter(s => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || '').includes(search)
    const matchClass = classFilter === 'all' || s.class_name === classFilter
    const matchStruggling = !strugglingOnly || s.status === 'Struggling'
    return matchSearch && matchClass && matchStruggling
  })

  const exportCSV = () => {
    const csv = ['Name,ID,Class,Teacher,Status,Last Check-In',
      ...filtered.map(s =>
        `${s.name},${s.id},${s.class_name || ''},${(s as any).teacher_name || ''},${s.status || 'Active'},${(s as any).last_checkin || '-'}`
      )
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'students.csv'
    a.click()
    toast.success('Exported!')
  }

  return (
    <DashboardPageLayout
      title="Student Management"
      description={`Manage enrollments, track progress, and assign plans.`}
      actions={
        <>
          <Button variant="outline" size="sm" className="hidden sm:flex gap-2 border-slate-200" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setInviteModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add Student
          </Button>
        </>
      }
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, ID, or email..."
              className="pl-9 h-9 border-slate-200 text-sm"
            />
          </div>

          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9 border-slate-200 text-sm">
              <SelectValue placeholder="Class: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Class: All</SelectItem>
              {classNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={trackFilter} onValueChange={setTrackFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9 border-slate-200 text-sm">
              <SelectValue placeholder="Track: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Track: All</SelectItem>
              <SelectItem value="hifz">Hifz</SelectItem>
              <SelectItem value="tajweed">Tajweed</SelectItem>
            </SelectContent>
          </Select>

          <button
            onClick={() => setStrugglingOnly(!strugglingOnly)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap',
              strugglingOnly
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Struggling Only
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <input type="checkbox" className="rounded" />
                </th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student Name</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Class</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Last Check-In</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3">
                      <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                        <User className="h-6 w-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">No students found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(s => {
                  const status = s.status || (s.deactivated_at ? 'Inactive' : 'Active')
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                      onClick={() => { setSelected(s); setModalOpen(true) }}
                    >
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="rounded" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-slate-100 shrink-0">
                            <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-bold">
                              {s.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                            <p className="text-xs text-slate-400 font-mono">ID: #{s.id.slice(-4).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div>
                          <p className="text-sm text-slate-700">{s.class_name || 'Not assigned'}</p>
                          {(s as any).teacher_name && (
                            <p className="text-xs text-slate-400">{(s as any).teacher_name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 hidden md:table-cell">
                        <span className="text-sm text-slate-500">{(s as any).last_checkin || 'Never'}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={clsx(
                          'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                          STATUS_STYLES[status] || STATUS_STYLES['Active']
                        )}>
                          {status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          className="text-slate-300 hover:text-slate-600 transition-colors"
                          onClick={e => { e.stopPropagation() }}
                        >
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

        {/* Footer */}
        {!loading && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">
              Showing {filtered.length} of {students.length} students
            </p>
          </div>
        )}
      </div>

      {selected && (
        <ParticipantModal
          item={selected}
          type="student"
          onSave={() => { load(); setModalOpen(false) }}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      )}

      <InviteUserModal
        type="student"
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onSuccess={load}
      />
    </DashboardPageLayout>
  )
}
