import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, Copy, Check, Smartphone, ArrowRight, Loader2 } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'
import type { MFAEnrollResponse } from '@/types'

type Step = 'loading' | 'scan' | 'verify' | 'done'

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
    const timer = setTimeout(() => {
      const raw = localStorage.getItem('eclassroom-auth')
      const token = raw ? JSON.parse(raw)?.state?.accessToken : null
      if (!token) {
        toast.error('Session expired — please log in again')
        navigate('/auth/login')
        return
      }
      authApi.mfaEnroll(token)
        .then(res => { setEnrollData(res.data.data); setStep('scan') })
        .catch(e => {
          if (e instanceof ApiClientError) toast.error(e.message)
          else toast.error('Could not start MFA setup')
          navigate('/auth/login')
        })
    }, 500)
    return () => clearTimeout(timer)
  }, [navigate])

  const copySecret = () => {
    if (!enrollData) return
    navigator.clipboard.writeText(enrollData.secret)
    setCopied(true)
    toast.success('Key copied!')
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

    // Retrieve token for explicit passing
    const raw = localStorage.getItem('eclassroom-auth')
    const token = raw ? JSON.parse(raw)?.state?.accessToken : null

    try {
      const res = await authApi.mfaVerify(enrollData.factor_id, code, token)
      const { access_token } = res.data.data
      const refreshToken = localStorage.getItem('refresh_token') ?? ''
      setSession(user!, access_token, refreshToken)
      setStep('done')
      setTimeout(() => {
        toast.success("MFA enabled — you're protected!")
        if (user?.role === 'admin') {
          navigate('/admin')
        } else {
          navigate('/teacher')
        }
      }, 1400)
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
    <div className="auth-bg">
      <div className="auth-bg-gradient" />
      <div className="auth-glow-top" />
      <div className="auth-glow-bottom" />

      <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <Logo />

        {/* Step indicators */}
        {(step === 'scan' || step === 'verify') && (
          <div className="flex items-center justify-center gap-2 mb-6">
            {['Scan QR', 'Verify Code'].map((label, i) => {
              const active = (i === 0 && step === 'scan') || (i === 1 && step === 'verify')
              const done = i === 0 && step === 'verify'
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-600'
                    }`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${active ? 'bg-primary border-primary text-white' :
                        done ? 'bg-emerald-500 border-emerald-500 text-white' :
                          'bg-slate-800 border-slate-700 text-slate-600'
                      }`}>
                      {done ? <Check className="w-3 h-3" /> : i + 1}
                    </div>
                    {label}
                  </div>
                  {i < 1 && <div className="w-8 h-px bg-slate-800" />}
                </div>
              )
            })}
          </div>
        )}

        <div className="auth-card p-8">
          <div className="auth-accent-line" />

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Setting up two-factor authentication…</p>
            </div>
          )}

          {/* Scan */}
          {step === 'scan' && enrollData && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Set Up Authenticator</h1>
                  <p className="text-xs text-slate-400">{user?.role === 'admin' ? 'Required for administrator access' : 'Add an extra layer of security'}</p>
                </div>
              </div>

              <p className="text-sm text-slate-300 mb-5 leading-relaxed">
                Open <strong className="text-white">Google Authenticator</strong> or <strong className="text-white">Authy</strong> and scan:
              </p>

              <div className="flex justify-center mb-5">
                <div
                  className="p-4 bg-white rounded-2xl shadow-xl ring-4 ring-white/10"
                  style={{ lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: enrollData.qr_code }}
                />
              </div>

              <div className="mb-5">
                <p className="text-xs text-slate-500 font-medium mb-2">Can't scan? Enter key manually:</p>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <code className="flex-1 text-xs font-mono text-primary/80 break-all select-all">
                    {enrollData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    {copied
                      ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                      : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="mb-6 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <p className="text-xs text-primary/70 leading-relaxed">
                  <strong className="text-primary/90">Multiple devices?</strong> Scan or enter the key on each before continuing.
                </p>
              </div>

              <button
                onClick={() => { setStep('verify'); setTimeout(() => inputRefs.current[0]?.focus(), 100) }}
                className="btn-primary w-full"
              >
                I've scanned it — Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Verify */}
          {step === 'verify' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Enter Verification Code</h1>
                  <p className="text-xs text-slate-400">6-digit code from your app</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Open your authenticator and enter the current code for <strong className="text-slate-300">ThinkTarteeb</strong>.
              </p>

              <div className="flex gap-2 mb-3 justify-center" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleDigit(i, e.target.value)}
                    onKeyDown={e => handleDigitKey(i, e)}
                    className={`otp-digit ${d ? 'filled' : ''}`}
                  />
                ))}
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mb-7">
                {digits.map((d, i) => (
                  <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${d ? 'bg-primary' : 'bg-slate-800'
                    }`} />
                ))}
              </div>

              <button
                onClick={verifyCode}
                disabled={loading || digits.join('').length < 6}
                className="btn-primary w-full mb-4"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                  : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Enable MFA</>}
              </button>

              <button
                onClick={() => setStep('scan')}
                className="w-full text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back to QR code
              </button>
            </div>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-4 text-center animate-in zoom-in-95 duration-500">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center ring-4 ring-emerald-500/5">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white">MFA Enabled!</h2>
              <p className="text-sm text-slate-400">Your account is now fully secured.</p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Redirecting…
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">{user?.email}</p>
      </div>
    </div>
  )
}