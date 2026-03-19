import { useEffect, useState } from 'react'
import { Plus, Download, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Student } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { ParticipantsTable } from '@/components/admin/ParticipantsTable'
import { Button } from '@/components/ui/button'
import { InviteUserModal } from '@/components/admin/InviteUserModal'

export function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/admin/students?limit=100')
      .then(r => setStudents(r.data.data))
      .catch(() => toast.error('Could not load students'))
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
      <Button className="gap-2" onClick={() => setAddOpen(true)}>
        <Plus className="h-4 w-4" /> Add Student
      </Button>
    </>
  )

  return (
    <DashboardPageLayout
      title="Student Management"
      description={`Manage and verify ${students.length} registered students.`}
      actions={actions}
    >
      {loading ? (
        <div className="grid gap-4">
          <div className="h-10 w-full bg-slate-100 animate-pulse rounded-lg" />
          <div className="h-64 w-full bg-slate-50 animate-pulse rounded-xl border border-slate-100" />
        </div>
      ) : (
        <ParticipantsTable 
          data={students} 
          type="student" 
          onRefresh={load} 
        />
      )}
      <InviteUserModal 
        type="student" 
        open={addOpen} 
        onOpenChange={setAddOpen} 
        onSuccess={load} 
      />
    </DashboardPageLayout>
  )
}

export default AdminStudentsPage
