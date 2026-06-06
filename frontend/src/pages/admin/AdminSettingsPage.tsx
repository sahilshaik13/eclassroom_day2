import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, Bell, Globe, Mail, Fingerprint, Lock, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/services/authApi'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function AdminSettingsPage() {
  const { user, setSession, accessToken, refreshToken } = useAuthStore()
  const navigate = useNavigate()
  const [disableMfaOpen, setDisableMfaOpen] = useState(false)
  const [disablingMfa, setDisablingMfa] = useState(false)

  useEffect(() => {
    const refreshStatus = async () => {
      try {
        const response = await authApi.getUserStatus()
        if (response.data.success && accessToken && refreshToken) {
          setSession(response.data.data, accessToken, refreshToken)
        }
      } catch {
        /* keep cached user */
      }
    }
    void refreshStatus()
  }, [])

  const handleEnableMFA = () => {
    navigate('/auth/mfa-setup')
  }

  const confirmDisableMFA = async () => {
    setDisablingMfa(true)
    try {
      await authApi.mfaUnenroll()
      if (user && accessToken && refreshToken) {
        setSession({ ...user, mfa_enabled: false }, accessToken, refreshToken)
      }
      setDisableMfaOpen(false)
      toast.success('Two-factor authentication has been disabled.')
    } catch {
      toast.error('Failed to disable MFA. Please try again.')
    } finally {
      setDisablingMfa(false)
    }
  }

  return (
    <DashboardPageLayout
      title="System Settings"
      description="Configure organization rules, security policies, and notification preferences."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {/* Organization Information */}
        <Card className="border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Organization</CardTitle>
              <CardDescription>Core identity and account details</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Admin Account
              </span>
              <span className="text-sm font-semibold text-slate-900">{user?.email}</span>
            </div>
            <div className="flex flex-col gap-1 pt-2 border-t border-slate-50">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Fingerprint className="h-3 w-3" /> Tenant ID
              </span>
              <span className="text-xs font-mono text-slate-400 truncate bg-slate-50 p-1.5 rounded">{user?.tenant_id}</span>
            </div>
          </CardContent>
        </Card>

        {/* Security & Access Control */}
        <Card className="border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Security</CardTitle>
              <CardDescription>Access control and data protection</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-700">Multi-factor Auth</span>
              </div>
              <Badge
                variant="default"
                className={
                  user?.mfa_enabled
                    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-2'
                    : 'bg-slate-100 text-slate-600 border-slate-200 text-[10px] px-2'
                }
              >
                {user?.mfa_enabled ? 'Enabled' : 'Not enabled'}
              </Badge>
            </div>
            {user?.mfa_enabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisableMfaOpen(true)}
                className="w-full rounded-xl border-rose-200 bg-rose-50/50 h-9 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-500 hover:text-white"
              >
                Disable MFA Protection
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={handleEnableMFA}
                className="w-full rounded-xl border-violet-200 bg-violet-50/50 h-9 text-[10px] font-bold uppercase tracking-wider text-violet-700 hover:bg-violet-600 hover:text-white"
              >
                Enable MFA Protection
              </Button>
            )}
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-700">Data Isolation</span>
              </div>
              <Badge variant="default" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] px-2">RLS Active</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors pt-1">
              <span className="text-sm text-slate-500">Session Timeout</span>
              <span className="text-sm font-medium text-slate-900">8 Hours</span>
            </div>
          </CardContent>
        </Card>

        {/* Communication Channels */}
        <Card className="border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">WhatsApp Channel</CardTitle>
              <CardDescription>Automated mobile notifications</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                Connect your Twilio or Interakt integration to enable real-time student updates and class reminders.
              </p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="bg-amber-500/5 text-amber-600 border-amber-500/10 text-[10px]">Post-launch Roadmap</Badge>
                <Button variant="ghost" size="sm" className="text-xs h-7">Contact Dev</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={disableMfaOpen} onOpenChange={(open) => !disablingMfa && setDisableMfaOpen(open)}>
        <DialogContent className="max-w-md rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Disable two-factor authentication?</DialogTitle>
            <DialogDescription className="text-left text-slate-600">
              Your admin account will be less secure. You may be prompted to set up MFA again on your
              next sign-in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={disablingMfa}
              onClick={() => setDisableMfaOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={disablingMfa}
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => void confirmDisableMFA()}
            >
              {disablingMfa ? 'Disabling…' : 'Disable MFA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageLayout>
  )
}
