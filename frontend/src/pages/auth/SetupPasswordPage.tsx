import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Lock, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'
import {
  AuthPageLayout,
  authBtnPrimaryClass,
  authInputRoundClass,
  authLabelClass,
} from '@/components/auth/AuthPageLayout'

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

const RULES = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'One number', test: (v: string) => /[0-9]/.test(v) },
]

export default function SetupPasswordPage() {
  const navigate = useNavigate()
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
      } catch {
        /* ignore */
      }
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
    <AuthPageLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Set your password</h1>
      <p className="text-sm text-gray-500 mb-8 truncate">
        {email ?? 'Create a secure password to activate your account'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className={authLabelClass}>
            New password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              {...register('password')}
              type={showPw ? 'text' : 'password'}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="Min. 8 characters"
              disabled={isLoading}
              className={`${authInputRoundClass} pl-11 pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.password.message}</p>
          )}
        </div>

        {pwValue.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {RULES.map((rule) => (
              <div
                key={rule.label}
                className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors ${
                  rule.test(pwValue) ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                {rule.label}
              </div>
            ))}
          </div>
        )}

        <div>
          <label className={authLabelClass}>
            Confirm password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              {...register('confirmPassword')}
              type={showCf ? 'text' : 'password'}
              placeholder="Repeat your password"
              disabled={isLoading}
              className={`${authInputRoundClass} pl-11 pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowCf(!showCf)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button type="submit" disabled={isLoading || !token} className={authBtnPrimaryClass}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {loggingIn ? 'Logging you in…' : 'Setting password…'}
            </>
          ) : (
            <>
              Activate account
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2.5 p-3 bg-gray-50 rounded-xl border border-gray-100">
        <ShieldCheck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
        <p className="text-xs text-gray-500 leading-relaxed">
          Your password is encrypted end-to-end. You&apos;ll be redirected to login after activation.
        </p>
      </div>
    </AuthPageLayout>
  )
}
