import api from './api'
import type { ApiResponse, Competition, CompetitionRegistration, CompetitionResult, CompetitionRegistrationsPayload } from '../types'

export const competitionApi = {
  // Public
  getCompetitionInfo: async (competitionId: string) => {
    const { data } = await api.get<ApiResponse<Competition>>(`/competitions/${competitionId}/info`)
    return data
  },

  // Post-OTP Registration
  register: async (competitionId: string, phone: string, name: string, tenantId: string) => {
    const { data } = await api.post<ApiResponse<CompetitionRegistration>>(`/competitions/${competitionId}/register`, {
      phone,
      name,
      tenant_id: tenantId,
    })
    return data
  },

  // Admin and Teacher
  getCompetitionRegistrations: async (competitionId: string) => {
    const { data } = await api.get<ApiResponse<CompetitionRegistrationsPayload>>(
      `/competitions/${competitionId}/registrations`
    )
    return data
  },

  submitResult: async (competitionId: string, registrationId: string, score: number, remarks?: string) => {
    const { data } = await api.post<ApiResponse<CompetitionResult>>(`/competitions/${competitionId}/results`, {
      registration_id: registrationId,
      score,
      remarks,
    })
    return data
  },

  updateResult: async (competitionId: string, resultId: string, score?: number, remarks?: string) => {
    const { data } = await api.patch<ApiResponse<CompetitionResult>>(`/competitions/${competitionId}/results/${resultId}`, {
      score,
      remarks,
    })
    return data
  },

  evaluateParticipant: async (
    competitionId: string, 
    registrationId: string, 
    score: number, 
    remarks?: string, 
    responses_override?: any[], 
    release_results: boolean = false
  ) => {
    const { data } = await api.patch<ApiResponse<CompetitionResult>>(`/competitions/${competitionId}/registrations/${registrationId}/evaluate`, {
      score,
      remarks,
      responses_override,
      release_results,
    })
    return data
  },

  // Admin Only
  getAdminCompetitions: async () => {
    const { data } = await api.get<ApiResponse<Competition[]>>('/admin/competitions')
    return data
  },

  createCompetition: async (payload: Partial<Competition>) => {
    const { data } = await api.post<ApiResponse<Competition>>('/admin/competitions', payload)
    return data
  },

  updateCompetition: async (competitionId: string, payload: Partial<Competition>) => {
    const { data } = await api.patch<ApiResponse<Competition>>(`/admin/competitions/${competitionId}`, payload)
    return data
  },

  publishCompetitionResults: async (competitionId: string) => {
    const { data } = await api.post<ApiResponse<{ published: number } & Record<string, unknown>>>(
      `/admin/competitions/${competitionId}/publish-results`
    )
    return data
  },

  deleteCompetition: async (competitionId: string) => {
    const { data } = await api.delete<ApiResponse<{message: string}>>(`/admin/competitions/${competitionId}`)
    return data
  },

  deleteRegistration: async (competitionId: string, registrationId: string) => {
    const { data } = await api.delete<ApiResponse<{message: string}>>(`/admin/competitions/${competitionId}/registrations/${registrationId}`)
    return data
  },

  getCompetitionContent: async (competitionId: string) => {
    const { data } = await api.get<ApiResponse<any>>(`/competitions/${competitionId}/content`)
    return data
  },

  submitExam: async (competitionId: string, responses: any[], metadata?: any) => {
    const { data } = await api.post<ApiResponse<{message: string}>>(`/competitions/${competitionId}/submit`, {
      responses,
      metadata
    })
    return data
  },

  // Teacher Only
  getTeacherCompetitions: async () => {
    const { data } = await api.get<ApiResponse<Competition[]>>('/teacher/competitions')
    return data
  },

  saveTeacherContent: async (competitionId: string, content: any[]) => {
    const { data } = await api.patch<ApiResponse<any>>(`/teacher/competitions/${competitionId}/content`, { content })
    return data
  },

  // Student Only
  getStudentCompetitions: async () => {
    const { data } = await api.get<ApiResponse<CompetitionRegistration[]>>('/student/competitions')
    return data
  },
}
