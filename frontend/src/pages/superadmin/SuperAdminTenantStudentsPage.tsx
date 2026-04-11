import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, User, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminApi } from '@/services/superAdminApi'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clsx } from 'clsx'

const STATUS_STYLES: Record<string, string> = {
    Active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    Inactive: 'text-slate-500 bg-slate-50 border-slate-200',
}

export default function SuperAdminTenantStudentsPage() {
    const { tenantId } = useParams<{ tenantId: string }>()
    const [students, setStudents] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!tenantId) return
        setLoading(true)
        superAdminApi.getTenantStudents(tenantId)
            .then(r => setStudents(r.data.data.students))
            .catch(() => toast.error('Could not load students'))
            .finally(() => setLoading(false))
    }, [tenantId])

    const filtered = students.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.phone || '').includes(search)
    )

    return (
        <DashboardPageLayout
            title="Students"
            description="Viewing students for this organization"
            actions={
                <Link to={`/super-admin/tenants/${tenantId}`}>
                    <Button variant="outline" className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Tenant
                    </Button>
                </Link>
            }
        >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Search bar */}
                <div className="p-4 border-b border-slate-100">
                    <div className="relative max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or phone..."
                            className="pl-9 h-9 border-slate-200 text-sm"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[560px]">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Class</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Teacher</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                [1, 2, 3, 4].map(i => (
                                    <tr key={i}>
                                        <td colSpan={5} className="px-5 py-3">
                                            <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
                                        </td>
                                    </tr>
                                ))
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                                                <User className="h-6 w-6 text-slate-300" />
                                            </div>
                                            <p className="text-sm font-semibold text-slate-700">
                                                {search ? 'No students match your search' : 'No students enrolled yet'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(s => {
                                    const statusStyle = STATUS_STYLES[s.status] || STATUS_STYLES['Active']
                                    return (
                                        <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-9 w-9 border border-slate-100 shrink-0">
                                                        <AvatarFallback className="bg-blue-50 text-blue-700 text-xs font-bold">
                                                            {s.name.charAt(0)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                                                        <p className="text-xs text-slate-400 font-mono">ID: #{s.id.slice(-4).toUpperCase()}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm text-slate-600">{s.phone || '—'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm text-slate-700">{s.class_name || 'Not assigned'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <p className="text-sm text-slate-600">{s.teacher_name || '—'}</p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={clsx(
                                                    'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                                                    statusStyle
                                                )}>
                                                    {s.status}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-xs text-slate-400">
                            Showing {filtered.length} of {students.length} students
                        </p>
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}
