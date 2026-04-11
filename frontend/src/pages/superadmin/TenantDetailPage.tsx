import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Building2, Plus, ArrowLeft, ShieldCheck, Mail, GraduationCap, Users, Trash2, AlertTriangle, Power } from 'lucide-react'
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

const createAdminSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email'),
})
type CreateAdminForm = z.infer<typeof createAdminSchema>

export default function TenantDetailPage() {
    const { tenantId } = useParams<{ tenantId: string }>()
    const navigate = useNavigate()
    const [tenant, setTenant] = useState<Tenant | null>(null)
    const [loading, setLoading] = useState(true)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const [creating, setCreating] = useState(false)
    const [togglingTenant, setTogglingTenant] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateAdminForm>({
        resolver: zodResolver(createAdminSchema),
    })

    const fetchData = async () => {
        if (!tenantId) return
        try {
            const res = await superAdminApi.getTenant(tenantId)
            setTenant(res.data.data.tenant)
        } catch (e) {
            toast.error('Failed to load tenant data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [tenantId])

    const onCreateAdmin = async (data: CreateAdminForm) => {
        if (!tenantId) return
        setCreating(true)
        try {
            await superAdminApi.createAdmin(tenantId, data)
            toast.success('Admin invited successfully')
            setShowCreateDialog(false)
            reset()
            fetchData()
        } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || 'Failed to create admin')
        } finally {
            setCreating(false)
        }
    }

    const toggleTenant = async () => {
        if (!tenant || !tenantId) return
        setTogglingTenant(true)
        try {
            await superAdminApi.updateTenant(tenantId, { is_active: !tenant.is_active })
            toast.success(`Organization ${tenant.is_active ? 'suspended' : 'activated'} successfully`)
            fetchData()
        } catch (e) {
            toast.error('Failed to update organization status')
        } finally {
            setTogglingTenant(false)
        }
    }

    const handleDelete = async () => {
        if (!tenantId) return
        setDeleting(true)
        try {
            await superAdminApi.deleteTenant(tenantId)
            toast.success('Organization permanently deleted')
            navigate('/super-admin/tenants')
        } catch (e: any) {
            toast.error(e?.response?.data?.error?.message || 'Failed to delete organization')
            setShowDeleteDialog(false)
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <DashboardPageLayout title="Tenant Details" description="Loading...">
                <div className="flex items-center justify-center h-64">
                    <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                </div>
            </DashboardPageLayout>
        )
    }

    if (!tenant) {
        return (
            <DashboardPageLayout title="Tenant Not Found" description="">
                <div className="text-center py-12">
                    <p className="text-slate-500">The requested tenant was not found.</p>
                    <Link to="/super-admin/tenants">
                        <Button variant="outline" className="mt-4">Back to Tenants</Button>
                    </Link>
                </div>
            </DashboardPageLayout>
        )
    }

    return (
        <DashboardPageLayout
            title={tenant.name}
            description={`Slug: ${tenant.slug}`}
            actions={
                <div className="flex items-center gap-3">
                    <Link to="/super-admin/tenants">
                        <Button variant="outline" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                    </Link>

                    {/* Enable / Disable Toggle */}
                    {tenant && (
                        <Button
                            variant="outline"
                            className={`gap-2 ${tenant.is_active
                                ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}
                            onClick={toggleTenant}
                            disabled={togglingTenant}
                        >
                            <Power className="h-4 w-4" />
                            {togglingTenant ? 'Updating...' : tenant.is_active ? 'Suspend Org' : 'Activate Org'}
                        </Button>
                    )}

                    {/* Delete Button */}
                    <Button
                        variant="outline"
                        className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => setShowDeleteDialog(true)}
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete
                    </Button>

                    {/* Legacy: Set Admin (only if no admin yet) */}
                    {!tenant?.admin && (
                        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                            <DialogTrigger asChild>
                                <Button className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Set Primary Admin
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Set Organization Manager</DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleSubmit(onCreateAdmin)} className="space-y-4 mt-4">
                                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-[10px] text-amber-700 leading-relaxed mb-4">
                                        Legacy tenants without a primary admin must have one set to manage the platform.
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700">Admin Name</label>
                                        <Input
                                            {...register('name')}
                                            placeholder="John Smith"
                                            className="mt-1"
                                        />
                                        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-slate-700">Email Address</label>
                                        <Input
                                            {...register('email')}
                                            type="email"
                                            placeholder="admin@example.com"
                                            className="mt-1"
                                        />
                                        {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        An invitation email will be sent to set up their account.
                                    </p>
                                    <div className="flex justify-end gap-3 pt-4">
                                        <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                                            Cancel
                                        </Button>
                                        <Button type="submit" disabled={creating}>
                                            {creating ? 'Sending Invite...' : 'Send Invite'}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}

                    {/* Delete Confirmation Dialog */}
                    <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-red-600">
                                    <AlertTriangle className="h-5 w-5" />
                                    Delete Organization
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 mt-2">
                                <p className="text-sm text-slate-600">
                                    You are about to <strong>permanently delete</strong> <span className="font-bold text-slate-900">{tenant?.name}</span> and all associated data:
                                </p>
                                <ul className="text-sm text-slate-500 list-disc list-inside space-y-1 bg-red-50 border border-red-100 rounded-lg p-4">
                                    <li>All teachers and their accounts</li>
                                    <li>All students and their records</li>
                                    <li>All classes and enrollments</li>
                                    <li>All teacher applications</li>
                                </ul>
                                <p className="text-xs font-bold text-red-600 uppercase tracking-widest">This action cannot be undone.</p>
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                                <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-red-600 hover:bg-red-700 text-white gap-2"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {deleting ? 'Deleting...' : 'Delete Permanently'}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            }
        >
            <div className="space-y-8">
                {/* Tenant Info Card */}
                <Card className="border-slate-200/60 shadow-lg">
                    <CardContent className="p-0">
                        <div className="p-6">
                            <div className="flex items-center gap-6">
                                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${tenant.is_active ? 'bg-indigo-100' : 'bg-red-100'}`}>
                                    <Building2 className={`h-8 w-8 ${tenant.is_active ? 'text-indigo-600' : 'text-red-600'}`} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h2 className={`text-2xl font-black ${tenant.is_active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{tenant.name}</h2>
                                        {!tenant.is_active && (
                                            <span className="px-2.5 py-1 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-widest rounded flex items-center gap-1.5">
                                                <AlertTriangle className="h-3 w-3" />
                                                Suspended
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-slate-500">/{tenant.slug}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-8 text-center mr-6">
                                    <div className={!tenant.is_active ? 'opacity-50' : ''}>
                                        <p className="text-2xl font-black text-slate-900">{tenant.teacher_count ?? 0}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Teachers</p>
                                    </div>
                                    <div className={!tenant.is_active ? 'opacity-50' : ''}>
                                        <p className="text-2xl font-black text-slate-900">{tenant.student_count ?? 0}</p>
                                        <p className="text-xs text-slate-500 uppercase tracking-wider">Students</p>
                                    </div>
                                </div>
                                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${tenant.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                                    {tenant.is_active ? 'Active' : 'Disabled'}
                                </span>
                            </div>
                        </div>

                        {/* Recruitment Link Bar */}
                        <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                                    <Plus className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Teacher Recruitment Link</p>
                                    <p className="text-sm font-mono text-slate-600 select-all">
                                        {window.location.origin}/apply/{tenant.slug}
                                    </p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-bold"
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/apply/${tenant.slug}`);
                                    toast.success('Link copied to clipboard');
                                }}
                            >
                                Copy Link
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Links to People */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link to={`/super-admin/tenants/${tenant.id}/teachers`}>
                        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                            <div className="h-12 w-12 bg-violet-100 rounded-xl flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                                <GraduationCap className="h-6 w-6 text-violet-600" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900">View Teachers</p>
                                <p className="text-sm text-slate-500">{tenant.teacher_count ?? 0} teachers registered</p>
                            </div>
                        </div>
                    </Link>
                    <Link to={`/super-admin/tenants/${tenant.id}/students`}>
                        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                            <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                <Users className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="font-bold text-slate-900">View Students</p>
                                <p className="text-sm text-slate-500">{tenant.student_count ?? 0} students enrolled</p>
                            </div>
                        </div>
                    </Link>
                </div>

                {/* Tenant Manager Card */}
                <Card className="border-slate-200/60 shadow-lg">
                    <CardHeader className="border-b border-slate-100">
                        <CardTitle className="text-lg font-bold">Organization Manager</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {!tenant.admin ? (
                            <div className="p-8 text-center text-slate-500">
                                <p>No primary administrator assigned to this organization.</p>
                                <p className="text-xs mt-1">Legacy tenants may require manual assignment.</p>
                            </div>
                        ) : (
                            <div className="p-4">
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-violet-100 rounded-xl flex items-center justify-center">
                                            <ShieldCheck className="h-6 w-6 text-violet-600" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{tenant.admin.name}</p>
                                            <div className="flex items-center gap-1 text-sm text-slate-500">
                                                <Mail className="h-3 w-3" />
                                                {tenant.admin.email}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tenant.admin.is_registered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {tenant.admin.is_registered ? 'Active Manager' : 'Invite Sent'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardPageLayout>
    )
}
