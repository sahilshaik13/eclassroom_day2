/** Central React Query keys — keeps invalidation and prefetch aligned */

export const queryKeys = {
  admin: {
    stats: () => ['admin', 'stats'] as const,
    teachers: () => ['admin', 'teachers'] as const,
    tenantInfo: () => ['admin', 'tenant-info'] as const,
    teacherApplications: (status: string) =>
      ['admin', 'teacher-applications', status] as const,
    studentApplications: (status: string) =>
      ['admin', 'student-applications', status] as const,
    students: (limit: number) => ['admin', 'students', limit] as const,
    classes: () => ['admin', 'classes'] as const,
    classroomStudyPlan: (classId: string) =>
      ['admin', 'classroom', classId, 'study-plan'] as const,
    classroomStudyPlanSource: (classId: string) =>
      ['admin', 'classroom', classId, 'study-plan-source'] as const,
    competitions: () => ['admin', 'competitions'] as const,
  },
  teacher: {
    pulseToday: () => ['teacher', 'pulse', 'today'] as const,
    classes: () => ['teacher', 'classes'] as const,
    doubts: (filter?: string) =>
      ['teacher', 'doubts', filter ?? 'all'] as const,
    classroomStudyPlan: (classId: string) =>
      ['teacher', 'classroom', classId, 'study-plan'] as const,
    classroomStudyPlanSource: (classId: string) =>
      ['teacher', 'classroom', classId, 'study-plan-source'] as const,
    classMeetings: (classId: string) =>
      ['teacher', 'classroom', classId, 'meetings'] as const,
    meetingsToday: () => ['teacher', 'meetings', 'today'] as const,
    studentsByClass: (classId: string) =>
      ['teacher', 'students', classId] as const,
    studentsAll: () => ['teacher', 'students'] as const,
    reportsList: () => ['teacher', 'reports', 'students'] as const,
    pendingSubmissions: () => ['teacher', 'submissions', 'pending'] as const,
    competitions: () => ['teacher', 'competitions'] as const,
    studentReport: (studentId: string, month: number, year: number, classId?: string) =>
      ['teacher', 'students', studentId, 'report', year, month, classId ?? 'all'] as const,
    studentOverview: (studentId: string) =>
      ['teacher', 'students', studentId, 'overview'] as const,
    attendanceByClass: (classId: string, sessionDate: string) =>
      ['teacher', 'attendance', classId, sessionDate] as const,
  },
  student: {
    tasksToday: () => ['student', 'tasks', 'today'] as const,
    doubts: () => ['student', 'doubts'] as const,
    classesMy: () => ['student', 'classes', 'my'] as const,
    classStudyPlan: (classId: string) =>
      ['student', 'classes', classId, 'study-plan'] as const,
    classMeetings: (classId: string) =>
      ['student', 'classes', classId, 'meetings'] as const,
    upcomingMeetings: () => ['student', 'meetings', 'upcoming'] as const,
    progressReport: (year: number, month: number, classId: string) =>
      ['student', 'progress-report', year, month, classId] as const,
  },
  competitions: {
    studentRegistrations: () => ['competitions', 'student', 'registrations'] as const,
    registrations: (competitionId: string) =>
      ['competitions', 'registrations', competitionId] as const,
    info: (competitionId: string) =>
      ['competitions', 'info', competitionId] as const,
  },
} as const
