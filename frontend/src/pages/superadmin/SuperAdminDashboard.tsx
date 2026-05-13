import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
    Building2,
    Users,
    GraduationCap,
    ShieldCheck,
    Plus,
    TrendingUp,
    ScrollText,
    Eye,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    ArrowRightCircle,
    Clock3,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { AxiosError } from 'axios'
import { superAdminApi, type PlatformStats, type Tenant } from '@/services/superAdminApi'
import type { AuditLogEntry, PaginationMeta } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type AuditTag = {
    label: string
    className: string
}

function formatAuditTime(value: string) {
    return new Date(value).toLocaleString()
}

/** Compact stamp for dense table rows (saves horizontal space). */
function formatAuditTimeCompact(value: string) {
    const d = new Date(value)
    return d.toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    })
}

function getMethodBadge(method?: string): AuditTag {
    const key = (method || '').toUpperCase()
    const tones: Record<string, string> = {
        GET: 'bg-blue-50 text-blue-700 border-blue-200',
        POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        PATCH: 'bg-amber-50 text-amber-700 border-amber-200',
        PUT: 'bg-violet-50 text-violet-700 border-violet-200',
        DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
    }
    return {
        label: key || 'N/A',
        className: tones[key] || 'bg-slate-100 text-slate-700 border-slate-200',
    }
}

function getOutcomeTag(statusCode: number | null): AuditTag & { icon: typeof CheckCircle2; description: string } {
    if (statusCode == null) {
        return {
            label: 'Unknown',
            icon: AlertTriangle,
            description: 'No response status captured',
            className: 'bg-slate-100 text-slate-700 border-slate-200',
        }
    }
    if (statusCode >= 200 && statusCode < 300) {
        return {
            label: 'Success',
            icon: CheckCircle2,
            description: 'Request completed successfully',
            className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        }
    }
    if (statusCode >= 300 && statusCode < 400) {
        return {
            label: 'Redirect',
            icon: ArrowRightCircle,
            description: 'Request returned a redirect response',
            className: 'bg-sky-50 text-sky-700 border-sky-200',
        }
    }
    if (statusCode >= 400 && statusCode < 500) {
        return {
            label: 'Client error',
            icon: AlertTriangle,
            description: 'Request failed because of input or authorization',
            className: 'bg-amber-50 text-amber-700 border-amber-200',
        }
    }
    return {
        label: 'Server error',
        icon: XCircle,
        description: 'Request failed inside the backend',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
    }
}

function getRoleTag(role?: string | null): AuditTag {
    const key = (role || 'guest').toLowerCase()
    const tones: Record<string, string> = {
        super_admin: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
        platform_admin: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
        admin: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        teacher: 'bg-orange-50 text-orange-700 border-orange-200',
        student: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        guest: 'bg-slate-100 text-slate-700 border-slate-200',
    }
    return {
        label: key.replace(/_/g, ' '),
        className: tones[key] || 'bg-slate-100 text-slate-700 border-slate-200',
    }
}

function getContextTags(row: AuditLogEntry): AuditTag[] {
    const tags: AuditTag[] = []
    const query = typeof row.metadata?.query === 'string' ? row.metadata.query : ''
    if (row.tenant_id) {
        tags.push({ label: 'Tenant', className: 'bg-violet-50 text-violet-700 border-violet-200' })
    }
    if (row.actor_user_id) {
        tags.push({ label: 'Authed', className: 'bg-blue-50 text-blue-700 border-blue-200' })
    }
    if (query.trim()) {
        tags.push({ label: 'Query', className: 'bg-sky-50 text-sky-700 border-sky-200' })
    }
    if ((row.duration_ms ?? 0) >= 1000) {
        tags.push({ label: 'Slow', className: 'bg-rose-50 text-rose-700 border-rose-200' })
    } else if ((row.duration_ms ?? 0) >= 300) {
        tags.push({ label: 'Busy', className: 'bg-amber-50 text-amber-700 border-amber-200' })
    }
    const path = row.path.toLowerCase()
    if (path.includes('/auth')) {
        tags.push({ label: 'Auth', className: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' })
    } else if (path.includes('/admin')) {
        tags.push({ label: 'Admin', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' })
    } else if (path.includes('/student')) {
        tags.push({ label: 'Student', className: 'bg-cyan-50 text-cyan-700 border-cyan-200' })
    } else if (path.includes('/teacher')) {
        tags.push({ label: 'Teacher', className: 'bg-orange-50 text-orange-700 border-orange-200' })
    }
    return tags
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
            <p className={cn('mt-2 break-all text-sm text-slate-800', mono && 'font-mono text-xs')}>{value || '—'}</p>
        </div>
    )
}

export default function SuperAdminDashboard() {
    const [stats, setStats] = useState<PlatformStats | null>(null)
    const [recentTenants, setRecentTenants] = useState<Tenant[]>([])
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
    const [auditMeta, setAuditMeta] = useState<PaginationMeta | null>(null)
    const [auditPage, setAuditPage] = useState(1)
    const [auditLoading, setAuditLoading] = useState(false)
    const [auditError, setAuditError] = useState<string | null>(null)
    const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchAuditPage = async (page: number) => {
        setAuditLoading(true)
        setAuditError(null)
        try {
            const res = await superAdminApi.getAuditLogs({ page, limit: 50 })
            const rows = res.data.data
            const meta = res.data.meta
            setAuditMeta(meta)
            setAuditPage(page)
            setAuditLogs(rows)
        } catch (error) {
            const ax = error as AxiosError<{ error?: { message?: string } }>
            const message =
                ax.response?.data?.error?.message ||
                'Audit logs are currently unavailable. Stats and tenants are still loaded.'
            setAuditError(message)
            setAuditLogs([])
            setAuditMeta(null)
            toast.error('Failed to load audit logs')
        } finally {
            setAuditLoading(false)
        }
    }

    useEffect(() => {
        const fetchData = async () => {
            const [statsResult, tenantsResult] = await Promise.allSettled([
                superAdminApi.getStats(),
                superAdminApi.getTenants(),
            ])

            if (statsResult.status === 'fulfilled') {
                setStats(statsResult.value.data.data)
            } else {
                toast.error('Failed to load platform stats')
            }

            if (tenantsResult.status === 'fulfilled') {
                setRecentTenants(tenantsResult.value.data.data.tenants.slice(0, 5))
            } else {
                toast.error('Failed to load tenants')
            }

            setLoading(false)
            void fetchAuditPage(1)
        }
        fetchData()
    }, [])

    if (loading) {
        return (
            <DashboardPageLayout title="Platform Dashboard" description="Loading...">
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
            </DashboardPageLayout>
        )
    }

    return (
        <DashboardPageLayout
            title="Platform Dashboard"
            description="Manage all tenants and platform settings"
            className="space-y-2 pb-1 sm:space-y-3 md:space-y-4"
            actions={
                <Link to="/super-admin/tenants" className="w-full sm:w-auto">
                    <Button size="sm" className="h-9 w-full gap-1.5 sm:w-auto">
                        <Plus className="h-3.5 w-3.5" />
                        Create Tenant
                    </Button>
                </Link>
            }
        >
            <div className="space-y-2 md:space-y-4">
                {/* Stats: 3 per row on phone, 5 on large screens */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 lg:grid-cols-5 lg:gap-3">
                    <Card className="border-indigo-200/70 bg-indigo-50/70 shadow-sm">
                        <CardContent className="p-2 sm:p-3 lg:p-4">
                            <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight leading-tight sm:text-[10px] sm:tracking-wider">
                                        Total Tenants
                                    </p>
                                    <p className="text-base font-black text-slate-900 mt-0.5 leading-none sm:text-2xl sm:mt-1 lg:text-3xl">
                                        {stats?.total_tenants ?? 0}
                                    </p>
                                </div>
                                <div className="hidden h-9 w-9 shrink-0 rounded-lg bg-indigo-100 lg:flex items-center justify-center">
                                    <Building2 className="h-5 w-5 text-indigo-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-emerald-200/70 bg-emerald-50/70 shadow-sm">
                        <CardContent className="p-2 sm:p-3 lg:p-4">
                            <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight leading-tight sm:text-[10px] sm:tracking-wider">
                                        Active Tenants
                                    </p>
                                    <p className="text-base font-black text-emerald-600 mt-0.5 leading-none sm:text-2xl sm:mt-1 lg:text-3xl">
                                        {stats?.active_tenants ?? 0}
                                    </p>
                                </div>
                                <div className="hidden h-9 w-9 shrink-0 rounded-lg bg-emerald-100 lg:flex items-center justify-center">
                                    <TrendingUp className="h-5 w-5 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-violet-200/70 bg-violet-50/70 shadow-sm">
                        <CardContent className="p-2 sm:p-3 lg:p-4">
                            <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight leading-tight sm:text-[10px] sm:tracking-wider">
                                        Total Admins
                                    </p>
                                    <p className="text-base font-black text-slate-900 mt-0.5 leading-none sm:text-2xl sm:mt-1 lg:text-3xl">
                                        {stats?.total_admins ?? 0}
                                    </p>
                                </div>
                                <div className="hidden h-9 w-9 shrink-0 rounded-lg bg-violet-100 lg:flex items-center justify-center">
                                    <ShieldCheck className="h-5 w-5 text-violet-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-amber-200/70 bg-amber-50/70 shadow-sm">
                        <CardContent className="p-2 sm:p-3 lg:p-4">
                            <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight leading-tight sm:text-[10px] sm:tracking-wider">
                                        Total Teachers
                                    </p>
                                    <p className="text-base font-black text-slate-900 mt-0.5 leading-none sm:text-2xl sm:mt-1 lg:text-3xl">
                                        {stats?.total_teachers ?? 0}
                                    </p>
                                </div>
                                <div className="hidden h-9 w-9 shrink-0 rounded-lg bg-amber-100 lg:flex items-center justify-center">
                                    <Users className="h-5 w-5 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-200/70 bg-blue-50/70 shadow-sm">
                        <CardContent className="p-2 sm:p-3 lg:p-4">
                            <div className="flex items-center justify-between gap-1">
                                <div className="min-w-0">
                                    <p className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight leading-tight sm:text-[10px] sm:tracking-wider">
                                        Total Students
                                    </p>
                                    <p className="text-base font-black text-slate-900 mt-0.5 leading-none sm:text-2xl sm:mt-1 lg:text-3xl">
                                        {stats?.total_students ?? 0}
                                    </p>
                                </div>
                                <div className="hidden h-9 w-9 shrink-0 rounded-lg bg-blue-100 lg:flex items-center justify-center">
                                    <GraduationCap className="h-5 w-5 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Tenants */}
                <Card className="rounded-lg border-slate-200/60 shadow-sm">
                    <CardHeader className="space-y-0 border-b border-slate-100 p-2 sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-bold sm:text-base">Recent Tenants</CardTitle>
                            <Link to="/super-admin/tenants">
                                <Button variant="ghost" size="sm" className="min-h-0 h-7 px-2 text-xs">
                                    View All
                                </Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {recentTenants.length === 0 ? (
                                <div className="p-5 text-center text-sm text-slate-500 sm:p-6">
                                    No tenants yet. Create your first tenant to get started.
                                </div>
                            ) : (
                                recentTenants.map((tenant) => (
                                    <Link
                                        key={tenant.id}
                                        to={`/super-admin/tenants/${tenant.id}`}
                                        className="flex items-center justify-between gap-2 p-2 hover:bg-slate-50 transition-colors sm:p-2.5"
                                    >
                                        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-100 sm:h-8 sm:w-8 sm:rounded-lg">
                                                <Building2 className="h-3.5 w-3.5 text-indigo-600 sm:h-4 sm:w-4" />
                                            </div>
                                            <div className="min-w-0 leading-tight">
                                                <p className="truncate text-xs font-semibold text-slate-900 sm:text-sm">{tenant.name}</p>
                                                <p className="truncate text-[11px] text-slate-500 sm:text-xs">{tenant.slug}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2 text-[11px] sm:gap-3 sm:text-xs">
                                            <div className="text-center">
                                                <p className="font-bold text-slate-900">{tenant.admin_count ?? 0}</p>
                                                <p className="text-[10px] text-slate-500 sm:text-xs">Admins</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="font-bold text-slate-900">{tenant.student_count ?? 0}</p>
                                                <p className="text-[10px] text-slate-500 sm:text-xs">Students</p>
                                            </div>
                                            <span
                                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:py-1 sm:text-xs ${
                                                    tenant.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                }`}
                                            >
                                                {tenant.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* API audit trail (7-day hot table only) */}
                <Card className="rounded-lg border-slate-200/60 shadow-sm">
                    <CardHeader className="space-y-0 border-b border-slate-100 p-2 sm:p-3">
                        <div className="flex items-start justify-between gap-2 sm:items-center sm:gap-2">
                            <div className="flex min-w-0 items-start gap-1.5 sm:gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-100 via-violet-100 to-sky-100 sm:h-8 sm:w-8 sm:rounded-lg">
                                    <ScrollText className="h-3.5 w-3.5 text-indigo-700 sm:h-4 sm:w-4" />
                                </div>
                                <div className="min-w-0 leading-tight">
                                    <CardTitle className="text-sm font-bold sm:text-base">System audit log</CardTitle>
                                    <p className="mt-0 text-[10px] leading-snug text-slate-500 sm:text-xs">
                                        Last 7 days of API requests (older rows archived; not shown).
                                    </p>
                                </div>
                            </div>
                            {auditMeta && (
                                <span className="shrink-0 text-[10px] font-semibold text-slate-400 sm:text-xs">
                                    {auditMeta.total} events
                                </span>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {auditError ? (
                            <div className="border-b border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 sm:px-4 sm:text-sm">
                                {auditError}
                            </div>
                        ) : null}
                        <div className="max-h-[min(56vh,560px)] overflow-x-auto overflow-y-auto sm:max-h-[min(62vh,600px)]">
                            <table className="w-full min-w-[720px] border-collapse text-left text-[11px] leading-tight sm:min-w-[960px] sm:text-xs">
                                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                                    <tr>
                                        <th className="whitespace-nowrap px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 sm:px-2 sm:text-[9px]">
                                            Time
                                        </th>
                                        <th className="px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 sm:px-2 sm:text-[9px]">
                                            Method
                                        </th>
                                        <th className="px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 sm:px-2 sm:text-[9px]">
                                            Path
                                        </th>
                                        <th className="hidden px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 md:table-cell sm:px-2 sm:text-[9px]">
                                            Outcome
                                        </th>
                                        <th className="hidden px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 lg:table-cell sm:px-2 sm:text-[9px]">
                                            Role
                                        </th>
                                        <th className="hidden px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 xl:table-cell sm:px-2 sm:text-[9px]">
                                            Tags
                                        </th>
                                        <th className="hidden px-1.5 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-400 lg:table-cell sm:px-2 sm:text-[9px]">
                                            ms
                                        </th>
                                        <th className="px-1.5 py-1 text-right text-[8px] font-bold uppercase tracking-wide text-slate-400 sm:px-2 sm:text-[9px]">
                                            Trail
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 [&_td]:align-middle">
                                    {auditLogs.length === 0 && !auditLoading ? (
                                        <tr>
                                            <td colSpan={8} className="px-3 py-6 text-center text-slate-500 text-xs sm:py-8 sm:text-sm">
                                                No audit entries yet. Apply migration <code className="text-xs bg-slate-100 px-1 rounded">024_audit_logs.sql</code> and traffic will appear here.
                                            </td>
                                        </tr>
                                    ) : (
                                        auditLogs.map((row) => {
                                            const methodBadge = getMethodBadge(row.http_method)
                                            const outcomeTag = getOutcomeTag(row.status_code)
                                            const roleTag = getRoleTag(row.actor_role)
                                            const contextTags = getContextTags(row)
                                            const OutcomeIcon = outcomeTag.icon
                                            return (
                                            <tr
                                                key={row.id}
                                                className="cursor-pointer hover:bg-slate-50/80 focus-within:bg-slate-50/80"
                                                onClick={() => setSelectedAuditLog(row)}
                                            >
                                                <td className="whitespace-nowrap px-1.5 py-0.5 font-mono text-[10px] leading-none text-slate-600 sm:px-2 sm:text-[11px]" title={formatAuditTime(row.occurred_at)}>
                                                    {formatAuditTimeCompact(row.occurred_at)}
                                                </td>
                                                <td className="px-1.5 py-0.5 sm:px-2">
                                                    <span className={cn('inline-flex rounded border px-1 py-px text-[8px] font-bold uppercase leading-none sm:text-[9px]', methodBadge.className)}>
                                                        {row.http_method}
                                                    </span>
                                                </td>
                                                <td className="max-w-[40vw] truncate px-1.5 py-0.5 text-[10px] leading-none text-slate-800 sm:max-w-[280px] sm:px-2 sm:text-[11px] md:max-w-[320px]" title={row.path}>
                                                    {row.path}
                                                </td>
                                                <td className="hidden px-1.5 py-0.5 md:table-cell sm:px-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className={cn('inline-flex items-center gap-0.5 rounded-full border px-1 py-px text-[8px] font-bold leading-none sm:gap-1 sm:px-1.5 sm:text-[9px]', outcomeTag.className)}>
                                                            <OutcomeIcon className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                                                            {outcomeTag.label}
                                                        </span>
                                                        <span className="font-mono text-[9px] text-slate-500 sm:text-[10px]">{row.status_code ?? '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="hidden px-1.5 py-0.5 lg:table-cell sm:px-2">
                                                    <span className={cn('inline-flex rounded-full border px-1.5 py-px text-[8px] font-bold capitalize leading-none sm:text-[9px]', roleTag.className)}>
                                                        {roleTag.label}
                                                    </span>
                                                </td>
                                                <td className="hidden px-1.5 py-0.5 xl:table-cell sm:px-2">
                                                    <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                                        {contextTags.length ? contextTags.slice(0, 3).map((tag) => (
                                                            <span
                                                                key={`${row.id}-${tag.label}`}
                                                                className={cn('inline-flex rounded-full border px-1 py-px text-[8px] font-semibold leading-none sm:px-1.5 sm:text-[9px]', tag.className)}
                                                            >
                                                                {tag.label}
                                                            </span>
                                                        )) : (
                                                            <span className="text-[9px] text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="hidden px-1.5 py-0.5 text-slate-500 lg:table-cell sm:px-2">
                                                    <span className={cn(
                                                        'inline-flex items-center gap-0.5 rounded-full px-1 py-px text-[8px] font-medium leading-none sm:gap-1 sm:px-1.5 sm:text-[9px]',
                                                        (row.duration_ms ?? 0) >= 1000
                                                            ? 'bg-rose-50 text-rose-700'
                                                            : (row.duration_ms ?? 0) >= 300
                                                                ? 'bg-amber-50 text-amber-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                    )}>
                                                        <Clock3 className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                                                        {row.duration_ms ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-1.5 py-0.5 text-right sm:px-2">
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-6 items-center gap-0.5 rounded px-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100 sm:h-7 sm:gap-1 sm:px-1.5 sm:text-xs"
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            setSelectedAuditLog(row)
                                                        }}
                                                    >
                                                        <Eye className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" />
                                                        <span className="hidden sm:inline">Details</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        )})
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {auditMeta ? (
                            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1.5 sm:px-2.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-h-0 h-7 gap-0.5 px-2 text-[11px]"
                                    disabled={auditLoading || auditPage <= 1}
                                    onClick={() => void fetchAuditPage(Math.max(1, auditPage - 1))}
                                >
                                    <ChevronLeft className="h-3 w-3" />
                                    Prev
                                </Button>
                                <span className="text-center text-[10px] font-semibold text-slate-500">
                                    P{auditPage} · {auditLogs.length}/50
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="min-h-0 h-7 gap-0.5 px-2 text-[11px]"
                                    disabled={auditLoading || !auditMeta.has_more}
                                    onClick={() => void fetchAuditPage(auditPage + 1)}
                                >
                                    Next
                                    <ChevronRight className="h-3 w-3" />
                                </Button>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={!!selectedAuditLog} onOpenChange={(open) => !open && setSelectedAuditLog(null)}>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto border-slate-200 p-0">
                    {selectedAuditLog ? (
                        <>
                            <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-indigo-50 to-sky-50 px-6 py-5">
                                <DialogTitle className="text-left text-xl font-black text-slate-900">
                                    Audit Trail Details
                                </DialogTitle>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {(() => {
                                        const methodBadge = getMethodBadge(selectedAuditLog.http_method)
                                        const outcomeTag = getOutcomeTag(selectedAuditLog.status_code)
                                        const roleTag = getRoleTag(selectedAuditLog.actor_role)
                                        const OutcomeIcon = outcomeTag.icon
                                        return (
                                            <>
                                                <Badge className={cn('border', methodBadge.className)}>{methodBadge.label}</Badge>
                                                <Badge className={cn('border', outcomeTag.className)}>
                                                    <OutcomeIcon className="mr-1 h-3 w-3" />
                                                    {outcomeTag.label}
                                                </Badge>
                                                <Badge className={cn('border capitalize', roleTag.className)}>{roleTag.label}</Badge>
                                            </>
                                        )
                                    })()}
                                    {getContextTags(selectedAuditLog).map((tag) => (
                                        <Badge key={`detail-${tag.label}`} className={cn('border', tag.className)}>
                                            {tag.label}
                                        </Badge>
                                    ))}
                                </div>
                                <p className="mt-4 text-left text-sm text-slate-600">{selectedAuditLog.path}</p>
                            </DialogHeader>

                            <div className="space-y-6 px-6 py-6">
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    <DetailItem label="Occurred At" value={formatAuditTime(selectedAuditLog.occurred_at)} />
                                    <DetailItem label="Status Code" value={selectedAuditLog.status_code != null ? String(selectedAuditLog.status_code) : '—'} mono />
                                    <DetailItem label="Duration" value={selectedAuditLog.duration_ms != null ? `${selectedAuditLog.duration_ms} ms` : '—'} mono />
                                    <DetailItem label="Actor Role" value={selectedAuditLog.actor_role || '—'} />
                                    <DetailItem label="Actor User ID" value={selectedAuditLog.actor_user_id || '—'} mono />
                                    <DetailItem label="Tenant ID" value={selectedAuditLog.tenant_id || '—'} mono />
                                    <DetailItem label="Client IP" value={selectedAuditLog.client_ip || '—'} mono />
                                    <DetailItem label="Trail ID" value={selectedAuditLog.id} mono />
                                    <DetailItem label="Method" value={selectedAuditLog.http_method} mono />
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">User Agent</p>
                                        <p className="mt-3 break-words text-sm leading-6 text-slate-700">
                                            {selectedAuditLog.user_agent || '—'}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Request Query</p>
                                        <p className="mt-3 break-all text-sm text-slate-700">
                                            {typeof selectedAuditLog.metadata?.query === 'string' && selectedAuditLog.metadata.query.trim()
                                                ? selectedAuditLog.metadata.query
                                                : 'No query string captured'}
                                        </p>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-slate-50">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Metadata JSON</p>
                                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-slate-200">
                                        {JSON.stringify(selectedAuditLog.metadata ?? {}, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </DashboardPageLayout>
    )
}
