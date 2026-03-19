import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Phone, ArrowRight, RefreshCw, BookOpen } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

// ── Hardcoded for demo — in production derive from URL/subdomain ─────────────
const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const phoneSchema = z.object({
  phone: z.string().min(7, 'Enter a valid phone number'),
})
type PhoneForm = z.infer<typeof phoneSchema>

type Step = 'phone' | 'otp'

export default function StudentLoginPage() {
  const navigate = useNavigate()
  const { setSession } = useAuthStore()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [devOtp, setDevOtp] = useState<string>()
  const [resendCooldown, setResendCooldown] = useState(0)

  // 6 individual digit inputs
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  const {
    register: regPhone,
    handleSubmit: handlePhone,
    formState: { errors: phoneErrors },
  } = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) })

  // ── Step 1: send OTP ───────────────────────────────────────
  const onSendOtp = async (data: PhoneForm) => {
    setLoading(true)
    try {
      const res = await authApi.sendOtp(data.phone, DEMO_TENANT_ID)
      setPhone(data.phone)
      setDevOtp(res.data.data.dev_otp)
      setStep('otp')
      setResendCooldown(30)
      toast.success('OTP sent!')
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Could not send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP digit input handlers ───────────────────────────────
  const handleDigit = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...digits]
    next[i] = val.slice(-1)
    setDigits(next)
    if (val && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handleDigitKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) inputRefs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────
  const onVerifyOtp = async () => {
    const code = digits.join('')
    if (code.length < 6) {
      toast.error('Enter all 6 digits')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.verifyOtp(phone, code, DEMO_TENANT_ID)
      const { user, access_token, refresh_token } = res.data.data
      setSession(user, access_token, refresh_token)
      toast.success(`Welcome back!`)
      if (user.is_registered) {
        navigate('/student')
      } else {
        navigate('/auth/student-registration')
      }
    } catch (e) {
      setAttempts((a) => a + 1)
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Invalid OTP. Please try again.')
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const resendOtp = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      const res = await authApi.sendOtp(phone, DEMO_TENANT_ID)
      setDevOtp(res.data.data.dev_otp)
      setDigits(['', '', '', '', '', ''])
      setAttempts(0)
      setResendCooldown(30)
      toast.success('New OTP sent')
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
    } finally {
      setLoading(false)
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

        {/* Card */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          {step === 'phone' ? (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Student Login</h1>
              <p className="text-sm text-slate-400 mb-8">Enter your registered phone number</p>

              <form onSubmit={handlePhone(onSendOtp)} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      {...regPhone('phone')}
                      type="tel"
                      placeholder="+971 50 123 4567"
                      className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-500
                                 rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      autoFocus
                    />
                  </div>
                  {phoneErrors.phone && (
                    <p className="mt-2 text-xs text-red-400 font-medium">{phoneErrors.phone.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending OTP…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Send OTP <ArrowRight className="w-5 h-5" />
                    </span>
                  )}
                </button>
              </form>

              <p className="mt-8 text-center text-sm text-slate-400">
                Staff member?{' '}
                <a href="/auth/login" className="text-primary font-medium hover:underline hover:text-primary/80 transition-colors">
                  Login here
                </a>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setDigits(['','','','','','']) }}
                className="text-xs text-slate-400 hover:text-white mb-6 flex items-center gap-1.5 transition-colors font-medium"
              >
                ← Change number
              </button>

              <h1 className="text-2xl font-bold text-white mb-2">Verify OTP</h1>
              <p className="text-sm text-slate-400 mb-6">
                Code sent to <span className="text-white font-medium">{phone}</span>
              </p>

              {/* Dev helper */}
              {devOtp && (
                <div className="mb-8 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-primary/80 font-medium">Dev OTP:</span>
                  <span className="font-mono text-lg font-bold tracking-widest text-primary">{devOtp}</span>
                </div>
              )}

              {/* 6-digit input */}
              <div className="flex justify-between gap-2 mb-8" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKey(i, e)}
                    className="w-12 h-14 text-center text-2xl font-mono font-bold rounded-xl
                               bg-slate-950/50 border border-slate-800 text-white shadow-inner
                               focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary
                               transition-all"
                  />
                ))}
              </div>

              {attempts > 0 && (
                <p className="mb-6 text-sm font-medium text-red-400 text-center bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                  {attempts}/3 attempts used
                </p>
              )}

              <button
                onClick={onVerifyOtp}
                disabled={loading || digits.join('').length < 6}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </span>
                ) : 'Verify & Login'}
              </button>

              <button
                onClick={resendOtp}
                disabled={resendCooldown > 0 || loading}
                className="w-full flex items-center justify-center gap-2 text-sm text-slate-400 font-medium
                           hover:text-white transition-colors disabled:opacity-50 disabled:hover:text-slate-400"
              >
                <RefreshCw className="w-4 h-4" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
