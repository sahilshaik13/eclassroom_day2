import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ShieldCheck, BookOpen } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

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
            try {
                const res = await authApi.mfaGetFactors()
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
    }, [navigate])

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
        try {
            const res = await authApi.mfaVerify(factorId, code)
            const { access_token, refresh_token } = res.data.data as any
            const rt = refresh_token || localStorage.getItem('refresh_token') || ''
            setSession(user!, access_token, rt)
            toast.success('Welcome back!')
            navigate('/admin')
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
            {/* Background glow and patterns */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-sm relative z-10 animate-in fade-in zoom-in-95 duration-700">
                <div className="flex items-center justify-center gap-3 mb-10">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-primary/50">
                        <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <span className="font-display text-2xl text-white font-bold tracking-tight">
                        ThinkTarteeb
                    </span>
                </div>

                <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-inner">
                            <ShieldCheck className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="font-display text-xl text-white font-bold leading-tight">Verify Identity</h1>
                            <p className="text-xs text-slate-400 font-medium">Two-factor authentication</p>
                        </div>
                    </div>

                    {fetching ? (
                        <div className="flex flex-col items-center py-8 gap-4">
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm text-slate-400">Loading…</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in duration-300">
                            <p className="text-sm font-medium text-slate-300 mb-7">
                                Enter the 6-digit code from your authenticator app
                            </p>

                            <div className="flex gap-2.5 mb-8 justify-center" onPaste={handlePaste}>
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
                               bg-slate-950/50 border border-slate-800 text-white
                               focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary
                               transition-all z-10 relative shadow-inner"
                                    />
                                ))}
                            </div>

                            <button
                                onClick={verifyCode}
                                disabled={loading || digits.join('').length < 6}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md mb-6 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Verifying…
                                    </span>
                                ) : 'Verify & Sign In'}
                            </button>

                            <button
                                onClick={() => navigate('/auth/login')}
                                className="w-full text-sm font-medium text-slate-400 hover:text-white transition-colors"
                            >
                                ← Back to login
                            </button>
                        </div>
                    )}
                </div>

                <p className="mt-6 text-center text-sm font-medium text-slate-500">
                    Admin account: {user?.email}
                </p>
            </div>
        </div>
    )
}