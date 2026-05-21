import api from './api'
import type { AuditLogEntry, PaginationMeta } from '@/types'

export interface Tenant {
    admin_count: number
    id: string
    name: string
    slug: string
    is_active: boolean
    created_at: string
    admin?: TenantAdmin | null
    teacher_count?: number
    student_count?: number
}

export interface TenantAdmin {
    id: string
    name: string
    email: string
    role: string
    is_registered: boolean
    has_password: boolean
    is_active: boolean
    created_at: string
    deactivated_at: string | null
}

export interface PlatformStats {
    total_tenants: number
    active_tenants: number
    total_admins: number
    total_teachers: number
    total_students: number
}

/** Shared React Query keys — dashboard + tenants list reuse the same cache. */
export const superAdminQueryKeys = {
    stats: ['super-admin', 'stats'] as const,
    tenants: ['super-admin', 'tenants'] as const,
    auditLogs: (page: number) => ['super-admin', 'audit-logs', page] as const,
}

/** Stats/tenants: Redis-backed on API. Audit logs: short stale + SSE live tail. */
const STALE_MS = 30_000

export const superAdminApi = {
    getStats: () =>
        api.get<{ success: true; data: PlatformStats }>('/super-admin/stats'),

    getAuditLogs: (params?: { page?: number; limit?: number; tenant_id?: string }) =>
        api.get<{ success: true; data: AuditLogEntry[]; meta: PaginationMeta }>(
            '/super-admin/audit-logs',
            { params },
        ),

    getTenants: () =>
        api.get<{ success: true; data: { tenants: Tenant[] } }>('/super-admin/tenants'),

    getTenant: (tenantId: string) =>
        api.get<{ success: true; data: { tenant: Tenant } }>(`/super-admin/tenants/${tenantId}`),

    createTenant: (data: { name: string; slug: string; admin_name: string; admin_email: string }) =>
        api.post<{ success: true; data: { tenant: Tenant } }>('/super-admin/tenants', data),

    updateTenant: (tenantId: string, data: { is_active?: boolean; name?: string }) =>
        api.patch<{ success: true; data: { tenant: Tenant } }>(`/super-admin/tenants/${tenantId}`, data),

    getTenantAdmins: (tenantId: string) =>
        api.get<{ success: true; data: { admins: TenantAdmin[] } }>(`/super-admin/tenants/${tenantId}/admins`),

    createAdmin: (tenantId: string, data: { email: string; name: string }) =>
        api.post<{ success: true; data: { message: string; admin_id: string } }>(`/super-admin/tenants/${tenantId}/admins`, data),

    updateAdmin: (adminId: string, data: { is_active: boolean }) =>
        api.patch<{ success: true; data: { admin: TenantAdmin } }>(`/super-admin/admins/${adminId}`, data),

    getTenantTeachers: (tenantId: string) =>
        api.get<{ success: true; data: { teachers: any[] } }>(`/super-admin/tenants/${tenantId}/teachers`),

    getTenantStudents: (tenantId: string) =>
        api.get<{ success: true; data: { students: any[] } }>(`/super-admin/tenants/${tenantId}/students`),

    resendAdminInvite: (adminId: string) =>
        api.post<{ success: true; data: { message: string } }>(`/super-admin/admins/${adminId}/resend-invite`),

    deleteTenant: (tenantId: string) =>
        api.delete<{ success: true; data: { message: string } }>(`/super-admin/tenants/${tenantId}`),
}

/** Invalidate super-admin dashboard queries after mutations (instant UI refresh). */
export function invalidateSuperAdminQueries(
    queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void },
) {
    queryClient.invalidateQueries({ queryKey: superAdminQueryKeys.stats })
    queryClient.invalidateQueries({ queryKey: superAdminQueryKeys.tenants })
    queryClient.invalidateQueries({ queryKey: ['super-admin', 'audit-logs'] })
}

export const superAdminQueryOptions = {
    stats: {
        queryKey: superAdminQueryKeys.stats,
        queryFn: async () => (await superAdminApi.getStats()).data.data,
        staleTime: STALE_MS,
    },
    tenants: {
        queryKey: superAdminQueryKeys.tenants,
        queryFn: async () => (await superAdminApi.getTenants()).data.data.tenants,
        staleTime: STALE_MS,
    },
}
