import { ShieldCheck, Database, Bell, Globe, Mail, Fingerprint, Lock, Shield } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default function AdminSettingsPage() {
  const { user } = useAuthStore()

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
              <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] px-2">Enabled</Badge>
            </div>
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

        {/* Logging & Auditing */}
        <Card className="border-slate-200/60 bg-white/50 backdrop-blur-sm shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Audit Logs</CardTitle>
              <CardDescription>Event tracking and history</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
              "All administrative actions are captured automatically. Detailed logs are available in the Supabase Cloud console under the system observability module."
            </p>
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
    </DashboardPageLayout>
  )
}
