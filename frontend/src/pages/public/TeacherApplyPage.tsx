import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { 
  Loader2, 
  CheckCircle2, 
  User, 
  Mail, 
  Phone, 
  GraduationCap, 
  BookOpen, 
  ArrowRight,
  Globe,
  ShieldCheck
} from 'lucide-react'
import api from '@/services/api'

const applySchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  whatsapp: z.string().min(8, 'Valid WhatsApp number is required'),
  subject: z.string().min(2, 'Specialization/Subject is required'),
  experience: z.string().min(10, 'Please provide a brief summary of your experience (min 10 chars)'),
})

type ApplyForm = z.infer<typeof applySchema>

export default function TeacherApplyPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tenant, setTenant] = useState<{ name: string; slug: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ApplyForm>({
    resolver: zodResolver(applySchema),
  })

  useEffect(() => {
    if (!slug) return
    api.get(`/public/tenants/${slug}`)
      .then(r => setTenant(r.data.data))
      .catch(() => toast.error('Organization not found'))
      .finally(() => setLoading(false))
  }, [slug])

  const onSubmit = async (data: ApplyForm) => {
    setSubmitting(true)
    try {
      await api.post(`/public/tenants/${slug}/apply`, data)
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200 border border-slate-100 text-center max-w-sm">
          <Globe className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Link Expired or Invalid</h1>
          <p className="text-slate-500 mb-6">The recruitment link you followed doesn't seem to exist or has been deactivated.</p>
          <Link to="/auth/login" className="text-primary font-semibold hover:underline">Return to Home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center py-12 px-4 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute top-0 left-0 w-full h-64 bg-primary/5 -skew-y-3 origin-top-left -z-10" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10 translate-x-1/2 translate-y-1/2" />
      
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider mb-4">
            <ShieldCheck className="h-3 w-3" /> Recruitment Portal
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-3">Join {tenant.name}</h1>
          <p className="text-slate-500 text-lg">Apply today to become a part of our teaching community.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          {submitted ? (
            <div className="p-12 text-center animate-in fade-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Application Received!</h2>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                Thank you for your interest in joining <strong>{tenant.name}</strong>. 
                Our team will review your details and contact you via email shortly.
              </p>
              <Button asChild className="rounded-xl px-8 h-12">
                <Link to="/auth/login">Back to Login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="p-8 sm:p-12 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      {...register('name')}
                      placeholder="e.g. Abdullah Ahmad"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.name && <p className="text-xs text-red-500 ml-1 font-medium">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      {...register('email')}
                      type="email"
                      placeholder="name@example.com"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-red-500 ml-1 font-medium">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">WhatsApp Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      {...register('whatsapp')}
                      placeholder="+971 5X XXX XXXX"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.whatsapp && <p className="text-xs text-red-500 ml-1 font-medium">{errors.whatsapp.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 ml-1">Teaching Subject</label>
                  <div className="relative">
                    <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input 
                      {...register('subject')}
                      placeholder="e.g. Hifz, Tajweed, Arabic"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                  {errors.subject && <p className="text-xs text-red-500 ml-1 font-medium">{errors.subject.message}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  Teaching Experience & Qualifications
                </label>
                <textarea 
                  {...register('experience')}
                  placeholder="Tell us about your previous experience, ijaza levels, or teaching background..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-slate-400 text-slate-800 min-h-[140px] resize-none"
                />
                {errors.experience && <p className="text-xs text-red-500 ml-1 font-medium">{errors.experience.message}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-14 bg-primary hover:bg-primary/95 text-white font-bold rounded-2xl shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed group"
              >
                {submitting ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> Submitting Application...</>
                ) : (
                  <>Submit Application <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
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

function Button({ children, className, asChild, ...props }: any) {
  const Comp = asChild ? 'span' : 'button'
  return (
    <Comp className={`inline-flex items-center justify-center gap-2 font-bold transition-all bg-primary text-white hover:bg-primary/95 shadow-lg shadow-primary/20 ${className}`} {...props}>
      {children}
    </Comp>
  )
}
