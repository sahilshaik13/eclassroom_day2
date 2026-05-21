import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Mail, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
})
type Form = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`
      await authApi.forgotPassword(data.email, redirectTo)
      setSent(true)
      toast.success('Check your inbox for the reset link')
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Could not send reset email. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f0f2f5] flex flex-col items-center justify-center px-3.5 sm:px-4 py-6 sm:py-8 overflow-x-clip">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-10">
          <img
            src="/logo.png"
            alt="ThinkTarteeb"
            className="h-16 w-auto"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-8">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                If an account exists for that address, we sent a password reset link.
                The link expires after a short time.
              </p>
              <Link
                to="/auth/login"
                className="inline-flex items-center gap-2 text-indigo-600 font-semibold text-sm hover:text-indigo-700"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Forgot password?</h1>
              <p className="text-sm text-gray-500 mb-8">
                For teachers, admins, and platform staff. Enter your work email and we&apos;ll send a reset link.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.email.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-11 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold px-4 py-3 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                <Link to="/auth/login" className="text-indigo-600 font-semibold hover:text-indigo-700">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Students use{' '}
          <Link to="/auth/student-login" className="text-indigo-600 hover:text-indigo-700">
            phone login
          </Link>
          , not email password.
        </p>
      </div>
    </div>
  )
}
