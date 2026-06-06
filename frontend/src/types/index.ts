// ── Auth ──────────────────────────────────────────────────────────────────────

export type UserRole = 'student' | 'teacher' | 'admin' | 'super_admin' | 'platform_admin'

export interface AuthUser {
  id: string
  student_id: string | null
  name: string
  role: UserRole
  tenant_id: string | null
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

/** One row from GET /super-admin/audit-logs (Neon Postgres — HTTP, warnings, errors). */
export interface AuditLogEntry {
  id: string
  occurred_at: string
  log_level: 'info' | 'warning' | 'error'
  log_type: 'http_request' | 'app_event' | 'unhandled_error'
  message: string | null
  request_id: string | null
  actor_user_id: string | null
  tenant_id: string | null
  actor_role: string | null
  http_method: string
  path: string
  status_code: number | null
  duration_ms: number | null
  client_ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
}

// ── Student domain ────────────────────────────────────────────────────────────

export type TaskType = 'memorise' | 'review' | 'recite' | 'listen' | 'read' | 'mcq' | 'written' | 'reflection'
export type AcademicBucket = 'hifz' | 'kubra' | 'sughra' | 'tajweed'

export interface Task {
  id: string
  title: string
  description?: string
  task_type: TaskType
  kpi_bucket?: AcademicBucket
  day_number?: number
  scheduled_date?: string
  completed: boolean
  completed_at?: string
  notes?: string
  /** Imported timetable columns (NexusOCR PDF import) */
  config?: Record<string, unknown>
  plan_name?: string
  period_title?: string
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
  student_id?: string
  task_id?: string
  created_at: string
  client_sent_at?: string
  /** Set when the teacher opens the doubt in chat (read receipt). */
  teacher_seen_at?: string | null
  reply_type?: 'text' | 'audio' | 'file'
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
  students?: { id?: string; name?: string } | null
  responses?: DoubtResponse[]
}

export interface DoubtResponse {
  id: string
  body?: string | null
  reply_type?: 'text' | 'audio' | 'file'
  audio_url?: string | null
  file_url?: string | null
  file_name?: string | null
  teacher_name?: string
  created_at: string
  users?: { name?: string }
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
  has_password?: boolean
  is_registered?: boolean
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
  day_count?: number
  task_count: number
  total_tasks?: number
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

export interface StudyPlanPdfImport {
  id: string
  class_id: string
  teacher_id?: string | null
  original_filename?: string | null
  pdf_bucket?: string
  pdf_storage_path?: string
  pdf_url?: string | null
  ocr_job_id?: string | null
  ocr_status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'applied' | 'archived'
  total_chunks: number
  completed_chunks: number
  failed_chunks: number
  detected_columns: string[]
  selected_columns: string[]
  column_bucket_map: Record<string, AcademicBucket>
  extracted_rows: Record<string, string>[]
  filtered_rows: Record<string, string>[]
  applied_rows: Record<string, string>[]
  parse_message?: string | null
  created_at?: string
  updated_at?: string
}

export interface AppliedStudyPlanSummary {
  id: string
  class_id: string
  name: string
  description?: string
  status: string
  updated_at?: string
  source_import_id?: string | null
  class: {
    id: string
    name: string
    teacher_name: string
    enrollment_count: number
    is_active: boolean
  }
  source_import?: {
    id: string
    original_filename?: string | null
    ocr_status: string
    updated_at?: string
  } | null
}

export interface StudyPlanTeacherChange {
  id: string
  class_name: string
  teacher_name: string
  entity_type: 'task' | 'period' | 'day' | string
  change_type: string
  plan_day_number?: number | null
  scheduled_date?: string | null
  previous_details: Record<string, unknown>
  new_details: Record<string, unknown>
  created_at?: string
}

// ── Competition domain ────────────────────────────────────────────────────────

export type CompetitionStatus = 'draft' | 'active' | 'closed'
export type RegistrationStatus = 'registered' | 'participated' | 'disqualified'
export type CompetitionCategory = 'mcq' | 'hifz' | 'khirat' | 'mixed'

export interface CompetitionGraderRef {
  teacher_id: string
  name: string
}

export interface Competition {
  id: string
  tenant_id: string
  title: string
  category: CompetitionCategory
  description?: string
  start_date?: string
  end_date?: string
  status: CompetitionStatus
  assigned_teacher_id?: string
  assigned_teacher?: { name: string }
  /** Assigned grading teachers (from API); use for display and edit form. */
  graders?: CompetitionGraderRef[]
  grader_teacher_ids?: string[]
  /** Teachers who may edit exam content and start/stop the exam. */
  setup_teachers?: CompetitionGraderRef[]
  setup_teacher_ids?: string[]
  /** Teacher list API: current user capabilities */
  my_can_grade?: boolean
  my_can_setup?: boolean
  content?: any[]
  settings?: any
  is_exam_active?: boolean
  submitted_registrations_count?: number
  publish_ready_count?: number
  unpublished_ready_count?: number
  pending_publish_count?: number
  corrected_grader_ids?: string[]
  pending_grader_ids?: string[]
  can_publish_results?: boolean
  created_at?: string
}

export interface CompetitionGraderScore {
  id: string
  competition_id: string
  registration_id: string
  grader_user_id: string
  grader_name?: string
  score: number
  remarks?: string
}

export interface CompetitionRegistrationsMeta {
  expected_grader_count: number
  collaborative_grading: boolean
  my_can_grade: boolean
  my_can_setup: boolean
}

export interface CompetitionRegistrationsPayload {
  registrations: CompetitionRegistration[]
  meta: CompetitionRegistrationsMeta
}

export interface CompetitionRegistration {
  id: string
  competition_id: string
  tenant_id: string
  phone: string
  name: string
  student_id: string | null
  status: RegistrationStatus
  registered_at: string
  responses?: any[]
  is_submitted?: boolean
  submitted_at?: string
  results_released?: boolean
  competition_results?: CompetitionResult[] // from join in backend
  competition_grader_scores?: CompetitionGraderScore[]
  competitions?: Competition // from join in backend
}

export interface CompetitionResult {
  id: string
  competition_id: string
  tenant_id: string
  registration_id: string
  score: number
  remarks?: string
  recorded_by?: string
  created_at: string
}
