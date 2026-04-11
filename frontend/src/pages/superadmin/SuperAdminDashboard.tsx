import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Users, GraduationCap, ShieldCheck, Plus, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { superAdminApi, type PlatformStats, type Tenant } from '@/services/superAdminApi'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SuperAdminDashboard() {
    const [stats, setStats] = useState<PlatformStats | null>(null)
    const [recentTenants, setRecentTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsRes, tenantsRes] = await Promise.all([
                    superAdminApi.getStats(),
                    superAdminApi.getTenants(),
                ])
                setStats(statsRes.data.data)
                setRecentTenants(tenantsRes.data.data.tenants.slice(0, 5))
            } catch (e) {
                toast.error('Failed to load dashboard data')
            } finally {
                setLoading(false)
            }
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
            actions={
                <Link to="/super-admin/tenants">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create Tenant
                    </Button>
                </Link>
            }
        >
            <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                    <Card className="border-slate-200/60 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tenants</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{stats?.total_tenants ?? 0}</p>
                                </div>
                                <div className="h-12 w-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                                    <Building2 className="h-6 w-6 text-indigo-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/60 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Tenants</p>
                                    <p className="text-3xl font-black text-emerald-600 mt-1">{stats?.active_tenants ?? 0}</p>
                                </div>
                                <div className="h-12 w-12 bg-emerald-100 rounded-2xl flex items-center justify-center">
                                    <TrendingUp className="h-6 w-6 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/60 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Admins</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{stats?.total_admins ?? 0}</p>
                                </div>
                                <div className="h-12 w-12 bg-violet-100 rounded-2xl flex items-center justify-center">
                                    <ShieldCheck className="h-6 w-6 text-violet-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/60 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Teachers</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{stats?.total_teachers ?? 0}</p>
                                </div>
                                <div className="h-12 w-12 bg-amber-100 rounded-2xl flex items-center justify-center">
                                    <Users className="h-6 w-6 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/60 shadow-lg">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Students</p>
                                    <p className="text-3xl font-black text-slate-900 mt-1">{stats?.total_students ?? 0}</p>
                                </div>
                                <div className="h-12 w-12 bg-blue-100 rounded-2xl flex items-center justify-center">
                                    <GraduationCap className="h-6 w-6 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Tenants */}
                <Card className="border-slate-200/60 shadow-lg">
                    <CardHeader className="border-b border-slate-100">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-bold">Recent Tenants</CardTitle>
                            <Link to="/super-admin/tenants">
                                <Button variant="ghost" size="sm">View All</Button>
                            </Link>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100">
                            {recentTenants.length === 0 ? (
                                <div className="p-8 text-center text-slate-500">
                                    No tenants yet. Create your first tenant to get started.
                                </div>
                            ) : (
                                recentTenants.map((tenant) => (
                                    <Link
                                        key={tenant.id}
                                        to={`/super-admin/tenants/${tenant.id}`}
                                        className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                <Building2 className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900">{tenant.name}</p>
                                                <p className="text-sm text-slate-500">{tenant.slug}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 text-sm">
                                            <div className="text-center">
                                                <p className="font-bold text-slate-900">{tenant.admin_count ?? 0}</p>
                                                <p className="text-xs text-slate-500">Admins</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="font-bold text-slate-900">{tenant.student_count ?? 0}</p>
                                                <p className="text-xs text-slate-500">Students</p>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tenant.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {tenant.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </Link>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardPageLayout>
    )
}
