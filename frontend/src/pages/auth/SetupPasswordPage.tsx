import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type PasswordForm = z.infer<typeof passwordSchema>

const decodeJWT = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch { return null }
}

const rules = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
]

export default function SetupPasswordPage() {
  const navigate = useNavigate()
  const { storeTokenOnly } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
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
      const urlEmail = decoded?.email as string | undefined
      localStorage.setItem('temp_invite_token', urlToken)
      if (urlEmail) localStorage.setItem('temp_invite_email', urlEmail)
      setToken(urlToken)
      setEmail(urlEmail ?? null)
    } else {
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

  useEffect(() => {
    if (!token) return
    const check = async () => {
      try {
        const prev = localStorage.getItem('access_token')
        localStorage.setItem('access_token', token)
        const res = await authApi.getUserStatus()
        if (res.data.data.has_password) {
          localStorage.removeItem('temp_invite_token')
          localStorage.removeItem('temp_invite_email')
          localStorage.removeItem('access_token')
          toast.success('Password already set. Please login.')
          navigate('/auth/login', { replace: true })
        }
        if (prev) localStorage.setItem('access_token', prev)
        else localStorage.removeItem('access_token')
      } catch { }
    }
    check()
  }, [token, navigate])

  const { register, handleSubmit, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onSubmit = async (data: PasswordForm) => {
    if (!token) return
    setLoading(true)
    try {
      await authApi.setPassword(data.password, token)
      toast.success('Password set successfully!')
      if (!email) {
        localStorage.removeItem('temp_invite_token')
        localStorage.removeItem('temp_invite_email')
        navigate('/auth/login', { replace: true })
        return
      }
      setLoggingIn(true)
      const res = await authApi.login(email, data.password)
      const { user, access_token, refresh_token, mfa_required, mfa_enrolled } = res.data.data
      if (mfa_required) {
        storeTokenOnly(user, access_token, refresh_token)
        localStorage.removeItem('temp_invite_token')
        localStorage.removeItem('temp_invite_email')
        navigate(mfa_enrolled ? '/auth/mfa-verify' : '/auth/mfa-setup')
        return
      }
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

  const isLoading = loading || loggingIn

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-violet-900/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-500">

        {/* Logo */}
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

        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          {/* Icon + Title */}
          <div className="flex items-center gap-4 mb-6">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <KeyRound className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Set Your Password</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {email ? email : 'Create a secure password for your account'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Password field */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  onChange={e => setPwValue(e.target.value)}
                  placeholder="Min. 8 characters"
                  disabled={isLoading}
                  className="w-full bg-slate-950/60 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
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

            {/* Password strength indicators */}
            {pwValue.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {rules.map(rule => (
                  <div
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-[10px] font-semibold transition-colors ${rule.test(pwValue) ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                  >
                    <CheckCircle2 className={`w-3 h-3 shrink-0 ${rule.test(pwValue) ? 'text-emerald-400' : 'text-slate-700'}`} />
                    {rule.label}
                  </div>
                ))}
              </div>
            )}

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  {...register('confirmPassword')}
                  type={showCf ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  disabled={isLoading}
                  className="w-full bg-slate-950/60 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all"
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

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !token}
              className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {loggingIn ? 'Logging you in…' : 'Setting password…'}
                </>
              ) : (
                <>
                  Activate Account
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security note */}
          <div className="mt-5 flex items-start gap-2.5 p-3 bg-white/[0.03] rounded-xl border border-white/5">
            <ShieldCheck className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Your password is encrypted and never stored in plain text. You'll be redirected to login after activation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}