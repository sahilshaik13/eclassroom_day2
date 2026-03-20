import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, Copy, Check, Smartphone, ArrowRight, Loader2 } from 'lucide-react'
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
    const timer = setTimeout(() => {
      const raw = localStorage.getItem('eclassroom-auth')
      const token = raw ? JSON.parse(raw)?.state?.accessToken : null
      if (!token) {
        toast.error('Session expired — please log in again')
        navigate('/auth/login')
        return
      }
      authApi.mfaEnroll()
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
    try {
      const res = await authApi.mfaVerify(enrollData.factor_id, code)
      const { access_token } = res.data.data
      const refreshToken = localStorage.getItem('refresh_token') ?? ''
      setSession(user!, access_token, refreshToken)
      setStep('done')
      setTimeout(() => { toast.success("MFA enabled — you're protected!"); navigate('/admin') }, 1400)
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
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

        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

          {/* Loading */}
          {step === 'loading' && (
            <div className="flex flex-col items-center py-10 gap-4">
              <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Setting up two-factor authentication…</p>
            </div>
          )}

          {/* Scan QR */}
          {step === 'scan' && enrollData && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white">Set Up Authenticator</h1>
                  <p className="text-xs text-slate-400">Required for admin access</p>
                </div>
              </div>

              <p className="text-sm text-slate-300 mb-5 leading-relaxed">
                Open <strong className="text-white">Google Authenticator</strong> or <strong className="text-white">Authy</strong> and scan this QR code:
              </p>

              {/* QR Code */}
              <div className="flex justify-center mb-5">
                <div
                  className="p-4 bg-white rounded-2xl shadow-xl ring-4 ring-white/10"
                  style={{ lineHeight: 0 }}
                  dangerouslySetInnerHTML={{ __html: enrollData.qr_code }}
                />
              </div>

              {/* Manual key */}
              <div className="mb-5">
                <p className="text-xs text-slate-500 font-medium mb-2">Can't scan? Enter this key manually:</p>
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl group">
                  <code className="flex-1 text-xs font-mono text-primary/80 break-all select-all">
                    {enrollData.secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="mb-6 p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <p className="text-xs text-primary/70 leading-relaxed">
                  <strong className="text-primary/90">Multiple devices?</strong> Scan or enter the key on each device before continuing — all will generate the same codes.
                </p>
              </div>

              <button
                onClick={() => { setStep('verify'); setTimeout(() => inputRefs.current[0]?.focus(), 100) }}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
              >
                I've scanned it — Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Verify code */}
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
                Open your authenticator app and enter the current 6-digit code shown for ThinkTarteeb.
              </p>

              {/* OTP Input */}
              <div className="flex gap-2 mb-6 justify-center" onPaste={handlePaste}>
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
                    className={`w-11 h-13 text-center text-xl font-mono font-bold rounded-xl
                      bg-slate-950/60 border text-white transition-all shadow-inner
                      focus:outline-none focus:ring-1 focus:ring-primary/50
                      ${d ? 'border-primary/60 text-white' : 'border-slate-800 text-slate-600'}`}
                    style={{ height: '52px' }}
                  />
                ))}
              </div>

              <button
                onClick={verifyCode}
                disabled={loading || digits.join('').length < 6}
                className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 mb-4 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Verify &amp; Enable MFA</>
                )}
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
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-2 ring-4 ring-emerald-500/5">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white">MFA Enabled!</h2>
              <p className="text-sm text-slate-400">Your account is now secured with two-factor authentication.</p>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Redirecting to admin portal…
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-slate-600">
          {user?.email}
        </p>
      </div>
    </div>
  )
}