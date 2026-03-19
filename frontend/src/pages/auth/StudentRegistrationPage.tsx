import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { BookOpen, ArrowRight, ArrowLeft } from 'lucide-react'
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

export default function StudentRegistrationPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)

  const { user } = useAuthStore()

  // Prevent browser back button from leaving the registration form
  useEffect(() => {
    window.history.pushState(null, '', window.location.href)

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
      toast('Please complete your registration first', { icon: '📝' })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Split name for pre-filling
  const nameParts = user?.name ? user.name.split(' ') : ['', '']
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors }
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: firstName,
      last_name: lastName,
      needs_transport: false
    }
  })

  // Validate step before moving forward
  const nextStep = async (fieldsToValidate: (keyof ProfileForm)[]) => {
    const isStepValid = await trigger(fieldsToValidate)
    if (isStepValid) {
      setStep(s => s + 1)
    }
  }

  const prevStep = () => setStep(s => s - 1)

  // Field groups per step for validation
  const stepFields: Record<number, (keyof ProfileForm)[]> = {
    1: ['first_name', 'last_name', 'gender', 'dob'],
    2: ['nationality', 'whatsapp_number'],
    3: ['city'],
  }

  const onSubmit = async (data: ProfileForm) => {
    // Validate all steps before submitting
    for (const s of [1, 2, 3] as const) {
      const valid = await trigger(stepFields[s])
      if (!valid) {
        setStep(s)
        toast.error(`Please fix the errors in Step ${s}`)
        return
      }
    }

    setLoading(true)
    try {
      await authApi.completeStudentProfile(data)
      // Update store so route guards know registration is complete
      if (user) {
        useAuthStore.getState().setSession(
          { ...user, is_registered: true },
          useAuthStore.getState().accessToken!,
          useAuthStore.getState().refreshToken!,
        )
      }
      toast.success('Registration complete! Welcome to ThinkTarteeb.')
      navigate('/student', { replace: true })
    } catch (e) {
      if (e instanceof ApiClientError) toast.error(e.message)
      else toast.error('Failed to complete registration. Please try again.')
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center py-12 px-4 relative overflow-hidden">
      {/* Background glow and patterns */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-700">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-primary/50">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display text-2xl text-white font-bold tracking-tight">
            ThinkTarteeb
          </span>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h1 className="font-display text-2xl text-white font-bold">Complete Profile</h1>
              <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">Step {step} of 3</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden shadow-inner">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-out"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">First Name *</label>
                    <input {...register('first_name')} readOnly className="w-full bg-slate-950/30 border border-slate-800 text-slate-500 cursor-not-allowed rounded-xl px-4 py-3" />
                    {errors.first_name && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Last Name *</label>
                    <input {...register('last_name')} readOnly className="w-full bg-slate-950/30 border border-slate-800 text-slate-500 cursor-not-allowed rounded-xl px-4 py-3" />
                    {errors.last_name && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.last_name.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Islamic Name</label>
                  <input {...register('islamic_name')} className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Gender *</label>
                    <select {...register('gender')} className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                      <option value="" className="bg-slate-900 text-slate-500">Select</option>
                      <option value="male" className="bg-slate-900">Male</option>
                      <option value="female" className="bg-slate-900">Female</option>
                    </select>
                    {errors.gender && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.gender.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Date of Birth *</label>
                    <input type="date" {...register('dob')} className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all [color-scheme:dark]" />
                    {errors.dob && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.dob.message}</p>}
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => nextStep(['first_name', 'last_name', 'gender', 'dob'])}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center mt-6"
                >
                  <span className="flex items-center gap-2">Next <ArrowRight className="w-5 h-5"/></span>
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Nationality *</label>
                  <input {...register('nationality')} className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="e.g. UAE" />
                  {errors.nationality && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.nationality.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Emirates ID</label>
                  <input {...register('emirates_id')} className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Optional" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">WhatsApp Number *</label>
                  <input {...register('whatsapp_number')} className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="+971..." />
                  {errors.whatsapp_number && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.whatsapp_number.message}</p>}
                </div>

                <div className="flex gap-3 mt-8">
                  <button type="button" onClick={prevStep} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center">
                    <span className="flex items-center gap-2"><ArrowLeft className="w-5 h-5"/> Back</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => nextStep(['nationality', 'whatsapp_number'])}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md flex items-center justify-center"
                  >
                    <span className="flex items-center gap-2">Next <ArrowRight className="w-5 h-5"/></span>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">City *</label>
                  <select {...register('city')} className="w-full bg-slate-950/50 border border-slate-800 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                    <option value="" className="bg-slate-900 text-slate-500">Select City</option>
                    <option value="Dubai" className="bg-slate-900">Dubai</option>
                    <option value="Abu Dhabi" className="bg-slate-900">Abu Dhabi</option>
                    <option value="Sharjah" className="bg-slate-900">Sharjah</option>
                    <option value="Ajman" className="bg-slate-900">Ajman</option>
                    <option value="Other" className="bg-slate-900">Other</option>
                  </select>
                  {errors.city && <p className="mt-1.5 text-xs text-red-400 font-medium">{errors.city.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Address</label>
                  <textarea 
                    {...register('address')} 
                    className="w-full bg-slate-950/50 border border-slate-800 text-white placeholder:text-slate-600 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all min-h-[100px] resize-none" 
                    placeholder="Full address (optional)"
                  />
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                  const el = document.getElementById('transport') as HTMLInputElement;
                  if(el) el.click();
                }}>
                  <input 
                    type="checkbox" 
                    id="transport" 
                    {...register('needs_transport')}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-950 text-primary focus:ring-primary focus:ring-offset-slate-900 cursor-pointer" 
                    onClick={e => e.stopPropagation()}
                  />
                  <label htmlFor="transport" className="text-sm font-medium text-slate-300 cursor-pointer pointer-events-none">
                    I need transportation service
                  </label>
                </div>

                <div className="flex gap-3 mt-8">
                  <button type="button" onClick={prevStep} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center">
                    <span className="flex items-center gap-2"><ArrowLeft className="w-5 h-5"/> Back</span>
                  </button>
                  <button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Submitting
                      </span>
                    ) : 'Complete Profile'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
