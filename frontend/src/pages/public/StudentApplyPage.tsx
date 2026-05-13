import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  Loader2,
  CheckCircle2,
  User,
  Phone,
  FileText,
  ArrowRight,
  Globe,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'

const applySchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  phone: z.string().min(8, 'Valid phone number is required'),
  notes: z.string().max(500, 'Notes must be 500 characters or fewer').optional(),
})

type ApplyForm = z.infer<typeof applySchema>

export default function StudentApplyPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tenant, setTenant] = useState<{ name: string; slug: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
  })

  useEffect(() => {
    if (!slug) return
    api
      .get(`/public/tenants/${slug}`)
      .then(r => setTenant(r.data.data))
      .catch(() => toast.error('Organization not found'))
      .finally(() => setLoading(false))
  }, [slug])

  const onSubmit = async (data: ApplyForm) => {
    setSubmitting(true)
    try {
      await api.post(`/public/tenants/${slug}/student-apply`, data)
      setSubmitted(true)
      toast.success('Application submitted!')
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center overflow-x-clip">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center p-4 overflow-x-clip">
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200 border border-slate-100 text-center max-w-sm">
          <Globe className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Link Expired or Invalid</h1>
          <p className="text-slate-500 mb-6">The student invite link you followed is not available right now.</p>
          <Link to="/auth/student-login" className="text-primary font-semibold hover:underline">Return to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center py-8 sm:py-12 px-3.5 sm:px-4 relative overflow-x-clip">
      <div className="absolute top-0 left-0 w-full h-64 bg-emerald-500/5 -skew-y-3 origin-top-left -z-10" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10 translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-2xl app-section">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3 w-3" /> Student Admission
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">Apply to Join {tenant.name}</h1>
          <p className="text-slate-500 text-lg">Submit your details and the admin will review your request and assign you to a class.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          {submitted ? (
            <div className="p-12 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Application Received!</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                Your request has been sent to <strong>{tenant.name}</strong>. Once approved, the admin will place you in a class and you can log in with your phone number.
              </p>
              <Button asChild className="rounded-xl px-8 h-12 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20">
                <Link to="/auth/student-login">Go to Student Login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 sm:p-8 lg:p-12 space-y-6 sm:space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Student Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      {...register('name')}
                      placeholder="e.g. Ayesha Rahman"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500 ml-1 font-medium">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      {...register('phone')}
                      placeholder="+971 5X XXX XXXX"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.phone && <p className="text-xs text-red-500 ml-1 font-medium">{errors.phone.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Notes for the Admin
                </label>
                <textarea
                  {...register('notes')}
                  placeholder="Optional: age, preferred timing, current level, or anything the admin should know."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all placeholder:text-slate-400 text-slate-800 min-h-[140px] resize-none"
                />
                {errors.notes && <p className="text-xs text-red-500 ml-1 font-medium">{errors.notes.message}</p>}
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 flex items-start gap-3">
                <GraduationCap className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-sm text-emerald-900">
                  After approval, the admin will assign you to one of the school’s classes under a teacher.
                </p>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                size="xl"
                className="w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 gap-3 group"
              >
                {submitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Submitting Application...</>
                ) : (
                  <>Submit Application <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" /></>
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center mt-8 text-slate-400 text-sm">
          Powered by <strong className="text-slate-500">ThinkTarteeb E-Classroom</strong>
        </p>
      </div>
    </div>
  )
}
