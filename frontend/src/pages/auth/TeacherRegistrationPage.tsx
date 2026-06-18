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
import {
  AuthPageLayout,
  authBtnPrimaryClass,
  authBtnSecondaryClass,
  authInputClass,
  authLabelClass,
} from '@/components/auth/AuthPageLayout'

const profileSchema = z.object({
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().optional(),
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
    if (valid) setStep((s) => s + 1)
  }

  const handleGender = (val: string) => {
    setGender(val)
    setValue('gender', val, { shouldValidate: true })
  }

  const onSubmit = async (data: ProfileForm) => {
    for (const s of [1, 2, 3] as const) {
      const valid = await trigger(stepFields[s])
      if (!valid) {
        setStep(s)
        toast.error(`Please fix errors in Step ${s}`)
        return
      }
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

  const stepIndicators = (
    <div className="flex items-center justify-center gap-0 mb-6">
      {STEPS.map((s, i) => {
        const done = step > s.number
        const active = step === s.number
        return (
          <div key={s.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                  done
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : active
                      ? 'bg-white border-indigo-600 text-indigo-600'
                      : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : s.number}
              </div>
              <span
                className={`text-[10px] font-semibold whitespace-nowrap transition-colors ${
                  active ? 'text-indigo-600' : done ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-px mx-1 mb-5 transition-all ${
                  step > s.number ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )

  const StepIcon = STEPS[step - 1].icon

  return (
    <AuthPageLayout
      maxWidth="md"
      aboveCard={stepIndicators}
      belowCard={
        <p className="mt-4 text-center text-xs text-gray-400">
          Logged in as <span className="text-gray-600 font-medium">{user?.email || user?.name}</span>
        </p>
      }
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
          <StepIcon className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {step === 1 ? 'Personal information' : step === 2 ? 'Contact details' : 'Location'}
          </h1>
          <p className="text-sm text-gray-500">
            {step === 1
              ? "Let's start with your basic details."
              : step === 2
                ? 'How can students and admin reach you?'
                : 'Where are you based?'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={authLabelClass}>
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('first_name')}
                  readOnly
                  className={`${authInputClass} opacity-60 cursor-not-allowed`}
                />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-500 font-medium">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className={authLabelClass}>Last name</label>
                <input
                  {...register('last_name')}
                  readOnly
                  className={`${authInputClass} opacity-60 cursor-not-allowed`}
                />
              </div>
            </div>

            <div>
              <label className={authLabelClass}>
                Islamic name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input {...register('islamic_name')} className={authInputClass} placeholder="If different from above" />
            </div>

            <div>
              <label className={authLabelClass}>
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {['male', 'female'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => handleGender(g)}
                    className={`py-3 rounded-xl text-sm font-semibold border transition-all ${
                      gender === g
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
              <input type="hidden" {...register('gender')} value={gender} />
              {errors.gender && (
                <p className="mt-1 text-xs text-red-500 font-medium">{errors.gender.message}</p>
              )}
            </div>

            <div>
              <label className={authLabelClass}>
                Date of birth <span className="text-red-500">*</span>
              </label>
              <input type="date" {...register('dob')} className={authInputClass} />
              {errors.dob && (
                <p className="mt-1 text-xs text-red-500 font-medium">{errors.dob.message}</p>
              )}
            </div>

            <button type="button" onClick={nextStep} className={`${authBtnPrimaryClass} mt-2`}>
              Next step <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className={authLabelClass}>
                Nationality <span className="text-red-500">*</span>
              </label>
              <input
                {...register('nationality')}
                className={authInputClass}
                placeholder="e.g. Emirati, Pakistani, Indian…"
              />
              {errors.nationality && (
                <p className="mt-1 text-xs text-red-500 font-medium">{errors.nationality.message}</p>
              )}
            </div>

            <div>
              <label className={authLabelClass}>
                Emirates ID <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input {...register('emirates_id')} className={authInputClass} placeholder="784-XXXX-XXXXXXX-X" />
            </div>

            <div>
              <label className={authLabelClass}>
                WhatsApp number <span className="text-red-500">*</span>
              </label>
              <input {...register('whatsapp_number')} className={authInputClass} placeholder="+971 50 000 0000" />
              {errors.whatsapp_number && (
                <p className="mt-1 text-xs text-red-500 font-medium">{errors.whatsapp_number.message}</p>
              )}
            </div>

            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => setStep(1)} className={authBtnSecondaryClass}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button type="button" onClick={nextStep} className={authBtnPrimaryClass}>
                Next step <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={authLabelClass}>
                City <span className="text-red-500">*</span>
              </label>
              <select {...register('city')} className={authInputClass}>
                <option value="">Select city</option>
                {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Other'].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </select>
              {errors.city && (
                <p className="mt-1 text-xs text-red-500 font-medium">{errors.city.message}</p>
              )}
            </div>

            <div>
              <label className={authLabelClass}>
                Address <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                {...register('address')}
                className={`${authInputClass} min-h-[90px] resize-none`}
                placeholder="Street, building, area…"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('transport-t') as HTMLInputElement
                if (el) el.click()
              }}
              className="w-full flex items-center gap-3 p-4 rounded-xl bg-gray-50 border border-gray-200 hover:border-indigo-300 transition-all cursor-pointer text-left"
            >
              <input
                type="checkbox"
                id="transport-t"
                {...register('needs_transport')}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">I need transportation</p>
                <p className="text-xs text-gray-500">Request transport arrangement from admin</p>
              </div>
            </button>

            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => setStep(2)} className={authBtnSecondaryClass}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button type="submit" disabled={loading} className={authBtnPrimaryClass}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <GraduationCap className="w-4 h-4" /> Complete registration
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </AuthPageLayout>
  )
}
