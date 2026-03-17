import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { BookOpen, ArrowRight, ArrowLeft } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'

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

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors }
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
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

  const onSubmit = async (data: ProfileForm) => {
    setLoading(true)
    try {
      await authApi.completeStudentProfile(data)
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
    <div className="min-h-screen bg-slate-950 auth-pattern flex flex-col items-center justify-center py-12 px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="w-full max-w-md relative animate-fade-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-gold" />
          </div>
          <span className="font-display text-xl text-white font-semibold tracking-tight">
            ThinkTarteeb
          </span>
        </div>

        <div className="bg-white/[0.04] backdrop-blur border border-white/10 rounded-2xl p-8">
          <div className="mb-8">
            <div className="flex justify-between items-center mb-2">
              <h1 className="font-display text-2xl text-white">Complete Profile</h1>
              <span className="text-sm font-medium text-gold">Step {step} of 3</span>
            </div>
            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-gold h-full transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {step === 1 && (
              <div className="space-y-4 animate-fade-up">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-white/60">First Name *</label>
                    <input {...register('first_name')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" />
                    {errors.first_name && <p className="mt-1 text-xs text-red-400">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className="label text-white/60">Last Name *</label>
                    <input {...register('last_name')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" />
                    {errors.last_name && <p className="mt-1 text-xs text-red-400">{errors.last_name.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="label text-white/60">Islamic Name</label>
                  <input {...register('islamic_name')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label text-white/60">Gender *</label>
                    <select {...register('gender')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5">
                      <option value="" className="bg-slate-900 text-white/50">Select</option>
                      <option value="male" className="bg-slate-900">Male</option>
                      <option value="female" className="bg-slate-900">Female</option>
                    </select>
                    {errors.gender && <p className="mt-1 text-xs text-red-400">{errors.gender.message}</p>}
                  </div>
                  <div>
                    <label className="label text-white/60">Date of Birth *</label>
                    <input type="date" {...register('dob')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5 [color-scheme:dark]" />
                    {errors.dob && <p className="mt-1 text-xs text-red-400">{errors.dob.message}</p>}
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => nextStep(['first_name', 'last_name', 'gender', 'dob'])}
                  className="btn-primary w-full mt-6"
                >
                  <span className="flex items-center gap-2">Next <ArrowRight className="w-4 h-4"/></span>
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-fade-up">
                <div>
                  <label className="label text-white/60">Nationality *</label>
                  <input {...register('nationality')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" placeholder="e.g. UAE" />
                  {errors.nationality && <p className="mt-1 text-xs text-red-400">{errors.nationality.message}</p>}
                </div>

                <div>
                  <label className="label text-white/60">Emirates ID</label>
                  <input {...register('emirates_id')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" placeholder="Optional" />
                </div>

                <div>
                  <label className="label text-white/60">WhatsApp Number *</label>
                  <input {...register('whatsapp_number')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5" placeholder="+971..." />
                  {errors.whatsapp_number && <p className="mt-1 text-xs text-red-400">{errors.whatsapp_number.message}</p>}
                </div>

                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={prevStep} className="btn-secondary flex-1">
                    <span className="flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4"/> Back</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => nextStep(['nationality', 'whatsapp_number'])}
                    className="btn-primary flex-1"
                  >
                    <span className="flex items-center justify-center gap-2">Next <ArrowRight className="w-4 h-4"/></span>
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-fade-up">
                <div>
                  <label className="label text-white/60">City *</label>
                  <select {...register('city')} className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5">
                    <option value="" className="bg-slate-900 text-white/50">Select City</option>
                    <option value="Dubai" className="bg-slate-900">Dubai</option>
                    <option value="Abu Dhabi" className="bg-slate-900">Abu Dhabi</option>
                    <option value="Sharjah" className="bg-slate-900">Sharjah</option>
                    <option value="Ajman" className="bg-slate-900">Ajman</option>
                    <option value="Other" className="bg-slate-900">Other</option>
                  </select>
                  {errors.city && <p className="mt-1 text-xs text-red-400">{errors.city.message}</p>}
                </div>

                <div>
                  <label className="label text-white/60">Address</label>
                  <textarea 
                    {...register('address')} 
                    className="input bg-white/5 border-white/10 text-white focus:border-gold mt-1.5 min-h-[80px]" 
                    placeholder="Full address (optional)"
                  />
                </div>

                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                  <input 
                    type="checkbox" 
                    id="transport" 
                    {...register('needs_transport')}
                    className="w-5 h-5 rounded border-white/20 bg-white/5 text-gold focus:ring-gold focus:ring-offset-slate-950" 
                  />
                  <label htmlFor="transport" className="text-sm text-white/80 cursor-pointer">
                    I need transportation service
                  </label>
                </div>

                <div className="flex gap-3 mt-6">
                  <button type="button" onClick={prevStep} className="btn-secondary flex-1">
                    <span className="flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4"/> Back</span>
                  </button>
                  <button type="submit" disabled={loading} className="btn-primary flex-1">
                    {loading ? 'Submitting...' : 'Complete'}
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
