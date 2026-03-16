// Admin Students Page
import { useEffect, useState } from 'react'
import { Plus, Search, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Student } from '@/types'

export function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.get(`/admin/students?search=${search}&limit=50`)
      .then(r => setStudents(r.data.data))
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const deactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return
    try {
      await api.delete(`/admin/students/${id}`)
      toast.success('Student deactivated')
      load()
    } catch { toast.error('Could not deactivate') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">Students</h1>
          <p className="text-sm text-ink-muted mt-0.5">{students.length} total</p>
        </div>
        <a href="#add" className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Student</a>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search by name… (press Enter)" className="input pl-10" />
      </div>
      {loading ? <div className="skeleton h-64 rounded-2xl" /> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="font-mono text-sm text-ink-muted">{s.phone}</td>
                  <td>{s.deactivated_at ? <span className="badge badge-red">Inactive</span> : <span className="badge badge-green">Active</span>}</td>
                  <td>
                    {!s.deactivated_at && (
                      <button onClick={() => deactivate(s.id, s.name)} className="btn-ghost text-red-500 text-xs p-1.5">
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminStudentsPage
