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
    <div className="min-h-screen bg-slate-950 auth-pattern flex flex-col items-center justify-center px-4">
      {/* Decorative orb */}
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

        {/* Card */}
        <div className="bg-white/[0.04] backdrop-blur border border-white/10 rounded-2xl p-8">

          {step === 'phone' ? (
            <>
              <h1 className="font-display text-2xl text-white mb-1">Student Login</h1>
              <p className="text-sm text-white/50 mb-8">Enter your registered phone number</p>

              <form onSubmit={handlePhone(onSendOtp)} className="space-y-5">
                <div>
                  <label className="label text-white/60">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                    <input
                      {...regPhone('phone')}
                      type="tel"
                      placeholder="+971 50 123 4567"
                      className="input bg-white/5 border-white/10 text-white placeholder:text-white/25
                                 pl-10 focus:border-gold focus:ring-gold/20"
                      autoFocus
                    />
                  </div>
                  {phoneErrors.phone && (
                    <p className="mt-1.5 text-xs text-red-400">{phoneErrors.phone.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Sending OTP…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Send OTP <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-white/30">
                Staff?{' '}
                <a href="/auth/login" className="text-gold hover:underline">
                  Login here
                </a>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setDigits(['','','','','','']) }}
                className="text-xs text-white/40 hover:text-white/70 mb-5 flex items-center gap-1 transition-colors"
              >
                ← Change number
              </button>

              <h1 className="font-display text-2xl text-white mb-1">Verify OTP</h1>
              <p className="text-sm text-white/50 mb-2">
                Code sent to <span className="text-white/70 font-medium">{phone}</span>
              </p>

              {/* Dev helper */}
              {devOtp && (
                <div className="mb-6 px-3 py-2 bg-gold/10 border border-gold/20 rounded-lg">
                  <p className="text-xs text-gold/80">
                    <span className="font-medium">Dev OTP:</span>{' '}
                    <span className="font-mono tracking-widest text-gold">{devOtp}</span>
                  </p>
                </div>
              )}

              {/* 6-digit input */}
              <div className="flex gap-2.5 mb-6" onPaste={handlePaste}>
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
                    className="w-12 h-14 text-center text-2xl font-mono font-semibold rounded-xl
                               bg-white/5 border border-white/10 text-white
                               focus:outline-none focus:border-gold focus:ring-2 focus:ring-gold/20
                               transition-all"
                  />
                ))}
              </div>

              {attempts > 0 && (
                <p className="mb-4 text-xs text-amber-400">
                  {attempts}/3 attempts used
                </p>
              )}

              <button
                onClick={onVerifyOtp}
                disabled={loading || digits.join('').length < 6}
                className="btn-primary w-full mb-4"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </span>
                ) : 'Verify & Login'}
              </button>

              <button
                onClick={resendOtp}
                disabled={resendCooldown > 0 || loading}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-white/40
                           hover:text-white/70 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
