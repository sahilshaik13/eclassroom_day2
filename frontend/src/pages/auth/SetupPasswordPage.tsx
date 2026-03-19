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

// Decode JWT payload without verification (for email extraction only)
const decodeJWT = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decoded = JSON.parse(atob(parts[1]))
    return decoded
  } catch {
    return null
  }
}

export default function SetupPasswordPage() {
  const navigate = useNavigate()
  const { storeTokenOnly } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    // 1) Prefer token from Supabase invite redirect (hash or query)
    const hashData = new URLSearchParams(window.location.hash.substring(1))
    const searchData = new URLSearchParams(window.location.search.substring(1))

    const urlToken =
      hashData.get('access_token') ||
      searchData.get('access_token') ||
      searchData.get('token')

    if (urlToken) {
      const decoded = decodeJWT(urlToken)
      const urlEmail = decoded?.email as string | undefined

      localStorage.setItem('temp_invite_token', urlToken)
      if (urlEmail) {
        localStorage.setItem('temp_invite_email', urlEmail)
      }

      setToken(urlToken)
      setEmail(urlEmail ?? null)
    } else {
      // 2) Fallback to previously stored temp invite data
      const t = localStorage.getItem('temp_invite_token')
      const e = localStorage.getItem('temp_invite_email')
      if (!t) {
        toast.error('Invalid or expired invitation link')
        navigate('/auth/login', { replace: true })
        return
      }
      setToken(t)
      setEmail(e)
    }
  }, [navigate])

  // Once we have a token, check if this user already has a password.
  useEffect(() => {
    const checkStatus = async () => {
      if (!token) return
      try {
        // Temporarily set access_token so authApi.getUserStatus uses it
        const prev = localStorage.getItem('access_token')
        localStorage.setItem('access_token', token)
        const statusRes = await authApi.getUserStatus()
        const { has_password } = statusRes.data.data

        if (has_password) {
          localStorage.removeItem('temp_invite_token')
          localStorage.removeItem('temp_invite_email')
          localStorage.removeItem('access_token')
          toast.success('Password already set. Please login.')
          navigate('/auth/login', { replace: true })
        }

        // Restore previous access token if any
        if (prev) {
          localStorage.setItem('access_token', prev)
        } else {
          localStorage.removeItem('access_token')
        }
      } catch (err) {
        // On failure, stay on this page and allow password setup attempt.
        const prev = localStorage.getItem('access_token')
        if (!prev) {
          localStorage.removeItem('access_token')
        }
      }
    }

    checkStatus()
  }, [token, navigate])

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
    } catch (err: any) {
      console.error('SetPassword/Login Error:', err)
      if (err instanceof ApiClientError) {
        toast.error(`${err.code}: ${err.message}`)
      } else if (err.response?.data?.error?.message) {
        toast.error(err.response.data.error.message)
      } else {
        toast.error('Failed to set password. Try again.')
      }
    } finally {
      setLoading(false)
      setLoggingIn(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background glow and patterns */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-700">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-primary/50">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display text-2xl text-white font-bold tracking-tight">
            ThinkTarteeb
          </span>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <h1 className="font-display text-2xl text-white font-bold mb-2">Set Password</h1>
          <p className="text-sm text-slate-400 mb-8">Welcome! Set a password for your account to get started.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
              <input
                {...register('password')}
                type="password"
                className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="••••••"
                disabled={loading || loggingIn}
              />
              {errors.password && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.password.message}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
              <input
                {...register('confirmPassword')}
                type="password"
                className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                placeholder="••••••"
                disabled={loading || loggingIn}
              />
              {errors.confirmPassword && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={loading || loggingIn || !token} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center mt-6 disabled:opacity-50 disabled:cursor-not-allowed">
              {loading || loggingIn ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {loggingIn ? 'Logging you in...' : 'Setting password...'}
                </span>
              ) : (
                <span className="flex items-center gap-2">Set Password <ArrowRight className="w-5 h-5"/></span>
              )}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            You will be redirected to complete your profile after setting your password.
          </p>
        </div>
      </div>
    </div>
  )
}
