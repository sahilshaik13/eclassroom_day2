import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Download, Search, Filter, Copy, Check, User, Users, Loader2, UserX, Send, GraduationCap } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { queryKeys } from '@/lib/queryKeys'
import type { ClassItem, Teacher } from '@/types'
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

interface PendingTeacherApp {
  id: string
  name: string
  subject?: string
  experience?: string
  applied_ago?: string
}

interface PendingStudentApp {
  id: string
  name: string
  phone: string
  notes?: string
  applied_ago?: string
}

interface RejectTarget {
  id: string
  name: string
  type: 'teacher' | 'student'
}

export default function AdminTeachersPage() {
  const location = useLocation()
  const isApplicantsView = location.pathname.startsWith('/admin/applicants')

  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [copiedLink, setCopiedLink] = useState<'teacher' | 'student' | null>(null)
  const [selected, setSelected] = useState<Teacher | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null)
  const [studentAppToApprove, setStudentAppToApprove] = useState<PendingStudentApp | null>(null)
  const [mobileApplicantsTab, setMobileApplicantsTab] = useState<'teachers' | 'students'>('teachers')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [selectedClassId, setSelectedClassId] = useState('')
  const [resendingId, setResendingId] = useState<string | null>(null)

  const { data: teachers = [], isPending: loading, isError: teachersError } = useQuery({
    queryKey: queryKeys.admin.teachers(),
    queryFn: async () => (await api.get('/admin/teachers')).data.data as Teacher[],
  })

  const { data: tenant } = useQuery({
    queryKey: queryKeys.admin.tenantInfo(),
    queryFn: async () =>
      (await api.get('/admin/tenant-info')).data.data as {
        id: string
        name: string
        slug: string
      },
  })

  const { data: classes = [] } = useQuery({
    queryKey: queryKeys.admin.classes(),
    queryFn: async () => (await api.get('/admin/classes')).data.data as ClassItem[],
    enabled: isApplicantsView,
  })

  const { data: pendingApps = [], isPending: pendingLoading } = useQuery({
    queryKey: queryKeys.admin.teacherApplications('pending'),
    queryFn: async () =>
      ((await api.get('/admin/teachers/applications?status=pending')).data.data ??
        []) as PendingTeacherApp[],
    enabled: isApplicantsView,
  })

  const { data: pendingStudentApps = [], isPending: pendingStudentsLoading } = useQuery({
    queryKey: queryKeys.admin.studentApplications('pending'),
    queryFn: async () =>
      ((await api.get('/admin/students/applications?status=pending')).data.data ??
        []) as PendingStudentApp[],
    enabled: isApplicantsView,
  })

  useEffect(() => {
    if (!isApplicantsView && teachersError) toast.error('Could not load teachers')
  }, [teachersError, isApplicantsView])

  const refreshTeacherAdmin = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.teachers() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantInfo() })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.teacherApplications('pending'),
    })
    void queryClient.invalidateQueries({
      queryKey: queryKeys.admin.studentApplications('pending'),
    })
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.classes() })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'students'] })
  }

  useEffect(() => {
    if (!tenant?.id) return

    const channel = supabase
      .channel(`public:applications:${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teacher_applications',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.admin.teacherApplications('pending'),
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'student_applications',
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.admin.studentApplications('pending'),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tenant?.id, queryClient])

  const copyLink = (type: 'teacher' | 'student') => {
    if (!tenant) return toast.error('Organization info not loaded')
    const link =
      type === 'teacher'
        ? `${window.location.origin}/apply/${tenant.slug}`
        : `${window.location.origin}/apply/${tenant.slug}/student`
    navigator.clipboard.writeText(link)
    setCopiedLink(type)
    toast.success(`${type === 'teacher' ? 'Teacher' : 'Student'} invite link copied!`)
    setTimeout(() => setCopiedLink(current => (current === type ? null : current)), 2000)
  }

  const handleApproveTeacher = async (appId: string) => {
    setProcessingId(appId)
    try {
      await api.post(`/admin/teachers/applications/${appId}/approve`)
      toast.success('Application approved! Invitation sent.')
      refreshTeacherAdmin()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to approve')
    } finally {
      setProcessingId(null)
    }
  }

  const openApproveStudent = (app: PendingStudentApp) => {
    setStudentAppToApprove(app)
    setSelectedTeacherId('')
    setSelectedClassId('')
  }

  const handleRejectTeacher = (app: PendingTeacherApp) => {
    setRejectTarget({ id: app.id, name: app.name, type: 'teacher' })
  }

  const handleRejectStudent = (app: PendingStudentApp) => {
    setRejectTarget({ id: app.id, name: app.name, type: 'student' })
  }

  const handleApproveStudent = async () => {
    if (!studentAppToApprove) return
    if (!selectedTeacherId) {
      toast.error('Please choose a teacher first')
      return
    }
    if (!selectedClassId) {
      toast.error('Please choose a class to assign the student to')
      return
    }

    setProcessingId(studentAppToApprove.id)
    try {
      await api.post(`/admin/students/applications/${studentAppToApprove.id}/approve`, {
        class_id: selectedClassId,
      })
      toast.success('Student approved and assigned successfully!')
      setStudentAppToApprove(null)
      setSelectedTeacherId('')
      setSelectedClassId('')
      refreshTeacherAdmin()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to approve student')
    } finally {
      setProcessingId(null)
    }
  }

  const confirmReject = async () => {
    if (!rejectTarget) return
    const appId = rejectTarget.id
    setProcessingId(appId)
    const type = rejectTarget.type
    setRejectTarget(null)
    try {
      await api.post(
        type === 'teacher'
          ? `/admin/teachers/applications/${appId}/reject`
          : `/admin/students/applications/${appId}/reject`
      )
      toast.success(`${type === 'teacher' ? 'Teacher' : 'Student'} application rejected`)
      refreshTeacherAdmin()
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to reject')
    } finally {
      setProcessingId(null)
    }
  }

  const handleResendInvite = async (e: React.MouseEvent, teacherId: string) => {
    e.stopPropagation()
    setResendingId(teacherId)
    try {
      await api.post(`/admin/teachers/${teacherId}/resend-invite`)
      toast.success('Invite email resent successfully!')
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Failed to resend invite')
    } finally {
      setResendingId(null)
    }
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  )
  const teachersWithClasses = teachers.filter(t => classes.some(c => c.teacher_id === t.id))
  const classesForSelectedTeacher = selectedTeacherId
    ? classes.filter(c => c.teacher_id === selectedTeacherId)
    : []

  const teacherApplicantsPanel = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-slate-900">Applied Teachers</p>
        <Badge className="bg-blue-100 text-blue-700 border-none text-[10px] font-bold px-2">
          {pendingApps.length}
        </Badge>
      </div>
      <div className="space-y-4">
        {pendingLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))
        ) : pendingApps.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-slate-400 italic">No pending teacher applications</p>
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
                  onClick={() => handleApproveTeacher(app.id)}
                  className="flex-1 h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 border-none shadow-sm shadow-emerald-900/10"
                >
                  {processingId === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={processingId === app.id}
                  onClick={() => handleRejectTeacher(app)}
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
  )

  const studentApplicantsPanel = (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-slate-900">Applied Students</p>
        <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] font-bold px-2">
          {pendingStudentApps.length}
        </Badge>
      </div>
      <div className="space-y-4">
        {pendingStudentsLoading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-xl" />
          ))
        ) : pendingStudentApps.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-xs text-slate-400 italic">No pending student applications</p>
          </div>
        ) : (
          pendingStudentApps.map(app => (
            <div key={app.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7 border border-slate-100">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                      {app.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs font-bold text-slate-900 leading-tight">{app.name}</p>
                    <p className="text-[10px] text-slate-400">{app.applied_ago}</p>
                  </div>
                </div>
              </div>
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-slate-500">Phone</p>
                <p className="text-xs text-slate-700">{app.phone}</p>
              </div>
              {app.notes && (
                <p className="text-[10px] text-slate-500 mb-3 line-clamp-3 leading-relaxed">
                  {app.notes}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={processingId === app.id}
                  onClick={() => openApproveStudent(app)}
                  className="flex-1 h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 border-none shadow-sm shadow-emerald-900/10"
                >
                  Assign &amp; Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={processingId === app.id}
                  onClick={() => handleRejectStudent(app)}
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
  )

  if (isApplicantsView) {
    return (
      <DashboardPageLayout
        title="New Applicants"
        description="Review teacher and student applications from your public invite links."
      >
        <div className="w-full max-w-5xl space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Teacher Invite Link</p>
                  <p className="text-xs text-slate-400">Share this with teaching candidates</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-[10px] text-slate-500 font-mono border border-slate-100 mb-3 break-all">
                {tenant ? `${window.location.origin}/apply/${tenant.slug}` : 'Loading...'}
              </div>
              <Button onClick={() => copyLink('teacher')} className="w-full gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-sm font-semibold">
                {copiedLink === 'teacher' ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
              </Button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <GraduationCap className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Student Invite Link</p>
                  <p className="text-xs text-slate-400">Share this with students for approval intake</p>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-[10px] text-slate-500 font-mono border border-slate-100 mb-3 break-all">
                {tenant ? `${window.location.origin}/apply/${tenant.slug}/student` : 'Loading...'}
              </div>
              <Button onClick={() => copyLink('student')} className="w-full gap-2 h-9 bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold">
                {copiedLink === 'student' ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
              </Button>
            </div>
          </div>

          <div className="md:hidden">
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setMobileApplicantsTab('teachers')}
                className={clsx(
                  'rounded-lg px-3 py-2 text-xs font-bold transition',
                  mobileApplicantsTab === 'teachers'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Applied Teachers ({pendingApps.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileApplicantsTab('students')}
                className={clsx(
                  'rounded-lg px-3 py-2 text-xs font-bold transition',
                  mobileApplicantsTab === 'students'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Applied Students ({pendingStudentApps.length})
              </button>
            </div>

            {mobileApplicantsTab === 'teachers' ? teacherApplicantsPanel : studentApplicantsPanel}
          </div>

          <div className="hidden md:grid gap-4 lg:grid-cols-2">
            {teacherApplicantsPanel}
            {studentApplicantsPanel}
          </div>
        </div>

        <Dialog open={!!studentAppToApprove} onOpenChange={(open) => !open && setStudentAppToApprove(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-700">
                <GraduationCap className="h-5 w-5" />
                Approve Student Applicant
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <p className="text-sm text-slate-600">
                  Assign <span className="font-bold text-slate-900">{studentAppToApprove?.name}</span> to a teacher’s class before approval.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Teacher</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => {
                    setSelectedTeacherId(e.target.value)
                    setSelectedClassId('')
                  }}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select a teacher</option>
                  {teachersWithClasses.map(teacher => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Class</label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  disabled={!selectedTeacherId}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">{selectedTeacherId ? 'Select a class' : 'Choose a teacher first'}</option>
                  {classesForSelectedTeacher.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                {selectedTeacherId && classesForSelectedTeacher.length === 0 && (
                  <p className="text-xs text-amber-600">This teacher does not have any classes yet.</p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                onClick={() => {
                  setStudentAppToApprove(null)
                  setSelectedTeacherId('')
                  setSelectedClassId('')
                }}
                className="font-semibold text-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApproveStudent}
                disabled={!selectedClassId || processingId === studentAppToApprove?.id}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {processingId === studentAppToApprove?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve Student'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <UserX className="h-5 w-5" />
                Reject Application
              </DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-slate-600 mb-2">
                Are you sure you want to reject the application from <span className="font-bold text-slate-900">{rejectTarget?.name}</span>?
              </p>
              <p className="text-xs text-slate-400">
                This will mark the {rejectTarget?.type ?? 'applicant'} application as rejected and remove it from pending review.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="ghost"
                onClick={() => setRejectTarget(null)}
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-0">
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

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Teacher Name</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Classes</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Students</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Status</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Invite</th>
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
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleResendInvite(e, t.id)}
                          disabled={!!t.has_password || resendingId === t.id}
                          title={t.has_password ? 'Password already set' : 'Resend invite email'}
                          className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all ${
                            t.has_password
                              ? 'text-slate-300 bg-slate-50 border border-slate-100 cursor-not-allowed'
                              : 'text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100'
                          }`}
                        >
                          {resendingId === t.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Send className="h-3 w-3" />}
                          {t.has_password ? 'Registered' : 'Resend'}
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

      {selected && (
        <ParticipantModal
          item={selected}
          type="teacher"
          onSave={() => { refreshTeacherAdmin(); setModalOpen(false) }}
          open={modalOpen}
          onOpenChange={setModalOpen}
        />
      )}

      <InviteUserModal
        type="teacher"
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        onSuccess={refreshTeacherAdmin}
        tenantId={tenant?.id}
      />
    </DashboardPageLayout>
  )
}
