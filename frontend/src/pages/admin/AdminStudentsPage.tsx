// Admin Students Page
import { useEffect, useState } from 'react'
import { Plus, Search, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { Student, ClassItem } from '@/types'

export function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', class_id: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get(`/admin/students?search=${search}&limit=50`),
      api.get('/admin/classes')
    ])
      .then(([s, c]) => { 
        setStudents(s.data.data)
        setClasses(c.data.data)
      })
      .catch(() => toast.error('Could not load data'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleEdit = (s: Student) => {
    setEditingId(s.id)
    setForm({ name: s.name, phone: s.phone, class_id: s.class_id || '' })
    setShowForm(true)
  }

  const deactivate = async (id: string, name: string) => {
    if (!confirm(`Deactivate ${name}?`)) return
    try {
      await api.delete(`/admin/students/${id}`)
      toast.success('Student deactivated')
      load()
    } catch { toast.error('Could not deactivate') }
  }

  const saveStudent = async () => {
    if (!form.name || !form.phone) return toast.error('Name and phone are required')
    setSaving(true)
    try {
      if (editingId) {
        await api.patch(`/admin/students/${editingId}`, form)
        toast.success('Student updated successfully!')
      } else {
        await api.post('/admin/students', form)
        toast.success('Student added successfully!')
      }
      setForm({ name: '', phone: '', class_id: '' })
      setShowForm(false)
      setEditingId(null)
      load()
    } catch (err: any) {
      const msg = err.message || 'Error occurred. Check backend logs.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">Students</h1>
          <p className="text-sm text-ink-muted mt-0.5">{students.length} total</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setEditingId(null); setForm({ name: '', phone: '', class_id: '' }) }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> {showForm && !editingId ? 'Cancel' : 'Add Student'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-5 border-gold/20 animate-fade-in shadow-xl bg-white/50 backdrop-blur-sm">
          <h2 className="font-semibold text-sm text-ink mb-4">{editingId ? 'Edit Student' : 'Add New Student'}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="Abdullah Ahmed" />
            </div>
            <div>
              <label className="label">Phone Number {editingId && <span className="text-[10px] text-gold ml-1">(Updates Account)</span>}</label>
              <input type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} className="input font-mono" placeholder="+1234567890" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Assign Class (Optional)</label>
              <select value={form.class_id} onChange={e => setForm(p => ({...p, class_id: e.target.value}))} className="input">
                <option value="">No class yet…</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={saveStudent} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Saving…' : editingId ? 'Update Student' : 'Add Student'}
            </button>
            {editingId && (
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="btn-secondary">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
        <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()}
          placeholder="Search by name… (press Enter)" className="input pl-10" />
      </div>
      {loading ? <div className="skeleton h-64 rounded-2xl" /> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {students.map(s => (
                <tr key={s.id}>
                  <td className="font-medium cursor-pointer hover:text-gold transition-colors" onClick={() => handleEdit(s)}>{s.name}</td>
                  <td className="font-mono text-sm text-ink-muted">{s.phone}</td>
                  <td>{s.deactivated_at ? <span className="badge badge-red">Inactive</span> : <span className="badge badge-green">Active</span>}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(s)} className="text-gold hover:text-gold/80 p-1">
                        Edit
                      </button>
                      {!s.deactivated_at && (
                        <button onClick={() => deactivate(s.id, s.name)} className="text-red-500 hover:text-red-400 p-1">
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="p-8 text-center text-ink-muted text-sm">
              No students found.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AdminStudentsPage
