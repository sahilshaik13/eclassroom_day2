import { useEffect, useState } from 'react'
import { Plus, Video, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { ClassItem, Teacher } from '@/types'

export default function AdminClassesPage() {
  const [classes, setClasses]   = useState<ClassItem[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', teacher_id: '', zoom_link: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/admin/classes'), api.get('/admin/teachers')])
      .then(([c, t]) => { setClasses(c.data.data); setTeachers(t.data.data) })
      .catch(() => toast.error('Could not load data'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const createClass = async () => {
    if (!form.name || !form.teacher_id) return toast.error('Name and teacher required')
    setSaving(true)
    try {
      await api.post('/admin/classes', form)
      toast.success('Class created!')
      setForm({ name: '', teacher_id: '', zoom_link: '' })
      setShowForm(false); load()
    } catch { toast.error('Could not create class') }
    finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">Classes</h1>
          <p className="text-sm text-ink-muted mt-0.5">{classes.length} total</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> New Class
        </button>
      </div>

      {showForm && (
        <div className="card mb-5 border-gold/20 animate-fade-in">
          <h2 className="font-semibold text-sm text-ink mb-4">Create Class</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Class Name</label>
              <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="Juz 30 — Beginner" />
            </div>
            <div>
              <label className="label">Teacher</label>
              <select value={form.teacher_id} onChange={e => setForm(p => ({...p, teacher_id: e.target.value}))} className="input">
                <option value="">Select teacher…</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Zoom Link</label>
              <input value={form.zoom_link} onChange={e => setForm(p => ({...p, zoom_link: e.target.value}))} className="input" placeholder="https://zoom.us/j/…" />
            </div>
          </div>
          <button onClick={createClass} disabled={saving} className="btn-primary mt-4">
            {saving ? 'Creating…' : 'Create Class'}
          </button>
        </div>
      )}

      {loading ? <div className="skeleton h-64 rounded-2xl" /> : (
        <div className="grid gap-4 sm:grid-cols-2 stagger">
          {classes.map(c => (
            <div key={c.id} className="card-hover">
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-semibold text-sm text-ink">{c.name}</h2>
                {c.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Inactive</span>}
              </div>
              <div className="space-y-1.5 text-xs text-ink-muted">
                <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {c.teacher_name} · {c.enrollment_count} students</p>
                {c.zoom_link && <p className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Zoom configured</p>}
              </div>
            </div>
          ))}
          {classes.length === 0 && <p className="text-sm text-ink-muted col-span-2 text-center py-8">No classes yet.</p>}
        </div>
      )}
    </div>
  )
}
