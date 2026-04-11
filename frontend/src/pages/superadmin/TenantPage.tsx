import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus, Search, ToggleLeft, ToggleRight, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { superAdminApi, type Tenant } from '@/services/superAdminApi'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

const createTenantSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    slug: z.string().min(2, 'Slug must be at least 2 characters').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
    admin_name: z.string().min(2, 'Admin name must be at least 2 characters'),
    admin_email: z.string().email('Enter a valid admin email'),
})
type CreateTenantForm = z.infer<typeof createTenantSchema>

export default function TenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [creating, setCreating] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTenantForm>({
        resolver: zodResolver(createTenantSchema),
    })

    const fetchTenants = async () => {
        try {
            const res = await superAdminApi.getTenants()
            setTenants(res.data.data.tenants)
        } catch (e) {
            toast.error('Failed to load tenants')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTenants()
    }, [])

    const onCreateTenant = async (data: CreateTenantForm) => {
        setCreating(true)
        try {
            await superAdminApi.createTenant(data)
            toast.success('Tenant created successfully')
            setShowCreateDialog(false)
            reset()
            fetchTenants()
        } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || 'Failed to create tenant')
        } finally {
            setCreating(false)
        }
    }

    const toggleTenant = async (tenant: Tenant) => {
        setTogglingId(tenant.id)
        try {
            await superAdminApi.updateTenant(tenant.id, { is_active: !tenant.is_active })
            toast.success(`Tenant ${tenant.is_active ? 'deactivated' : 'activated'}`)
            fetchTenants()
        } catch (e) {
            toast.error('Failed to update tenant')
        } finally {
            setTogglingId(null)
        }
    }

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase())
    )

    if (loading) {
        return (
            <DashboardPageLayout title="Tenants" description="Loading...">
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
            </DashboardPageLayout>
        )
    }

    return (
        <DashboardPageLayout
            title="Tenants"
            description="Manage all platform tenants"
            actions={
                <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
                            Create Tenant
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Tenant</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit(onCreateTenant)} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium text-slate-700">Tenant Name</label>
                                <Input
                                    {...register('name')}
                                    placeholder="Al-Noor Islamic Center"
                                    className="mt-1"
                                />
                                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Slug (URL identifier)</label>
                                <Input
                                    {...register('slug')}
                                    placeholder="al-noor"
                                    className="mt-1"
                                />
                                {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug.message}</p>}
                            </div>

                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Primary Administrator</h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-slate-700">Admin Name</label>
                                        <Input
                                            {...register('admin_name')}
                                            placeholder="Omar Zahid"
                                            className="mt-1"
                                        />
                                        {errors.admin_name && <p className="text-xs text-red-500 mt-1">{errors.admin_name.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700">Admin Email</label>
                                        <Input
                                            {...register('admin_email')}
                                            type="email"
                                            placeholder="admin@alnoor.com"
                                            className="mt-1"
                                        />
                                        {errors.admin_email && <p className="text-xs text-red-500 mt-1">{errors.admin_email.message}</p>}
                                    </div>
                                    <p className="text-[10px] text-slate-400 italic">
                                        This user will be invited to set up the organization's dashboard.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={creating}>
                                    {creating ? 'Creating...' : 'Create Tenant'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            }
        >
            <div className="space-y-6">
                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search tenants..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Tenants Table */}
                <Card className="border-slate-200/60 shadow-lg">
                    <CardHeader className="border-b border-slate-100">
                        <CardTitle className="text-lg font-bold">All Tenants ({filteredTenants.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {filteredTenants.length === 0 ? (
                            <div className="p-8 text-center text-slate-500">
                                {search ? 'No tenants match your search.' : 'No tenants yet. Create your first tenant.'}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredTenants.map((tenant) => (
                                    <div
                                        key={tenant.id}
                                        className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                <Building2 className="h-6 w-6 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900">{tenant.name}</p>
                                                <p className="text-sm text-slate-500">{tenant.slug}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="grid grid-cols-2 gap-6 text-center">
                                                <div>
                                                    <p className="font-bold text-slate-900">{tenant.teacher_count ?? 0}</p>
                                                    <p className="text-xs text-slate-500">Teachers</p>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900">{tenant.student_count ?? 0}</p>
                                                    <p className="text-xs text-slate-500">Students</p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => toggleTenant(tenant)}
                                                disabled={togglingId === tenant.id}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${tenant.is_active
                                                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {togglingId === tenant.id ? (
                                                    <div className="w-4 h-4 border-2 border-current/20 border-t-current rounded-full animate-spin" />
                                                ) : tenant.is_active ? (
                                                    <ToggleRight className="h-4 w-4" />
                                                ) : (
                                                    <ToggleLeft className="h-4 w-4" />
                                                )}
                                                {tenant.is_active ? 'Active' : 'Inactive'}
                                            </button>

                                            <Link to={`/super-admin/tenants/${tenant.id}`}>
                                                <Button variant="ghost" size="sm" className="gap-1">
                                                    Details <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardPageLayout>
    )
}
