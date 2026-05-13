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
    competitions: () => ['admin', 'competitions'] as const,
  },
  teacher: {
    pulseToday: () => ['teacher', 'pulse', 'today'] as const,
    classes: () => ['teacher', 'classes'] as const,
    doubts: (filter?: string) =>
      ['teacher', 'doubts', filter ?? 'all'] as const,
    classroomStudyPlan: (classId: string) =>
      ['teacher', 'classroom', classId, 'study-plan'] as const,
    studentsByClass: (classId: string) =>
      ['teacher', 'students', classId] as const,
    studentsAll: () => ['teacher', 'students'] as const,
    reportsList: () => ['teacher', 'reports', 'students'] as const,
  },
  student: {
    tasksToday: () => ['student', 'tasks', 'today'] as const,
    doubts: () => ['student', 'doubts'] as const,
    classesMy: () => ['student', 'classes', 'my'] as const,
  },
  competitions: {
    studentRegistrations: () => ['competitions', 'student', 'registrations'] as const,
  },
} as const
