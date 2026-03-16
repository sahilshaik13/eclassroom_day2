import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'

interface Student { id: string; name: string; class_id: string }

export default function TeacherStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/teacher/students')
      .then(r => setStudents(r.data.data))
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) return (
    <div className="p-6 space-y-2 max-w-3xl mx-auto">
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded-xl" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Students</h1>
        <p className="text-sm text-ink-muted mt-0.5">{students.length} enrolled</p>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" className="input pl-10" />
      </div>
      <div className="card divide-y divide-border">
        {filtered.map(s => (
          <div key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-gold">{s.name.charAt(0)}</span>
            </div>
            <span className="text-sm font-medium text-ink">{s.name}</span>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-ink-muted text-center py-8">No students found.</p>}
      </div>
    </div>
  )
}
