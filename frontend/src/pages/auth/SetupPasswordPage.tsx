import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { BookOpen, ArrowRight } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'

const passwordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

type PasswordForm = z.infer<typeof passwordSchema>

export default function SetupPasswordPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('temp_invite_token')
    if (!t) {
      toast.error('Invalid or expired invitation link')
      navigate('/auth/login', { replace: true })
    } else {
      setToken(t)
    }
  }, [navigate])

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema)
  })

  const onSubmit = async (data: PasswordForm) => {
    if (!token) return
    setLoading(true)
    try {
      await authApi.setPassword(data.password, token)
      toast.success('Password set successfully! Please login.')
      localStorage.removeItem('temp_invite_token')
      navigate('/auth/login', { replace: true })
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Failed to set password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 auth-pattern flex flex-col items-center justify-center px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
      <div className="w-full max-w-sm relative animate-fade-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-gold" />
          </div>
          <span className="font-display text-xl text-white font-semibold tracking-tight">
            ThinkTarteeb
          </span>
        </div>

        <div className="bg-white/[0.04] backdrop-blur border border-white/10 rounded-2xl p-8">
          <h1 className="font-display text-2xl text-white mb-1">Set Password</h1>
          <p className="text-sm text-white/50 mb-8">Welcome! Set a password for your account.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label text-white/60">New Password</label>
              <input
                {...register('password')}
                type="password"
                className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5"
                placeholder="••••••"
              />
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>}
            </div>
            
            <div>
              <label className="label text-white/60">Confirm Password</label>
              <input
                {...register('confirmPassword')}
                type="password"
                className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5"
                placeholder="••••••"
              />
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={loading || !token} className="btn-primary w-full mt-4">
              {loading ? 'Setting password...' : (
                <span className="flex items-center gap-2">Set Password <ArrowRight className="w-4 h-4"/></span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
