import { ShieldCheck, Database, Bell, Globe } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export default function AdminSettingsPage() {
  const { user } = useAuthStore()

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">Settings</h1>
        <p className="text-sm text-ink-muted mt-0.5">Organization and security configuration</p>
      </div>

      {/* Org info */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="stat-icon bg-violet-50 text-violet-600"><Globe className="w-5 h-5" /></div>
          <h2 className="font-semibold text-sm text-ink">Organization</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Admin account</span>
            <span className="font-medium text-ink">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Tenant ID</span>
            <span className="font-mono text-xs text-ink-faint">{user?.tenant_id}</span>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="stat-icon bg-emerald-50 text-emerald-600"><ShieldCheck className="w-5 h-5" /></div>
          <h2 className="font-semibold text-sm text-ink">Security</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">TOTP MFA</span>
            <span className="badge badge-green">Enabled</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Session TTL</span>
            <span className="text-ink">8 hours</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Data isolation</span>
            <span className="badge badge-green">RLS active</span>
          </div>
        </div>
      </div>

      {/* Audit logs */}
      <div className="card mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="stat-icon bg-blue-50 text-blue-600"><Database className="w-5 h-5" /></div>
          <h2 className="font-semibold text-sm text-ink">Audit Logs</h2>
        </div>
        <p className="text-xs text-ink-muted">
          All admin actions are logged automatically. View them directly in your Supabase dashboard
          under <span className="font-mono bg-surface-alt px-1 rounded">audit_logs</span> table.
        </p>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="stat-icon bg-amber-50 text-amber-600"><Bell className="w-5 h-5" /></div>
          <h2 className="font-semibold text-sm text-ink">WhatsApp Notifications</h2>
        </div>
        <p className="text-xs text-ink-muted mb-3">
          Automated WhatsApp reminders (class starts, daily nudge) are a post-launch feature.
          Configure your Twilio/Interakt integration once the core platform is live.
        </p>
        <span className="badge badge-amber">Post-launch</span>
      </div>
    </div>
  )
}
