import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Search, User, Users, ArrowLeft, GraduationCap } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminApi } from '@/services/superAdminApi'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clsx } from 'clsx'

export default function SuperAdminTenantTeachersPage() {
    const { tenantId } = useParams<{ tenantId: string }>()
    const [teachers, setTeachers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!tenantId) return
        setLoading(true)
        superAdminApi.getTenantTeachers(tenantId)
            .then(r => setTeachers(r.data.data.teachers))
            .catch(() => toast.error('Could not load teachers'))
            .finally(() => setLoading(false))
    }, [tenantId])

    const filtered = teachers.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <DashboardPageLayout
            title="Teachers"
            description={`Viewing teachers for this organization`}
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
                            placeholder="Search teachers..."
                            className="pl-9 h-9 border-slate-200 text-sm"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[560px]">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Teacher</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Classes</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Students</th>
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
                                                {search ? 'No teachers match your search' : 'No teachers registered yet'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <Avatar className="h-9 w-9 border border-slate-100 shrink-0">
                                                    <AvatarFallback className="bg-violet-50 text-violet-700 text-xs font-bold">
                                                        {t.name.charAt(0)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                                                    <p className="text-xs text-slate-400">Joined {new Date(t.created_at).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600">{t.email}</td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-700">
                                                <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                                                {t.class_count ?? 0}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-1.5 text-sm text-slate-700">
                                                <Users className="h-3.5 w-3.5 text-slate-400" />
                                                {t.student_count ?? 0}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={clsx(
                                                'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                                                t.is_active
                                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                                    : 'text-slate-500 bg-slate-50 border-slate-200'
                                            )}>
                                                {t.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                        <p className="text-xs text-slate-400">
                            Showing {filtered.length} of {teachers.length} teachers
                        </p>
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}
