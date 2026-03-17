import { useEffect, useState } from 'react'
import { Plus, X, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import api from '@/services/api'
import type { Teacher } from '@/types'

const schema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(2, 'Name required'),
})
type Form = z.infer<typeof schema>

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [inviting, setInviting]  = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  const load = () => {
    setLoading(true)
    api.get('/admin/teachers')
      .then(r => setTeachers(r.data.data))
      .catch(() => toast.error('Could not load teachers'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleEdit = (t: Teacher) => {
    setEditingId(t.id)
    setValue('name', t.name)
    setValue('email', t.email)
    setShowModal(true)
  }

  const handleSave = async (data: Form) => {
    setInviting(true)
    try {
      if (editingId) {
        await api.patch(`/admin/teachers/${editingId}`, data)
        toast.success('Teacher updated successfully')
      } else {
        await api.post('/admin/teachers', data)
        toast.success(`Invite sent to ${data.email}`)
      }
      reset(); setShowModal(false); setEditingId(null); load()
    } catch { toast.error(editingId ? 'Could not update' : 'Could not send invite') }
    finally { setInviting(false) }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl text-ink">Teachers</h1>
          <p className="text-sm text-ink-muted mt-0.5">{teachers.length} total</p>
        </div>
        <button onClick={() => { setEditingId(null); reset(); setShowModal(true) }} className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Invite Teacher
        </button>
      </div>

      {loading ? <div className="skeleton h-48 rounded-2xl" /> : (
        <div className="table-wrapper">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {teachers.map(t => (
                <tr key={t.id}>
                  <td className="font-medium cursor-pointer hover:text-gold transition-colors" onClick={() => handleEdit(t)}>{t.name}</td>
                  <td className="text-ink-muted text-sm">{t.email}</td>
                  <td>{t.deactivated_at ? <span className="badge badge-red">Inactive</span> : <span className="badge badge-green">Active</span>}</td>
                  <td>
                    <button onClick={() => handleEdit(t)} className="text-gold hover:text-gold/80 p-1 text-xs">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {teachers.length === 0 && (
                <tr><td colSpan={4} className="text-center text-ink-muted py-8">No teachers yet. Invite one!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl animate-fade-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg text-ink">{editingId ? 'Edit Teacher' : 'Invite Teacher'}</h2>
              <button onClick={() => setShowModal(false)} className="text-ink-faint hover:text-ink"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input {...register('name')} className="input" placeholder="Ustazah Fatima" autoFocus />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label">Email Address {editingId && <span className="text-[10px] text-gold ml-1">(Updates Account)</span>}</label>
                <input {...register('email')} type="email" className="input" placeholder="teacher@example.com" />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
              </div>
              {!editingId && <p className="text-xs text-ink-muted">An invite email will be sent with a link to set their password.</p>}
              <button type="submit" disabled={inviting} className="btn-primary w-full">
                {inviting ? 'Saving…' : <><Send className="w-4 h-4" /> {editingId ? 'Update Teacher' : 'Send Invite'}</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
