import { useState } from 'react'
import { User, Phone, Shield, Save, Camera, Mail, BadgeCheck, Fingerprint } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function TeacherProfilePage() {
  const { user, setSession, accessToken, refreshToken } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm({
    defaultValues: { name: user?.name ?? '' },
  })

  const onSubmit = async (data: { name: string }) => {
    setSaving(true)
    try {
      await api.patch('/teacher/profile', data)
      if (user && accessToken && refreshToken) {
        setSession({ ...user, name: data.name }, accessToken, refreshToken)
      }
      toast.success('Your profile has been successfully updated.')
    } catch {
      toast.error('Failed to update profile. Please check your connection.')
    } finally {
      setSaving(false)
    }
  }

  const handleEnableMFA = () => {
    navigate('/auth/mfa-setup')
  }

  return (
    <DashboardPageLayout
      title="Teacher Profile"
      description="Manage your professional information and account security settings."
      actions={
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
          <BadgeCheck className="h-3.5 w-3.5" />
          <span className="text-[10px] font-black uppercase tracking-widest">Verified Educator</span>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto space-y-8 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Avatar & Basic Info */}
          <div className="space-y-8">
            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white/50 backdrop-blur-sm rounded-[2.5rem] p-8 text-center flex flex-col items-center">
              <div className="relative group">
                <Avatar className="h-32 w-32 border-4 border-white shadow-2xl shadow-primary/20 ring-1 ring-slate-100 group-hover:scale-105 transition-transform duration-500">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-4xl">
                    {user?.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <button className="absolute bottom-0 right-0 h-10 w-10 bg-white shadow-xl rounded-2xl flex items-center justify-center border border-slate-100 hover:bg-slate-50 transition-colors shadow-primary/10">
                  <Camera className="h-5 w-5 text-slate-400" />
                </button>
              </div>
              
              <div className="mt-6">
                <h3 className="text-xl font-black text-slate-900 leading-tight">{user?.name}</h3>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mt-1">{user?.role}</p>
              </div>

              <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent my-6" />

              <div className="grid grid-cols-2 w-full gap-4">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Join Date</p>
                  <p className="text-xs font-bold text-slate-600 mt-1">Mar 2026</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Status</p>
                  <p className="text-xs font-bold text-emerald-600 mt-1">Active</p>
                </div>
              </div>
            </Card>

            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white rounded-[2rem]">
              <CardHeader className="p-6 pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Account Security</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2 space-y-4">
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white transition-colors duration-300">
                  <div className="h-10 w-10 bg-white shadow-sm border border-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                    <Fingerprint className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-slate-900">Multi-factor Auth</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      {user?.mfa_enabled ? 'Enabled' : 'Not Enabled'}
                    </p>
                  </div>
                </div>
                {!user?.mfa_enabled && (
                  <Button 
                    onClick={handleEnableMFA}
                    variant="outline" 
                    className="w-full rounded-xl border-primary/20 bg-primary/5 h-10 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-white transition-all duration-300"
                  >
                    Enable MFA Protection
                  </Button>
                )}
                <Button variant="outline" className="w-full rounded-xl border-slate-200 h-10 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">
                  Privacy Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Edit Details */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-slate-200/60 shadow-xl shadow-slate-200/20 overflow-hidden bg-white rounded-[2.5rem]">
              <CardHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-black text-slate-900">Personal Details</CardTitle>
                    <CardDescription>Update your professional profile information.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Display Name</label>
                      <div className="relative group">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300 group-focus-within:text-primary transition-colors" />
                        <Input
                          {...register('name', { required: 'Name is required' })}
                          className="h-14 pl-12 rounded-2xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-4 focus:ring-primary/5 transition-all"
                          placeholder="Your legal name"
                        />
                      </div>
                      {errors.name && <p className="text-[10px] font-bold text-rose-500 ml-1">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Connection</label>
                      <div className="relative group grayscale">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        <Input
                          value={user?.email ?? ''}
                          disabled
                          className="h-14 pl-12 rounded-2xl bg-slate-50/50 border-slate-100 cursor-not-allowed opacity-60 text-slate-400 font-medium"
                        />
                      </div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Read-only field</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Phone Link</label>
                      <div className="relative group grayscale">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        <Input
                          value={user?.phone ?? ''}
                          disabled
                          className="h-14 pl-12 rounded-2xl bg-slate-50 border-slate-100 opacity-80 cursor-not-allowed text-slate-500 font-medium"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Portal Role</label>
                      <div className="relative group grayscale">
                        <Shield className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-300" />
                        <Input
                          value={user?.role ?? ''}
                          disabled
                          className="h-14 pl-12 rounded-2xl bg-slate-50 border-slate-100 opacity-80 cursor-not-allowed capitalize text-slate-500 font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-50 flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={saving || !isDirty} 
                      className="h-14 px-12 rounded-2xl bg-slate-900 hover:bg-black text-white font-black uppercase tracking-widest text-xs gap-3 shadow-2xl shadow-slate-900/10 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-30 disabled:translate-y-0 disabled:shadow-none"
                    >
                      {saving ? (
                        <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><Save className="h-4 w-4" /> Synchronize Changes</>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardPageLayout>
  )
}
