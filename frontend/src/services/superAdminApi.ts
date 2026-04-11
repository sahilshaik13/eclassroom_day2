import api from './api'

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

export const superAdminApi = {
    getStats: () =>
        api.get<{ success: true; data: PlatformStats }>('/super-admin/stats'),

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

    deleteTenant: (tenantId: string) =>
        api.delete<{ success: true; data: { message: string } }>(`/super-admin/tenants/${tenantId}`),
}
