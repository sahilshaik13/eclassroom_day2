import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { ArrowRight, ArrowLeft, ChevronDown, ScanLine } from 'lucide-react'
import { authApi } from '@/services/authApi'
import { ApiClientError } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

const NATIONALITIES = [
  'Emirati', 'Saudi', 'Kuwaiti', 'Qatari', 'Bahraini', 'Omani', 'Jordanian', 'Egyptian',
  'Syrian', 'Lebanese', 'Iraqi', 'Yemeni', 'Libyan', 'Tunisian', 'Algerian', 'Moroccan',
  'Pakistani', 'Indian', 'Bangladeshi', 'Filipino', 'British', 'American', 'Canadian',
  'Australian', 'Other',
]

const profileSchema = z.object({
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().min(2, 'Last name is required'),
  islamic_name: z.string().optional(),
  gender: z.string().min(1, 'Gender is required'),
  dob_day: z.string().min(1, 'Day is required'),
  dob_month: z.string().min(1, 'Month is required'),
  dob_year: z.string().min(1, 'Year is required'),
  nationality: z.string().min(1, 'Nationality is required'),
  emirates_id: z.string().optional(),
  whatsapp_number: z.string().min(1, 'WhatsApp number is required'),
  city: z.string().min(1, 'City is required'),
  needs_transport: z.boolean().default(false),
  address: z.string().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - i)
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export default function StudentRegistrationPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 3

  const { user } = useAuthStore()

  useEffect(() => {
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href)
      toast('Please complete your registration first', { icon: '📝' })
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const nameParts = user?.name ? user.name.split(' ') : ['', '']
  const firstName = nameParts[0] || ''
  const lastName = nameParts.slice(1).join(' ') || ''

  const { register, handleSubmit, trigger, watch, setValue, formState: { errors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: firstName, last_name: lastName, needs_transport: false }
  })

  const gender = watch('gender')

  const stepFields: Record<number, (keyof ProfileForm)[]> = {
    1: ['first_name', 'last_name', 'gender', 'dob_day', 'dob_month', 'dob_year'],
    2: ['nationality', 'whatsapp_number'],
    3: ['city'],
  }

  const nextStep = async () => {
    const valid = await trigger(stepFields[step])
    if (valid) setStep(s => s + 1)
  }

  const prevStep = () => setStep(s => s - 1)

  const onSubmit = async (data: ProfileForm) => {
    for (const s of [1, 2, 3] as const) {
      const valid = await trigger(stepFields[s])
      if (!valid) { setStep(s); toast.error(`Please fix the errors in Step ${s}`); return }
    }
    setLoading(true)
    try {
      const dob = `${data.dob_year}-${String(MONTHS.indexOf(data.dob_month) + 1).padStart(2, '0')}-${String(data.dob_day).padStart(2, '0')}`
      await authApi.completeStudentProfile({ ...data, dob })
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

  const inputCls = "w-full bg-gray-100 border border-transparent text-gray-900 placeholder:text-gray-400 rounded-full px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
  const selectCls = "w-full bg-gray-100 border border-transparent text-gray-900 rounded-full px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none cursor-pointer"
  const errorCls = "mt-1.5 text-xs text-red-500 font-medium"
  const labelCls = "block text-sm font-semibold text-gray-800 mb-2"

  return (
    <div className="min-h-screen bg-[#f0f2f5]">

      {/* Top bar — logo left, step right */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 max-w-2xl mx-auto">
        <img
          src="/logo.png"
          alt="ThinkTarteeb"
          className="h-14 w-auto"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <span className="text-sm font-semibold text-gray-500">
          Step {step} of {TOTAL_STEPS}
        </span>
      </div>

      {/* Full-width progress bar */}
      <div className="w-full bg-gray-200 h-1.5">
        <div
          className="bg-indigo-600 h-full transition-all duration-500 ease-out"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      {/* Form card */}
      <div className="flex justify-center px-4 py-8">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-7 sm:p-9">

          <form onSubmit={handleSubmit(onSubmit)}>

            {/* ── Step 1: Personal Information ── */}
            {step === 1 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Personal Information</h2>
                  <p className="text-sm text-gray-500 mt-1">Let's start with your basic details.</p>
                </div>

                {/* First + Last Name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                    <input {...register('first_name')} readOnly placeholder="E.G. Abdullah" className={inputCls + ' cursor-not-allowed opacity-60'} />
                    {errors.first_name && <p className={errorCls}>{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                    <input {...register('last_name')} readOnly placeholder="E.G. Smith" className={inputCls + ' cursor-not-allowed opacity-60'} />
                    {errors.last_name && <p className={errorCls}>{errors.last_name.message}</p>}
                  </div>
                </div>

                {/* Islamic Name */}
                <div>
                  <label className={labelCls}>Islamic Name <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <input {...register('islamic_name')} placeholder="If Different From Above" className={inputCls} />
                </div>

                {/* Gender */}
                <div>
                  <label className={labelCls}>Gender <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    {['male', 'female'].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setValue('gender', g, { shouldValidate: true })}
                        className={`py-3.5 rounded-full text-sm font-semibold border-2 transition-all capitalize
                          ${gender === g
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
                          }`}
                      >
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </button>
                    ))}
                  </div>
                  {errors.gender && <p className={errorCls}>{errors.gender.message}</p>}
                </div>

                {/* Date of Birth */}
                <div>
                  <label className={labelCls}>Date of Birth <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Day */}
                    <div className="relative">
                      <select {...register('dob_day')} className={selectCls}>
                        <option value="">Day</option>
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {/* Month */}
                    <div className="relative">
                      <select {...register('dob_month')} className={selectCls}>
                        <option value="">Month</option>
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    {/* Year */}
                    <div className="relative">
                      <select {...register('dob_year')} className={selectCls}>
                        <option value="">Year</option>
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  {(errors.dob_day || errors.dob_month || errors.dob_year) && (
                    <p className={errorCls}>Please select a complete date of birth</p>
                  )}
                </div>

                <div className="pt-2">
                  <button type="button" onClick={nextStep} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2">
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 2: Identity & Contact ── */}
            {step === 2 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Identity &amp; Contact</h2>
                  <p className="text-sm text-gray-500 mt-1">Your nationality and contact details.</p>
                </div>

                {/* Nationality */}
                <div>
                  <label className={labelCls}>Nationality <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select {...register('nationality')} className={selectCls}>
                      <option value="">Select nationality</option>
                      {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {errors.nationality && <p className={errorCls}>{errors.nationality.message}</p>}
                </div>

                {/* Emirates ID scan box */}
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-indigo-300 transition-colors cursor-pointer group">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-3 group-hover:bg-indigo-100 transition-colors">
                    <ScanLine className="w-6 h-6 text-indigo-500" />
                  </div>
                  <p className="font-semibold text-gray-800 text-sm">Scan Emirates ID (OCR)</p>
                  <p className="text-xs text-gray-500 mt-1">Upload a photo of your Emirates ID to auto-fill fields</p>
                </div>

                {/* Emirates ID Number */}
                <div>
                  <label className={labelCls}>Emirates ID Number <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <input {...register('emirates_id')} placeholder="784-XXXX-XXXXXXX-X" className={inputCls} />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className={labelCls}>WhatsApp Number <span className="text-red-500">*</span></label>
                  <input {...register('whatsapp_number')} type="tel" placeholder="+971 50 123 4567" className={inputCls} />
                  {errors.whatsapp_number && <p className={errorCls}>{errors.whatsapp_number.message}</p>}
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={prevStep} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button type="button" onClick={nextStep} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2">
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Location ── */}
            {step === 3 && (
              <div className="space-y-5 animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Location</h2>
                  <p className="text-sm text-gray-500 mt-1">Your city and address details.</p>
                </div>

                {/* City */}
                <div>
                  <label className={labelCls}>City <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <select {...register('city')} className={selectCls}>
                      <option value="">Select City</option>
                      {['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Other'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                  {errors.city && <p className={errorCls}>{errors.city.message}</p>}
                </div>

                {/* Address */}
                <div>
                  <label className={labelCls}>Address <span className="text-gray-400 font-normal">(Optional)</span></label>
                  <textarea
                    {...register('address')}
                    placeholder="Full address"
                    className="w-full bg-gray-100 border border-transparent text-gray-900 placeholder:text-gray-400 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all min-h-[90px] resize-none"
                  />
                </div>

                {/* Transport */}
                <label className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('needs_transport')}
                    className="w-5 h-5 rounded-md border-gray-300 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-gray-700">I need transportation service</span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={prevStep} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3.5 rounded-full transition-all flex items-center justify-center gap-2">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 rounded-full transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Submitting…</>
                    ) : 'Complete Profile'}
                  </button>
                </div>
              </div>
            )}

          </form>
        </div>
      </div>

      <p className="text-center text-sm text-gray-400 pb-8">
        ← <a href="/" className="hover:text-gray-600 transition-colors">Back to Home</a>
      </p>
    </div>
  )
}
