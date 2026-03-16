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
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                            <ShieldCheck className="w-5 h-5 text-gold" />
                        </div>
                        <div>
                            <h1 className="font-display text-xl text-white leading-tight">Verify Identity</h1>
                            <p className="text-xs text-white/40">Two-factor authentication</p>
                        </div>
                    </div>

                    {fetching ? (
                        <div className="flex flex-col items-center py-8 gap-4">
                            <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                            <p className="text-sm text-white/50">Loading…</p>
                        </div>
                    ) : (
                        <>
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
                                ) : 'Verify & Sign In'}
                            </button>

                            <button
                                onClick={() => navigate('/auth/login')}
                                className="w-full text-xs text-white/30 hover:text-white/60 transition-colors"
                            >
                                ← Back to login
                            </button>
                        </>
                    )}
                </div>

                <p className="mt-5 text-center text-xs text-white/25">
                    Admin account: {user?.email}
                </p>
            </div>
        </div>
    )
}