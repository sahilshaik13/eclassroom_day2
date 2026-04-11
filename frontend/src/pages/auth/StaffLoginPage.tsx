import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'
import { ApiClientError } from '@/services/api'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
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
        storeTokenOnly(user, access_token, refresh_token)
        navigate(mfa_enrolled ? '/auth/mfa-verify' : '/auth/mfa-setup')
        return
      }

      setSession(user, access_token, refresh_token)
      toast.success(`Welcome, ${user.name}!`)

      if (user.role === 'super_admin') {
        navigate('/super-admin', { replace: true })
      } else if (user.role === 'teacher') {
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
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Staff Login</h1>
          <p className="text-sm text-gray-500 mb-8">Teachers &amp; Administrators</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  autoFocus
                  autoComplete="email"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 rounded-full pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
                <button type="button" onClick={() => setShowPass((s) => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors" tabIndex={-1}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.password.message}</p>}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Signing in…</>
                ) : (
                  <>Sign In <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Student?{' '}
          <a href="/auth/student-login" className="text-indigo-600 font-semibold hover:text-indigo-700 transition-colors">
            Login with phone
          </a>
        </p>

        <p className="mt-4 text-center text-xs text-gray-400">
          ← <a href="/" className="hover:text-gray-600 transition-colors">Back to Home</a>
        </p>
      </div>
    </div>
  )
}
