import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Mail, Lock, Eye, EyeOff, BookOpen, ArrowRight } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Form = z.infer<typeof schema>

export default function StaffLoginPage() {
  const navigate = useNavigate()
  const { setSession, storeTokenOnly } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    setLoading(true)
    try {
      const res = await authApi.login(data.email, data.password)
      const { user, access_token, refresh_token, mfa_required, mfa_enrolled } = res.data.data

      if (mfa_required) {
        // Store token so axios can use it for MFA API calls,
        // but DON'T set isAuthenticated — prevents RedirectIfAuthed
        // from racing our navigate() to the MFA page.
        storeTokenOnly(user, access_token, refresh_token)
        navigate(mfa_enrolled ? '/auth/mfa-verify' : '/auth/mfa-setup')
        return
      }

      setSession(user, access_token, refresh_token)
      toast.success(`Welcome, ${user.name}!`)
      
      if (user.role === 'teacher') {
        navigate(user.is_registered ? '/teacher' : '/auth/teacher-registration', { replace: true })
      } else {
        navigate('/admin', { replace: true })
      }
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Login failed. Check your credentials.')
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
          
          <h1 className="text-2xl font-bold text-white mb-2">Staff Login</h1>
          <p className="text-sm text-slate-400 mb-8">Teachers & Administrators</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-500
                             rounded-xl pl-11 pr-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
              {errors.email && (
                <p className="mt-2 text-xs text-red-400 font-medium">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-500
                             rounded-xl pl-11 pr-11 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-2 text-xs text-red-400 font-medium">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign In <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </button>
          </form>

        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          Student?{' '}
          <a href="/auth/student-login" className="text-primary font-medium hover:underline hover:text-primary/80 transition-colors">
            Login with phone
          </a>
        </p>
      </div>
    </div>
  )
}
