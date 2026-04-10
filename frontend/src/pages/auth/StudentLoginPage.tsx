import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Phone, ArrowRight, RefreshCw } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

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
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  const { register: regPhone, handleSubmit: handlePhone, formState: { errors: phoneErrors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema)
  })

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

  const handleDigit = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return
    const next = [...digits]
    next[i] = val.slice(-1)
    setDigits(next)
    if (val && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handleDigitKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputRefs.current[i - 1]?.focus()
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

  const onVerifyOtp = async () => {
    const code = digits.join('')
    if (code.length < 6) { toast.error('Enter all 6 digits'); return }
    setLoading(true)
    try {
      const res = await authApi.verifyOtp(phone, code, DEMO_TENANT_ID)
      const { user, access_token, refresh_token } = res.data.data

      // No MFA for students — proceed directly to session
      setSession(user, access_token, refresh_token)
      toast.success('Welcome back!')
      navigate(user.is_registered ? '/student' : '/auth/student-registration')
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
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <img
            src="/logo.png"
            alt="ThinkTarteeb"
            className="h-16 w-auto"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

          {step === 'phone' ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Student Login</h1>
              <p className="text-sm text-gray-500 mb-8">Enter your registered phone number</p>

              <form onSubmit={handlePhone(onSendOtp)} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      {...regPhone('phone')}
                      type="tel"
                      placeholder="+971 50 123 4567"
                      autoFocus
                      className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    />
                  </div>
                  {phoneErrors.phone && <p className="mt-1.5 text-xs text-red-500 font-medium">{phoneErrors.phone.message}</p>}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Sending OTP…</>
                    ) : (
                      <>Send OTP <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </form>

              <p className="mt-8 text-center text-sm text-gray-500">
                Staff member?{' '}
                <a href="/auth/login" className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
                  Login here
                </a>
              </p>
            </>
          ) : (
            <>
              <button
                onClick={() => { setStep('phone'); setDigits(['', '', '', '', '', '']) }}
                className="text-xs text-gray-400 hover:text-gray-700 mb-6 flex items-center gap-1.5 transition-colors font-medium"
              >
                ← Change number
              </button>

              <h1 className="text-2xl font-bold text-gray-900 mb-1">Verify OTP</h1>
              <p className="text-sm text-gray-500 mb-6">
                Code sent to <span className="text-gray-800 font-semibold">{phone}</span>
              </p>

              {devOtp && (
                <div className="mb-6 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-indigo-500 font-medium">Dev OTP:</span>
                  <span className="font-mono text-lg font-bold tracking-widest text-indigo-600">{devOtp}</span>
                </div>
              )}

              {/* 6-digit input */}
              <div className="flex justify-between gap-2 mb-6" onPaste={handlePaste}>
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
                    className="w-12 h-14 text-center text-xl font-bold rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                ))}
              </div>

              {attempts > 0 && (
                <p className="mb-4 text-sm font-medium text-red-500 text-center bg-red-50 py-2 rounded-lg border border-red-100">
                  {attempts}/3 attempts used
                </p>
              )}

              <button
                onClick={onVerifyOtp}
                disabled={loading || digits.join('').length < 6}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 mb-4 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Verifying…</>
                ) : 'Verify & Login'}
              </button>

              <button
                onClick={resendOtp}
                disabled={resendCooldown > 0 || loading}
                className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 font-medium hover:text-gray-700 transition-colors disabled:opacity-50 disabled:hover:text-gray-400"
              >
                <RefreshCw className="w-4 h-4" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          ← <a href="/" className="hover:text-gray-600 transition-colors">Back to Home</a>
        </p>
      </div>
    </div>
  )
}
