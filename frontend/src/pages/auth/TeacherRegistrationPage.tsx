import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, ArrowLeft, Loader2, User, Phone, MapPin, CheckCircle2, GraduationCap } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

const profileSchema = z.object({
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().min(2, 'Last name is required'),
  islamic_name: z.string().optional(),
  gender: z.string().min(1, 'Gender is required'),
  dob: z.string().min(1, 'Date of birth is required'),
  nationality: z.string().min(1, 'Nationality is required'),
  emirates_id: z.string().optional(),
  whatsapp_number: z.string().min(1, 'WhatsApp number is required'),
  city: z.string().min(1, 'City is required'),
  needs_transport: z.boolean().default(false),
  address: z.string().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>

const STEPS = [
  { number: 1, label: 'Personal Info', icon: User },
  { number: 2, label: 'Contact', icon: Phone },
  { number: 3, label: 'Location', icon: MapPin },
]

const INPUT = 'w-full bg-slate-950/60 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/40 transition-all'
const LABEL = 'block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5'

export default function TeacherRegistrationPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [gender, setGender] = useState('')

  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePop = () => {
      window.history.pushState(null, '', window.location.href)
      toast('Please complete your registration first', { icon: '📝' })
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  const nameParts = user?.name ? user.name.split(' ') : ['', '']
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const { register, handleSubmit, trigger, setValue, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: firstName, last_name: lastName, needs_transport: false },
  })

  const stepFields: Record<number, (keyof ProfileForm)[]> = {
    1: ['first_name', 'last_name', 'gender', 'dob'],
    2: ['nationality', 'whatsapp_number'],
    3: ['city'],
  }

  const nextStep = async () => {
    const valid = await trigger(stepFields[step])
    if (valid) setStep(s => s + 1)
  }

  const handleGender = (val: string) => {
    setGender(val)
    setValue('gender', val, { shouldValidate: true })
  }

  const onSubmit = async (data: ProfileForm) => {
    for (const s of [1, 2, 3] as const) {
      const valid = await trigger(stepFields[s])
      if (!valid) { setStep(s); toast.error(`Please fix errors in Step ${s}`); return }
    }
    setLoading(true)
    try {
      await authApi.completeTeacherProfile(data)
      if (user) {
        useAuthStore.getState().setSession(
          { ...user, is_registered: true },
          useAuthStore.getState().accessToken!,
          useAuthStore.getState().refreshToken!,
        )
      }
      toast.success('Welcome to ThinkTarteeb!')
      navigate('/teacher', { replace: true })
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-10 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-500">

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
          <div>
            <p className="text-lg font-bold text-white leading-none tracking-tight">ThinkTarteeb</p>
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Teacher Registration</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 mb-6">
          {STEPS.map((s, i) => {
            const done = step > s.number
            const active = step === s.number
            return (
              <div key={s.number} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${done ? 'bg-blue-500 border-blue-500 text-white' :
                      active ? 'bg-transparent border-blue-500 text-blue-400' :
                        'bg-transparent border-slate-700 text-slate-600'
                    }`}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : s.number}
                  </div>
                  <span className={`text-[10px] font-semibold whitespace-nowrap transition-colors ${active ? 'text-blue-400' : done ? 'text-slate-400' : 'text-slate-600'
                    }`}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-16 h-px mx-1 mb-5 transition-all ${step > s.number ? 'bg-blue-500' : 'bg-slate-800'}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Card */}
        <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          {/* Step title */}
          <div className="flex items-center gap-3 mb-6">
            {(() => {
              const Icon = STEPS[step - 1].icon
              return (
                <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
              )
            })()}
            <div>
              <h1 className="text-lg font-bold text-white">
                {step === 1 ? 'Personal Information' : step === 2 ? 'Contact Details' : 'Location'}
              </h1>
              <p className="text-xs text-slate-500">
                {step === 1 ? "Let's start with your basic details." : step === 2 ? 'How can students and admin reach you?' : 'Where are you based?'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>

            {/* Step 1 — Personal */}
            {step === 1 && (
              <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL}>First Name <span className="text-red-400">*</span></label>
                    <input {...register('first_name')} readOnly className={`${INPUT} opacity-50 cursor-not-allowed`} />
                    {errors.first_name && <p className="mt-1 text-xs text-red-400">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className={LABEL}>Last Name <span className="text-red-400">*</span></label>
                    <input {...register('last_name')} readOnly className={`${INPUT} opacity-50 cursor-not-allowed`} />
                    {errors.last_name && <p className="mt-1 text-xs text-red-400">{errors.last_name.message}</p>}
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Islamic Name <span className="text-slate-600">(Optional)</span></label>
                  <input {...register('islamic_name')} className={INPUT} placeholder="If different from above" />
                </div>

                <div>
                  <label className={LABEL}>Gender <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    {['male', 'female'].map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGender(g)}
                        className={`py-3 rounded-xl text-sm font-semibold border transition-all ${gender === g
                            ? g === 'male'
                              ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                              : 'bg-pink-500/20 border-pink-500 text-pink-300'
                            : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                          }`}
                      >
                        {g === 'male' ? '👨 Male' : '👩 Female'}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" {...register('gender')} value={gender} />
                  {errors.gender && <p className="mt-1 text-xs text-red-400">{errors.gender.message}</p>}
                </div>

                <div>
                  <label className={LABEL}>Date of Birth <span className="text-red-400">*</span></label>
                  <input type="date" {...register('dob')} className={`${INPUT} [color-scheme:dark]`} />
                  {errors.dob && <p className="mt-1 text-xs text-red-400">{errors.dob.message}</p>}
                </div>

                <button type="button" onClick={nextStep} className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
                  Next Step <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Step 2 — Contact */}
            {step === 2 && (
              <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <label className={LABEL}>Nationality <span className="text-red-400">*</span></label>
                  <input {...register('nationality')} className={INPUT} placeholder="e.g. Emirati, Pakistani, Indian…" />
                  {errors.nationality && <p className="mt-1 text-xs text-red-400">{errors.nationality.message}</p>}
                </div>

                <div>
                  <label className={LABEL}>Emirates ID <span className="text-slate-600">(Optional)</span></label>
                  <input {...register('emirates_id')} className={INPUT} placeholder="784-XXXX-XXXXXXX-X" />
                </div>

                <div>
                  <label className={LABEL}>WhatsApp Number <span className="text-red-400">*</span></label>
                  <input {...register('whatsapp_number')} className={INPUT} placeholder="+971 50 000 0000" />
                  {errors.whatsapp_number && <p className="mt-1 text-xs text-red-400">{errors.whatsapp_number.message}</p>}
                </div>

                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={nextStep} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30">
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Location */}
            {step === 3 && (
              <div className="space-y-4 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <label className={LABEL}>City <span className="text-red-400">*</span></label>
                  <select {...register('city')} className={INPUT}>
                    <option value="" className="bg-slate-900 text-slate-500">Select City</option>
                    {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Other'].map(c => (
                      <option key={c} value={c} className="bg-slate-900">{c}</option>
                    ))}
                  </select>
                  {errors.city && <p className="mt-1 text-xs text-red-400">{errors.city.message}</p>}
                </div>

                <div>
                  <label className={LABEL}>Address <span className="text-slate-600">(Optional)</span></label>
                  <textarea
                    {...register('address')}
                    className={`${INPUT} min-h-[90px] resize-none`}
                    placeholder="Street, building, area…"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('transport-t') as HTMLInputElement
                    if (el) el.click()
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-xl bg-slate-950/40 border border-slate-800 hover:border-blue-500/40 transition-all cursor-pointer"
                >
                  <input
                    type="checkbox"
                    id="transport-t"
                    {...register('needs_transport')}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="text-left">
                    <p className="text-sm font-semibold text-slate-300">I need transportation</p>
                    <p className="text-xs text-slate-500">Request transport arrangement from admin</p>
                  </div>
                </button>

                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setStep(2)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                    ) : (
                      <><GraduationCap className="w-4 h-4" /> Complete Registration</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          Logged in as <span className="text-slate-400">{user?.email || user?.name}</span>
        </p>
      </div>
    </div>
  )
}