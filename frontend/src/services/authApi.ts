import api from './api'
import type { LoginResponse, MFAEnrollResponse } from '@/types'

export const authApi = {
  sendOtp: (phone: string, tenantId: string) =>
    api.post<{ success: true; data: { message: string; dev_otp?: string } }>(
      '/auth/otp/send',
      { phone, tenant_id: tenantId }
    ),

  verifyOtp: (phone: string, token: string, tenantId: string) =>
    api.post<{ success: true; data: LoginResponse }>(
      '/auth/otp/verify',
      { phone, token, tenant_id: tenantId }
    ),

  login: (email: string, password: string) =>
    api.post<{ success: true; data: LoginResponse }>(
      '/auth/login',
      { email, password }
    ),

  mfaEnroll: () => {
    const rt = localStorage.getItem('refresh_token') ?? ''
    return api.post<{ success: true; data: MFAEnrollResponse }>('/auth/mfa/enroll', {}, {
      headers: { 'X-Refresh-Token': rt },
    })
  },

  setPassword: (password: string, token: string) =>
    api.post<{ success: true; data: { message: string } }>(
      '/auth/set-password',
      { new_password: password },
      { headers: { Authorization: `Bearer ${token}` } } // Pass invite token
    ),

  completeStudentProfile: (data: any) =>
    api.post<{ success: true; data: { message: string } }>(
      '/classroom/complete-profile',
      data
    ),

  completeTeacherProfile: (data: any) =>
    api.post<{ success: true; data: { message: string } }>(
      '/teacher/complete-profile',
      data
    ),


  mfaGetFactors: () =>
    api.get<{ success: true; data: MFAEnrollResponse }>('/auth/mfa/factors'),

  mfaVerify: (factorId: string, code: string) => {
    const rt = localStorage.getItem('refresh_token') ?? ''
    return api.post<{ success: true; data: LoginResponse }>(
      '/auth/mfa/verify',
      { factor_id: factorId, code },
      { headers: { 'X-Refresh-Token': rt } },
    )
  },

  logout: () => api.post('/auth/logout'),
}