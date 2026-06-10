import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, KeyRound, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'At least one uppercase letter')
    .regex(/[0-9]/, 'At least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type PasswordForm = z.infer<typeof passwordSchema>

const decodeJWT = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch {
    return null
  }
}

const isTokenExpired = (decoded: Record<string, unknown> | null): boolean => {
  const exp = decoded?.exp
  if (typeof exp !== 'number') return false
  return Date.now() / 1000 > exp
}

const RULES = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
]

const Logo = () => (
  <div className="flex items-center justify-center gap-3 mb-8">
    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
      <div className="grid grid-cols-2 gap-0.5 p-1.5">
        <div className="w-2 h-2 bg-[#4E7DFF] rounded-sm" />
        <div className="w-2 h-2 bg-[#20C997] rounded-sm" />
        <div className="w-2 h-2 bg-[#FF922B] rounded-sm" />
        <div className="w-2 h-2 bg-[#A855F7] rounded-sm" />
      </div>
    </div>
    <span className="text-xl text-white font-bold tracking-tight">ThinkTarteeb</span>
  </div>
)

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const { setSession } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showCf, setShowCf] = useState(false)
  const [pwValue, setPwValue] = useState('')

  useEffect(() => {
    const hashData = new URLSearchParams(window.location.hash.substring(1))
    const searchData = new URLSearchParams(window.location.search.substring(1))
    const urlToken =
      hashData.get('access_token') ||
      searchData.get('access_token') ||
      searchData.get('token')

    if (urlToken) {
      const decoded = decodeJWT(urlToken)
      if (isTokenExpired(decoded)) {
        setExpired(true)
        return
      }
      const urlEmail = (decoded?.email as string | undefined) ?? undefined
      localStorage.setItem('temp_reset_token', urlToken)
      if (urlEmail) localStorage.setItem('temp_reset_email', urlEmail)
      setToken(urlToken)
      setEmail(urlEmail ?? null)
      window.history.replaceState(null, '', window.location.pathname)
      return
    }

    const t = localStorage.getItem('temp_reset_token')
    const e = localStorage.getItem('temp_reset_email')
    if (!t) {
      toast.error('Invalid or expired reset link')
      navigate('/auth/forgot-password', { replace: true })
      return
    }
    const decoded = decodeJWT(t)
    if (isTokenExpired(decoded)) {
      setExpired(true)
      return
    }
    setToken(t)
    setEmail(e)
  }, [navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = async (data: PasswordForm) => {
    if (!token) return
    setLoading(true)
    try {
      await authApi.setPassword(data.password, token)
      toast.success('Password updated successfully!')

      if (!email) {
        localStorage.removeItem('temp_reset_token')
        localStorage.removeItem('temp_reset_email')
        navigate('/auth/login', { replace: true })
        return
      }

      setLoggingIn(true)
      const res = await authApi.login(email, data.password)
      const { user, access_token, refresh_token } = res.data.data

      localStorage.removeItem('temp_reset_token')
      localStorage.removeItem('temp_reset_email')

      setSession(user, access_token, refresh_token)
      toast.success(`Welcome back, ${user.name}!`)

      if (user.role === 'super_admin') {
        navigate('/super-admin', { replace: true })
      } else if (user.role === 'teacher') {
        navigate(user.is_registered ? '/teacher' : '/auth/teacher-registration', { replace: true })
      } else {
        navigate('/admin', { replace: true })
      }
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Failed to reset password. Try again or request a new link.')
    } finally {
      setLoading(false)
      setLoggingIn(false)
    }
  }

  const isLoading = loading || loggingIn

  if (expired) {
    return (
      <div className="auth-bg">
        <div className="auth-bg-gradient" />
        <div className="w-full max-w-sm relative z-10 p-8 text-center">
          <Logo />
          <div className="auth-card p-8">
            <h2 className="text-xl font-bold text-white mb-2">Link expired</h2>
            <p className="text-sm text-slate-400 mb-6">
              This password reset link has expired. Request a new one.
            </p>
            <Link to="/auth/forgot-password" className="btn-primary w-full inline-flex justify-center">
              Request new link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-bg">
      <div className="auth-bg-gradient" />
      <div className="auth-glow-top" />
      <div className="auth-glow-bottom" />

      <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <Logo />

        <div className="auth-card p-8">
          <div className="auth-accent-line" />

          <div className="flex items-center gap-4 mb-7">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Reset your password</h1>
              <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">
                {email ?? 'Choose a new secure password'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label-dark">
                New password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  onChange={(e) => setPwValue(e.target.value)}
                  placeholder="Min. 8 characters"
                  disabled={isLoading}
                  className="input-dark pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password.message}</p>
              )}
            </div>

            {pwValue.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {RULES.map((rule) => (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${
                      rule.test(pwValue) ? 'text-emerald-400' : 'text-slate-600'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3 h-3 shrink-0 ${
                        rule.test(pwValue) ? 'text-emerald-400' : 'text-slate-700'
                      }`}
                    />
                    {rule.label}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="label-dark">
                Confirm password <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  {...register('confirmPassword')}
                  type={showCf ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  disabled={isLoading}
                  className="input-dark pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowCf(!showCf)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword.message}</p>
              )}
            </div>

            <button type="submit" disabled={isLoading || !token} className="btn-primary w-full mt-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loggingIn ? 'Signing you in…' : 'Updating password…'}
                </>
              ) : (
                <>
                  Update password
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 flex items-start gap-2.5 p-3 bg-white/[0.03] rounded-xl border border-white/5">
            <ShieldCheck className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              After updating, you&apos;ll be signed in automatically when possible.
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            <Link to="/auth/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
