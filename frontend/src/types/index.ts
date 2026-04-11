// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = 'student' | 'teacher' | 'admin'

export interface AuthUser {
  id: string
  name: string
  role: UserRole
  tenant_id: string
  email?: string
  phone?: string
  is_registered?: boolean
  mfa_enabled?: boolean
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser
  mfa_required?: boolean
  mfa_enrolled?: boolean
  mfa_token?: string
}

export interface MFAEnrollResponse {
  factor_id: string
  qr_code: string    // data URI
  secret: string
  uri: string
}

// ── API standard envelope ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true
  data: T
  timestamp: string
  requestId: string
  meta?: PaginationMeta
}

export interface ApiError {
  success: false
  error: { code: string; message: string; details?: unknown }
  timestamp: string
  requestId: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  total_pages: number
  has_more: boolean
}

// ── Student domain ────────────────────────────────────────────────────────────

export type TaskType = 'memorise' | 'review' | 'recite' | 'listen' | 'read'

export interface Task {
  id: string
  title: string
  description?: string
  task_type: TaskType
  day_number: number
  completed: boolean
  completed_at?: string
  notes?: string
}

export interface WeekProgress {
  date: string
  completed_count: number
  total_count: number
}

export interface EnrolledClass {
  id: string
  name: string
  zoom_link?: string
  schedule_json?: {
    days: string[]
    time: string
    timezone: string
  }
  teacher: { name: string }
}

export interface AccountabilityPartner {
  id: string
  name: string
  phone: string
}

export type DoubtStatus = 'pending' | 'resolved' | 'archived'

export interface Doubt {
  id: string
  title: string
  body: string
  status: DoubtStatus
  class_id: string
  class_name?: string
  task_id?: string
  created_at: string
  responses?: DoubtResponse[]
}

export interface DoubtResponse {
  id: string
  body: string
  teacher_name: string
  created_at: string
}

// ── Teacher domain ────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'late'

export interface StudentPulse {
  student_id: string
  name: string
  completion_pct: number
  pending_doubts: number
  last_seen?: string
}

export interface AttendanceRecord {
  student_id: string
  status: AttendanceStatus
}

export interface Grade {
  student_id: string
  student_name: string
  score: number
  remarks?: string
}

export interface ReportData {
  student: { id: string; name: string }
  class: { id: string; name: string }
  month: string
  attendance_pct: number
  task_completion_pct: number
  grade?: { score: number; remarks?: string }
  teacher: { name: string }
}

// ── Admin domain ──────────────────────────────────────────────────────────────

export interface AdminStats {
  total_students: number
  total_classes: number
  total_teachers: number
  avg_attendance_pct: number
  avg_task_completion_pct: number
  active_doubts: number
}

export interface Student {
  id: string
  name: string
  phone: string
  class_name?: string
  class_id?: string
  deactivated_at?: string
}

export interface Teacher {
  id: string
  name: string
  email: string
  class_count: number
  student_count: number
  deactivated_at?: string
}

export interface ClassItem {
  id: string
  name: string
  teacher_id: string
  teacher_name: string
  zoom_link?: string
  schedule_json?: unknown
  enrollment_count: number
  is_active: boolean
}

export interface StudyPlanTemplate {
  id: string
  name: string
  description?: string
  total_days: number
  task_count: number
  created_at: string
}

export interface StudyPlanTaskItem {
  id: string
  day_number: number
  title: string
  description?: string
  task_type: TaskType
  order_index: number
}
