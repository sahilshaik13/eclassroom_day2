import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

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

export default function MFAVerifyPage() {
    const navigate = useNavigate()
    const { setSession, user } = useAuthStore()
    const [factorId, setFactorId] = useState<string | null>(null)
    const [digits, setDigits] = useState(['', '', '', '', '', ''])
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    useEffect(() => {
        const timer = setTimeout(async () => {
            const raw = localStorage.getItem('eclassroom-auth')
            const token = raw ? JSON.parse(raw)?.state?.accessToken : null
            if (!token) {
                toast.error('Session expired — please log in again')
                navigate('/auth/login')
                return
            }


            // Admin/Teacher use Supabase factors
            try {
                const res = await authApi.mfaGetFactors(token)
                setFactorId(res.data.data.factor_id)
                setTimeout(() => inputRefs.current[0]?.focus(), 100)
            } catch {
                toast.error('Could not load MFA — please log in again')
                navigate('/auth/login')
            } finally {
                setFetching(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [navigate, user?.role])

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
        if (!factorId) return
        const code = digits.join('')
        if (code.length < 6) return toast.error('Enter all 6 digits')
        setLoading(true)

        // Retrieve token for explicit passing
        const raw = localStorage.getItem('eclassroom-auth')
        const token = raw ? JSON.parse(raw)?.state?.accessToken : null

        try {
            const res = await authApi.mfaVerify(factorId, code, token)
            const { access_token, refresh_token } = res.data.data as any
            const rt = refresh_token || localStorage.getItem('refresh_token') || ''
            setSession(user!, access_token, rt)
            toast.success('Welcome back!')
            
            if (user?.role === 'admin') {
                navigate('/admin', { replace: true })
            } else if (user?.role === 'teacher') {
                navigate(user?.is_registered ? '/teacher' : '/auth/teacher-registration', { replace: true })
            } else {
                navigate('/auth/login', { replace: true })
            }
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

                <div className="auth-card p-8">
                    <div className="auth-accent-line" />

                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">Two-Factor Verification</h1>
                            <p className="text-xs text-slate-400">Please enter your code to continue</p>
                        </div>
                    </div>

                    {fetching ? (
                        <div className="flex flex-col items-center py-10 gap-4">
                            <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm text-slate-400">Loading…</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-300">
                            <p className="text-sm text-slate-400 mb-7 leading-relaxed">
                                Open your authenticator and enter the 6-digit code for <strong className="text-slate-300">ThinkTarteeb</strong>.
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
                                    : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Sign In</>}
                            </button>

                            <button
                                onClick={() => navigate('/auth/login')}
                                className="w-full text-sm font-medium text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                ← Back to login
                            </button>
                        </div>
                    )}
                </div>

                <p className="mt-5 text-center text-xs text-slate-600">{user?.email}</p>
            </div>
        </div>
    )
}
