import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, Search, MoreVertical, User, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Student } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ParticipantModal } from '@/components/admin/ParticipantModal'
import { InviteUserModal } from '@/components/admin/InviteUserModal'
import { TeacherStudentProfileModal } from '@/components/teacher/TeacherStudentProfileModal'
import { clsx } from 'clsx'
import { bandedTableHeadCellClass, bandedTableHeadClass, bandedTableRowClass } from '@/lib/tableBandStyles'

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

const STUDENT_PAGE_LIMIT = 100

export default function AdminStudentsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [trackFilter, setTrackFilter] = useState('all')
  const [strugglingOnly, setStrugglingOnly] = useState(false)
  const [profileStudent, setProfileStudent] = useState<StudentRow | null>(null)
  const [manageStudent, setManageStudent] = useState<StudentRow | null>(null)
  const [manageModalOpen, setManageModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)

  const { data: students = [], isPending: loading, isError: studentsError } = useQuery({
    queryKey: queryKeys.admin.students(STUDENT_PAGE_LIMIT),
    queryFn: async () =>
      (await api.get(`/admin/students?limit=${STUDENT_PAGE_LIMIT}`)).data
        .data as StudentRow[],
  })

  const refreshStudents = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.students(STUDENT_PAGE_LIMIT),
    })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.stats() })
  }

  useEffect(() => {
    if (studentsError) toast.error('Could not load students')
  }, [studentsError])

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

  function rowToProfileStudent(row: StudentRow) {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone || undefined,
      class_name: row.class_name,
      class_id: row.class_id,
      last_login_at: (row as { last_login_at?: string | null }).last_login_at ?? null,
      status: row.status,
    }
  }

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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
        {/* Filters */}
        <div className="p-5 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="shrink-0 min-w-0">
            <h2 className="text-base font-bold text-slate-800">All Students</h2>
            <p className="text-sm text-slate-400">Manage enrollments and track progress</p>
          </div>

          <div className="flex flex-row flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="relative shrink-0 w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, ID, or phone..."
                className="pl-9 h-9 w-full border-slate-200 text-sm"
              />
            </div>

            <div className="relative shrink-0 w-32">
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-9 w-full border-slate-200 text-sm">
                  <SelectValue placeholder="Class: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Class: All</SelectItem>
                  {classNames.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="relative shrink-0 w-32">
              <Select value={trackFilter} onValueChange={setTrackFilter}>
                <SelectTrigger className="h-9 w-full border-slate-200 text-sm">
                  <SelectValue placeholder="Track: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Track: All</SelectItem>
                  <SelectItem value="hifz">Hifz</SelectItem>
                  <SelectItem value="tajweed">Tajweed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={() => setStrugglingOnly(!strugglingOnly)}
              className={clsx(
                'inline-flex h-9 shrink-0 items-center gap-1.5 px-3 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap',
                strugglingOnly
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              )}
            >
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              Struggling Only
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className={bandedTableHeadClass}>
              <tr>
                <th className={clsx('w-12 px-4 py-3 align-middle', bandedTableHeadCellClass, 'text-[10px] font-bold uppercase tracking-wider')}>
                  <input type="checkbox" className="rounded mx-auto block" aria-label="Select all students" />
                </th>
                <th className={clsx('px-5 py-3 align-middle text-[10px] font-bold uppercase tracking-wider', bandedTableHeadCellClass)}>Student Name</th>
                <th className={clsx('px-5 py-3 align-middle text-[10px] font-bold uppercase tracking-wider', bandedTableHeadCellClass)}>Assigned Class</th>
                <th className={clsx('px-5 py-3 align-middle text-[10px] font-bold uppercase tracking-wider hidden md:table-cell', bandedTableHeadCellClass)}>Last Check-In</th>
                <th className={clsx('px-5 py-3 align-middle text-[10px] font-bold uppercase tracking-wider', bandedTableHeadCellClass)}>Status</th>
                <th className={clsx('w-12 px-4 py-3 align-middle', bandedTableHeadCellClass)} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td colSpan={6} className="px-5 py-3.5">
                      <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center align-middle">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                        <User className="h-6 w-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">No students found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s, index) => {
                  const status = s.status || (s.deactivated_at ? 'Inactive' : 'Active')
                  return (
                    <tr
                      key={s.id}
                      className={clsx(bandedTableRowClass(index), 'cursor-pointer group')}
                      onClick={() => setProfileStudent(s)}
                    >
                      <td className="w-12 px-4 py-3.5 align-middle" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="rounded mx-auto block" aria-label={`Select ${s.name}`} />
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <Avatar className="h-9 w-9 border border-slate-100 shrink-0">
                            <AvatarFallback className="bg-blue-50 text-blue-600 text-xs font-bold">
                              {s.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{s.name}</p>
                            <p className="text-xs text-slate-400 font-mono">ID: #{s.id.slice(-4).toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <div className="min-w-[140px]">
                          <p className="text-sm text-slate-700">{s.class_name || 'Not assigned'}</p>
                          {(s as any).teacher_name && (
                            <p className="text-xs text-slate-400 truncate">{(s as any).teacher_name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 align-middle hidden md:table-cell">
                        <span className="text-sm text-slate-500 whitespace-nowrap">{(s as any).last_checkin || 'Never'}</span>
                      </td>
                      <td className="px-5 py-3.5 align-middle">
                        <span className={clsx(
                          'inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap',
                          STATUS_STYLES[status] || STATUS_STYLES['Active']
                        )}>
                          {status}
                        </span>
                      </td>
                      <td className="w-12 px-4 py-3.5 align-middle text-center" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                          aria-label={`More actions for ${s.name}`}
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
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
            <p className="text-xs text-slate-400">
              Showing {filtered.length} of {students.length} students
            </p>
          </div>
        )}
      </div>

      <TeacherStudentProfileModal
        student={profileStudent ? rowToProfileStudent(profileStudent) : null}
        open={!!profileStudent}
        onOpenChange={(open) => {
          if (!open) setProfileStudent(null)
        }}
        onManageAccount={() => {
          if (!profileStudent) return
          setManageStudent(profileStudent)
          setProfileStudent(null)
          setManageModalOpen(true)
        }}
      />

      {manageStudent && (
        <ParticipantModal
          item={manageStudent}
          type="student"
          onSave={() => {
            refreshStudents()
            setManageModalOpen(false)
            setManageStudent(null)
          }}
          open={manageModalOpen}
          onOpenChange={(open) => {
            setManageModalOpen(open)
            if (!open) setManageStudent(null)
          }}
        />
      )}

      <InviteUserModal
        type="student"
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onSuccess={refreshStudents}
      />
    </DashboardPageLayout>
  )
}
