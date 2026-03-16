import { useState } from 'react'
import { User, Phone, Shield, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export default function StudentProfilePage() {
  const { user, setSession, accessToken, refreshToken } = useAuthStore()
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm({
    defaultValues: { name: user?.name ?? '' },
  })

  const onSubmit = async (data: { name: string }) => {
    setSaving(true)
    try {
      await api.patch('/classroom/profile', data)
      if (user && accessToken && refreshToken) {
        setSession({ ...user, name: data.name }, accessToken, refreshToken)
      }
      toast.success('Profile updated!')
    } catch {
      toast.error('Could not save profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Profile</h1>
        <p className="text-sm text-ink-muted mt-0.5">Your account information</p>
      </div>

      {/* Avatar */}
      <div className="card mb-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
          <span className="text-2xl font-bold text-gold">
            {user?.name.charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="font-display font-semibold text-ink">{user?.name}</p>
          <span className="badge badge-gold capitalize text-xs mt-1">{user?.role}</span>
        </div>
      </div>

      {/* Edit form */}
      <div className="card mb-5">
        <h2 className="font-semibold text-sm text-ink mb-4">Edit Details</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                {...register('name', { required: 'Name is required' })}
                className="input pl-10"
                placeholder="Your name"
              />
            </div>
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>
          <button type="submit" disabled={saving || !isDirty} className="btn-primary w-full">
            {saving ? 'Saving…' : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </form>
      </div>

      {/* Read-only info */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-sm text-ink mb-2">Account Info</h2>
        <div className="flex items-center gap-3 text-sm">
          <Phone className="w-4 h-4 text-ink-faint shrink-0" />
          <span className="text-ink-muted">{user?.phone ?? 'No phone on file'}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Shield className="w-4 h-4 text-ink-faint shrink-0" />
          <span className="text-ink-muted capitalize">{user?.role} account</span>
        </div>
      </div>
    </div>
  )
}
