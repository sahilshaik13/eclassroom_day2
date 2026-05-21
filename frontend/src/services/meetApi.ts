import api from '@/services/api'

export interface ClassMeeting {
  id: string
  class_id: string
  title: string
  start_at: string
  end_at: string
  meet_url: string
  scheduled_date?: string | null
  class_name?: string
}

export interface CreateMeetingPayload {
  title: string
  start_at: string
  duration_minutes: number
  timezone: string
  scheduled_date?: string
}

export type CreateMeetingResult =
  | { ok: true; meeting: ClassMeeting }
  | { ok: false; needAuth: true; authUrl: string }
  | { ok: false; needAuth?: false; message: string }

function apiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data
    return data?.error?.message || 'Request failed'
  }
  return 'Request failed'
}

export async function fetchTeacherClassMeetings(classId: string): Promise<ClassMeeting[]> {
  const res = await api.get(`/meet/classes/${classId}/meetings`)
  return (res.data?.data ?? []) as ClassMeeting[]
}

export async function fetchTeacherTodayMeetings(): Promise<ClassMeeting[]> {
  const res = await api.get('/meet/teacher/meetings/today')
  return (res.data?.data ?? []) as ClassMeeting[]
}

export async function fetchStudentClassMeetings(classId: string): Promise<ClassMeeting[]> {
  const res = await api.get(`/meet/student/classes/${classId}/meetings`)
  return (res.data?.data ?? []) as ClassMeeting[]
}

export async function fetchStudentUpcomingMeetings(): Promise<ClassMeeting[]> {
  const res = await api.get('/meet/student/meetings/upcoming')
  return (res.data?.data ?? []) as ClassMeeting[]
}

export async function createClassMeeting(
  classId: string,
  payload: CreateMeetingPayload,
): Promise<CreateMeetingResult> {
  try {
    const res = await api.post(`/meet/classes/${classId}/meetings`, payload)
    return { ok: true, meeting: res.data.data as ClassMeeting }
  } catch (err: unknown) {
    const status =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { status?: number; data?: { error?: { code?: string; details?: { auth_url?: string } } } } })
            .response?.status
        : undefined
    const body =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { code?: string; details?: { auth_url?: string }; message?: string } } } })
            .response?.data?.error
        : undefined
    if (status === 401 && body?.code === 'GOOGLE_AUTH_REQUIRED' && body.details?.auth_url) {
      return { ok: false, needAuth: true, authUrl: body.details.auth_url }
    }
    return { ok: false, message: body?.message || apiErrorMessage(err) }
  }
}

export async function updateClassMeeting(
  meetingId: string,
  payload: CreateMeetingPayload,
): Promise<ClassMeeting> {
  const res = await api.patch(`/meet/meetings/${meetingId}`, payload)
  return res.data.data as ClassMeeting
}

export async function deleteClassMeeting(meetingId: string): Promise<void> {
  await api.delete(`/meet/meetings/${meetingId}`)
}

export async function fetchGoogleCalendarStatus(): Promise<boolean> {
  const res = await api.get('/meet/google/status')
  return !!res.data?.data?.connected
}
