import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, Copy, Check, BookOpen } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'
import type { MFAEnrollResponse } from '@/types'

type Step = 'loading' | 'scan' | 'verify' | 'done'

export default function MFASetupPage() {
  const navigate = useNavigate()
  const { setSession, user } = useAuthStore()
  const [step, setStep] = useState<Step>('loading')
  const [enrollData, setEnrollData] = useState<MFAEnrollResponse | null>(null)
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // Wait for Zustand to flush token to localStorage before calling enroll
    const timer = setTimeout(() => {
      // Read token directly here to confirm it exists before calling
      const raw = localStorage.getItem('eclassroom-auth')
      const token = raw ? JSON.parse(raw)?.state?.accessToken : null

      if (!token) {
        toast.error('Session expired — please log in again')
        navigate('/auth/login')
        return
      }

      authApi.mfaEnroll()
        .then((res) => {
          setEnrollData(res.data.data)
          setStep('scan')
        })
        .catch((e) => {
          if (e instanceof ApiClientError) toast.error(e.message)
          else toast.error('Could not start MFA setup — please log in again')
          navigate('/auth/login')
        })
    }, 500)

    return () => clearTimeout(timer)
  }, [navigate])

  const copySecret = () => {
    if (!enrollData) return
    navigator.clipboard.writeText(enrollData.secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  const verifyCode = async () => {
    if (!enrollData) return
    const code = digits.join('')
    if (code.length < 6) return toast.error('Enter all 6 digits')
    setLoading(true)
    try {
      const res = await authApi.mfaVerify(enrollData.factor_id, code)
      const { access_token } = res.data.data
      // Now fully authenticate — user has completed MFA
      const refreshToken = localStorage.getItem('refresh_token') ?? ''
      setSession(user!, access_token, refreshToken)
      setStep('done')
      setTimeout(() => {
        toast.success("MFA enabled — you're in!")
        navigate('/admin')
      }, 1200)
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Invalid code. Try again.')
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 auth-pattern flex flex-col items-center justify-center px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative animate-fade-up">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-gold" />
          </div>
          <span className="font-display text-xl text-white font-semibold tracking-tight">
            ThinkTarteeb
          </span>
        </div>

        <div className="bg-white/[0.04] backdrop-blur border border-white/10 rounded-2xl p-8">

          {step === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              <p className="text-sm text-white/50">Setting up MFA…</p>
            </div>
          )}

          {step === 'scan' && enrollData && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <h1 className="font-display text-xl text-white leading-tight">Two-Factor Auth</h1>
                  <p className="text-xs text-white/40">Required for admin access</p>
                </div>
              </div>

              <p className="text-sm text-white/60 mb-5">
                Scan this QR code with{' '}
                <strong className="text-white/80">Google Authenticator</strong> or any TOTP app:
              </p>

              <div className="flex justify-center mb-5">
                <div className="p-3 bg-white rounded-xl">
                  <img src={enrollData.qr_code} alt="TOTP QR code" className="w-44 h-44" />
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-white/40 mb-2">Can't scan? Enter this key manually:</p>
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg">
                  <code className="flex-1 text-xs font-mono text-gold/80 break-all">
                    {enrollData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="mb-6 px-3 py-2.5 bg-gold/8 border border-gold/20 rounded-lg">
                <p className="text-xs text-gold/80">
                  <strong>Multiple phones?</strong> Scan the QR or enter the key on each
                  device before continuing — all devices will generate the same codes.
                </p>
              </div>

              <button
                onClick={() => {
                  setStep('verify')
                  setTimeout(() => inputRefs.current[0]?.focus(), 100)
                }}
                className="btn-primary w-full"
              >
                I've scanned it — Continue
              </button>
            </>
          )}

          {step === 'verify' && (
            <>
              <h1 className="font-display text-2xl text-white mb-1">Enter Code</h1>
              <p className="text-sm text-white/50 mb-7">
                Enter the 6-digit code from your authenticator app
              </p>

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

              <button
                onClick={verifyCode}
                disabled={loading || digits.join('').length < 6}
                className="btn-primary w-full mb-4"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </span>
                ) : 'Verify & Enable MFA'}
              </button>

              <button
                onClick={() => setStep('scan')}
                className="w-full text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                ← Back to QR code
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="font-display text-xl text-white">MFA Enabled</h2>
              <p className="text-sm text-white/50">Redirecting to admin portal…</p>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-white/25">
          Admin account: {user?.email}
        </p>
      </div>
    </div>
  )
}