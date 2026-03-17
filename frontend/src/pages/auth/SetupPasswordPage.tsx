import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { BookOpen, ArrowRight, Loader2 } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
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
  const { storeTokenOnly } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('temp_invite_token')
    const e = localStorage.getItem('temp_invite_email')
    if (!t) {
      toast.error('Invalid or expired invitation link')
      navigate('/auth/login', { replace: true })
    } else {
      setToken(t)
      setEmail(e)
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
      // Step 1: Set password using invite token
      await authApi.setPassword(data.password, token)
      toast.success('Password set successfully!')

      // Step 2: Auto-login with email and password
      if (!email) {
        console.warn('Email not available, redirecting to login')
        localStorage.removeItem('temp_invite_token')
        localStorage.removeItem('temp_invite_email')
        navigate('/auth/login', { replace: true })
        return
      }

      setLoggingIn(true)
      const res = await authApi.login(email, data.password)
      const { user, access_token, refresh_token, mfa_required, mfa_enrolled } = res.data.data

      if (mfa_required) {
        // Store session for MFA but keep as unauthenticated
        storeTokenOnly(user, access_token, refresh_token)
        localStorage.removeItem('temp_invite_token')
        localStorage.removeItem('temp_invite_email')
        navigate(mfa_enrolled ? '/auth/mfa-verify' : '/auth/mfa-setup')
        return
      }

      // Redirect to login page as requested
      localStorage.removeItem('temp_invite_token')
      localStorage.removeItem('temp_invite_email')
      localStorage.removeItem('access_token')
      navigate('/auth/login', { replace: true })
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Failed to set password. Try again.')
    } finally {
      setLoading(false)
      setLoggingIn(false)
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
          <p className="text-sm text-white/50 mb-8">Welcome! Set a password for your account to get started.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label text-white/60">New Password</label>
              <input
                {...register('password')}
                type="password"
                className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5"
                placeholder="••••••"
                disabled={loading || loggingIn}
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
                disabled={loading || loggingIn}
              />
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={loading || loggingIn || !token} className="btn-primary w-full mt-4">
              {loading || loggingIn ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loggingIn ? 'Logging you in...' : 'Setting password...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">Set Password <ArrowRight className="w-4 h-4"/></span>
              )}
            </button>
          </form>

          <p className="text-xs text-white/40 text-center mt-6">
            You will be redirected to complete your profile after setting your password.
          </p>
        </div>
      </div>
    </div>
  )
}
