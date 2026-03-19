import { useEffect, useState } from 'react'
import { Plus, Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Teacher } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { ParticipantsTable } from '@/components/admin/ParticipantsTable'
import { Button } from '@/components/ui/button'

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.get('/admin/teachers')
      .then(r => setTeachers(r.data.data))
      .catch(() => toast.error('Could not load teachers'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const actions = (
    <>
      <Button variant="outline" size="sm" className="hidden md:flex gap-2">
        <Download className="h-4 w-4" /> Export CSV
      </Button>
      <Button variant="outline" size="sm" className="hidden md:flex gap-2">
        <FileText className="h-4 w-4" /> Export PDF
      </Button>
      <Button className="gap-2">
        <Plus className="h-4 w-4" /> Invite Teacher
      </Button>
    </>
  )

  return (
    <DashboardPageLayout
      title="Teacher Management"
      description={`Manage and monitor ${teachers.length} registered teachers.`}
      actions={actions}
    >
      {loading ? (
        <div className="grid gap-4">
          <div className="h-10 w-full bg-slate-100 animate-pulse rounded-lg" />
          <div className="h-64 w-full bg-slate-50 animate-pulse rounded-xl border border-slate-100" />
        </div>
      ) : (
        <ParticipantsTable 
          data={teachers} 
          type="teacher" 
          onRefresh={load} 
        />
      )}
    </DashboardPageLayout>
  )
}
