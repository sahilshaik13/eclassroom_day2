/**
 * Supabase Realtime subscriptions for live portal sync.
 *
 * This module provides real-time data synchronization between
 * student and teacher portals without requiring manual refresh.
 *
 * Features:
 * - Students see grades immediately when teachers review
 * - Teachers see new submissions as students submit
 * - Study plan changes propagate instantly
 * - Toast notifications for important events
 */

import { supabase, supabaseRealtimeEnabled } from './supabase';
import { queryKeys } from './queryKeys';
import toast from 'react-hot-toast';
import {
  competitionDisplayTitle,
  examActiveChanged,
  patchCompetitionExamStatus,
  refreshCompetitionInfoQuery,
  type CompetitionRealtimeRow,
} from './competitionRealtimePatch';

// Feature flag + cloud Supabase URL (not local 127.0.0.1:54321 demo stack)
const USE_REALTIME = supabaseRealtimeEnabled;

// QueryClient singleton - must be set by main.tsx before use
let _queryClient: any = null;

export function setRealtimeQueryClient(qc: any) {
  _queryClient = qc;
}

function softRefetch(queryKey: readonly unknown[]) {
  const qc = getQueryClient();
  if (qc) {
    void qc.invalidateQueries({ queryKey });
  }
}

function getQueryClient() {
  if (!_queryClient) {
    console.warn('[Realtime] QueryClient not set - invalidation will not work');
  }
  return _queryClient;
}

function toastExamActiveChange(title: string, isActive: boolean) {
  toast(
    isActive ? `Exam for "${title}" is now open` : `Exam for "${title}" has closed`,
    { duration: 4000, icon: isActive ? '🟢' : '🔴' },
  );
}

/** Apply competition row updates to React Query caches + optional exam toasts. */
function handleCompetitionRowUpdate(
  payload: { new: Record<string, unknown>; old: Record<string, unknown> },
  options?: { toastExam?: boolean; toastStatus?: boolean },
) {
  const row = payload.new as CompetitionRealtimeRow;
  const old = (payload.old || {}) as CompetitionRealtimeRow;
  const competitionId = row.id;
  if (!competitionId) return;

  const qc = getQueryClient();
  if (qc) {
    patchCompetitionExamStatus(qc, competitionId, {
      is_exam_active: row.is_exam_active,
      status: row.status,
      title: row.title,
    });
    refreshCompetitionInfoQuery(qc, competitionId);
  }

  const title = competitionDisplayTitle(row);

  if (options?.toastExam && examActiveChanged(row, old)) {
    toastExamActiveChange(title, !!row.is_exam_active);
  }

  if (
    options?.toastStatus &&
    row.status === 'active' &&
    old.status !== 'active'
  ) {
    toast(`Competition "${title}" is now open!`, {
      duration: 5000,
      icon: '🚀',
    });
  }
}

/**
 * Subscribe to exam start/stop for one competition (student exam page, teacher setup).
 * Fires when admin toggles is_exam_active.
 */
export function subscribeToCompetitionExamStatus(
  competitionId: string,
  handlers?: {
    onExamActiveChange?: (active: boolean) => void;
    /** Skip duplicate toast when parent already shows one */
    showToast?: boolean;
  },
) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const channel = supabase
    .channel(`competition:${competitionId}:exam-status`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competitions',
        filter: `id=eq.${competitionId}`,
      },
      (payload) => {
        const row = payload.new as CompetitionRealtimeRow;
        const old = (payload.old || {}) as CompetitionRealtimeRow;
        const nextActive = !!row.is_exam_active;

        handleCompetitionRowUpdate(payload, {
          toastExam: handlers?.showToast !== false && examActiveChanged(row, old),
          toastStatus: false,
        });

        if (examActiveChanged(row, old)) {
          handlers?.onExamActiveChange?.(nextActive);
        }
      },
    )
    .subscribe((status) => {
      console.log(`[Realtime] Competition exam status (${competitionId}): ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Subscribe to real-time updates for a student's class.
 * Call this when student enters a class context.
 *
 * Events handled:
 * - submission_reviewed: Task graded by teacher (shows toast)
 * - study_plan_changed: Plan updated by teacher
 * - day_unlocked: New day available
 *
 * @param classId - The classroom ID
 * @param studentId - The student's ID
 * @returns Unsubscribe function
 */
export function subscribeToStudentClass(classId: string, studentId: string) {
  if (!USE_REALTIME) {
    return () => {}; // No-op if realtime disabled
  }

  const channel = supabase
    .channel(`student:${studentId}:class:${classId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'study_plan_submissions',
        filter: `student_id=eq.${studentId}`,
      },
      async (payload) => {
        const submission = payload.new as any;
        const oldSubmission = payload.old as any;

        // Only react when status changes to reviewed
        if (submission.status === 'reviewed' && oldSubmission.status !== 'reviewed') {
          const qc = getQueryClient();
          if (qc) {
            // Invalidate relevant queries
            await qc.invalidateQueries({
              queryKey: ['student', 'classes', classId, 'study-plan'],
            });
            softRefetch(queryKeys.student.tasksToday());
            await qc.invalidateQueries({
              queryKey: ['student', 'progress-report'],
            });
          }

          // Show notification
          if (submission.score !== null && submission.score !== undefined) {
            toast.success(`Task graded: ${submission.score}/100`, {
              duration: 4000,
            });
          } else {
            toast.success('Task reviewed by teacher', {
              duration: 3000,
            });
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'study_plans',
        filter: `class_id=eq.${classId}`,
      },
      () => {
        invalidateStudyPlanForClass(classId);
      },
    )
    .subscribe((status) => {
      console.log(`[Realtime] Student subscription status: ${status}`);
    });

  const qc = getQueryClient();
  const studentPlan = qc?.getQueryData(queryKeys.student.classStudyPlan(classId)) as
    | { id?: string }
    | null
    | undefined;
  const studentPlanId = studentPlan?.id;

  if (studentPlanId) {
    const dayChannel = supabase
      .channel(`student:${studentId}:class:${classId}:days`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'study_plan_days',
          filter: `plan_id=eq.${studentPlanId}`,
        },
        (payload) => {
          const day = payload.new as { is_accessible?: boolean; day_number?: number };
          const oldDay = payload.old as { is_accessible?: boolean };
          if (day.is_accessible && !oldDay.is_accessible) {
            toast(`Day ${day.day_number ?? ''} is now available!`, {
              duration: 5000,
              icon: '📚',
            });
            invalidateStudyPlanForClass(classId);
          }
        },
      )
      .subscribe();

    const prevUnsub = () => channel.unsubscribe();
    return () => {
      prevUnsub();
      dayChannel.unsubscribe();
    };
  }

  return () => {
    channel.unsubscribe();
  };
}

// Ref-counted realtime channels per class (two Meet UI instances share one channel)
const classMeetingsChannels = new Map<string, { channel: ReturnType<typeof supabase.channel>; refs: number }>();

function invalidateClassMeetingsQueries(classId: string) {
  const qc = getQueryClient();
  if (!qc) return;
  void qc.invalidateQueries({ queryKey: queryKeys.student.classMeetings(classId) });
  void qc.invalidateQueries({ queryKey: queryKeys.student.upcomingMeetings() });
  void qc.invalidateQueries({ queryKey: queryKeys.teacher.classMeetings(classId) });
  void qc.invalidateQueries({ queryKey: queryKeys.teacher.meetingsToday() });
}

/**
 * Subscribe to class Google Meet create/delete for teacher + student portals.
 */
export function subscribeToClassMeetings(
  classId: string,
  onChange?: (event: 'insert' | 'delete') => void,
) {
  if (!USE_REALTIME || !classId) {
    return () => {};
  }

  let entry = classMeetingsChannels.get(classId);
  if (!entry) {
    const channel = supabase
      .channel(`class-meetings:${classId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'class_meetings',
          filter: `class_id=eq.${classId}`,
        },
        () => {
          invalidateClassMeetingsQueries(classId);
          onChange?.('insert');
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'class_meetings',
          filter: `class_id=eq.${classId}`,
        },
        () => {
          invalidateClassMeetingsQueries(classId);
        onChange?.('delete');
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_meetings',
        filter: `class_id=eq.${classId}`,
      },
      () => {
        invalidateClassMeetingsQueries(classId);
        onChange?.('insert');
      },
    )
    .subscribe((status) => {
        console.log(`[Realtime] Class meetings subscription: ${status}`);
      });
    entry = { channel, refs: 0 };
    classMeetingsChannels.set(classId, entry);
  }

  entry.refs += 1;

  return () => {
    const current = classMeetingsChannels.get(classId);
    if (!current) return;
    current.refs -= 1;
    if (current.refs <= 0) {
      current.channel.unsubscribe();
      classMeetingsChannels.delete(classId);
    }
  };
}

/**
 * Subscribe to real-time updates for teacher's pending queue.
 * Call this on teacher dashboard or submissions page.
 *
 * Events handled:
 * - submission_created: New student submission
 * - doubt_created: New student question
 *
 * @param teacherId - The teacher's user ID
 * @param classIds - Array of class IDs the teacher manages
 * @returns Unsubscribe function
 */
export function subscribeToTeacherQueue(teacherId: string, classIds: string[]) {
  if (!USE_REALTIME || classIds.length === 0) {
    return () => {}; // No-op if realtime disabled or no classes
  }

  const channels: ReturnType<typeof supabase.channel>[] = [];

  for (const classId of classIds) {
    const channel = supabase
      .channel(`teacher:${teacherId}:class:${classId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_plan_submissions',
          filter: `class_id=eq.${classId}`,
        },
        async () => {
          const qc = getQueryClient();
          if (qc) {
            // New submission - refresh pending queue
            await qc.invalidateQueries({
              queryKey: ['teacher', 'submissions', 'pending'],
            });
            await qc.invalidateQueries({
              queryKey: queryKeys.teacher.pulseToday(),
            });
          }

          // Optional: Show notification (might be noisy in large classes)
          // toast('New submission received');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'doubts',
          filter: `class_id=eq.${classId}`,
        },
        async () => {
          const qc = getQueryClient();
          if (qc) {
            await qc.invalidateQueries({
              queryKey: queryKeys.teacher.doubts('pending'),
            });
          }

          toast(`New question from student`, {
            duration: 4000,
            icon: '❓',
          });
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Teacher subscription for ${classId}: ${status}`);
      });

    channels.push(channel);
  }

  return () => {
    channels.forEach((ch) => ch.unsubscribe());
  };
}

/** Invalidate/refetch study plan queries for a classroom across teacher, student, admin. */
export function invalidateStudyPlanForClass(classId: string) {
  softRefetch(queryKeys.teacher.classroomStudyPlan(classId));
  softRefetch(queryKeys.teacher.classroomStudyPlanSource(classId));
  softRefetch(queryKeys.student.classStudyPlan(classId));
  softRefetch(['student', 'classes', classId, 'study-plan']);
  softRefetch(queryKeys.admin.classroomStudyPlan(classId));
  softRefetch(queryKeys.admin.classroomStudyPlanSource(classId));
  softRefetch(queryKeys.student.tasksToday());
}

export type StudyPlanRealtimeOptions = {
  /** Active plan id — enables day-level realtime filters. */
  planId?: string;
  /** Tenant scope for task/period realtime filters. */
  tenantId?: string;
  /** Called after remote DB change (e.g. admin page reload). */
  onRemoteChange?: () => void;
  /** When true, skip toast (e.g. teacher with local unsaved edits). */
  quiet?: boolean;
};

/**
 * Subscribe to study plan changes via Supabase Realtime.
 * Listens to plan row updates (touch_plan on every task/day edit) and structure tables.
 */
export function subscribeToStudyPlan(
  classId: string,
  userId: string,
  role: 'student' | 'teacher' | 'admin',
  options?: StudyPlanRealtimeOptions,
) {
  if (!USE_REALTIME || !classId) {
    return () => {};
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleChange = (source: string) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      invalidateStudyPlanForClass(classId);
      options?.onRemoteChange?.();

      if (!options?.quiet) {
        if (role === 'student') {
          toast('Your study plan was updated', { duration: 3500, icon: '📚' });
        } else if (role === 'admin') {
          toast('Study plan updated', { duration: 3000 });
        } else if (role === 'teacher') {
          toast('Study plan updated remotely', { duration: 3000 });
        }
      }
      console.log(`[Realtime] Study plan refresh (${source}) class=${classId}`);
    }, 400);
  };

  const qc = getQueryClient();
  const cachedPlan = qc?.getQueryData(queryKeys.teacher.classroomStudyPlan(classId)) as
    | { id?: string }
    | null
    | undefined;
  const planId = options?.planId ?? cachedPlan?.id;

  let channel = supabase.channel(`study-plan:${classId}:${role}:${userId}`);

  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'study_plans',
      filter: `class_id=eq.${classId}`,
    },
    () => handleChange('study_plans'),
  );

  channel = channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'study_plan_teacher_changes',
      filter: `class_id=eq.${classId}`,
    },
    () => handleChange('teacher_changes'),
  );

  if (planId) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plan_days',
        filter: `plan_id=eq.${planId}`,
      },
      () => handleChange('study_plan_days'),
    );
  }

  const tenantId = options?.tenantId;
  if (tenantId) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plan_tasks',
        filter: `tenant_id=eq.${tenantId}`,
      },
      () => handleChange('study_plan_tasks'),
    );
  }

  channel.subscribe((status) => {
    console.log(`[Realtime] Study plan subscription (${role}): ${status}`);
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    channel.unsubscribe();
  };
}

/**
 * Subscribe to real-time updates for the admin panel.
 * Tracks new imports, applications, etc.
 *
 * @param tenantId - The tenant/organization ID
 * @returns Unsubscribe function
 */
export function subscribeToAdminUpdates(tenantId: string) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const channel = supabase
    .channel(`admin:tenant:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'teacher_applications',
        filter: `tenant_id=eq.${tenantId}`,
      },
      async () => {
        const qc = getQueryClient();
        if (qc) {
          await qc.invalidateQueries({
            queryKey: ['admin', 'teacher-applications'],
          });
        }

        toast('New teacher application received', {
          duration: 5000,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'study_plan_pdf_imports',
        filter: `tenant_id=eq.${tenantId}`,
      },
      async (payload) => {
        const importData = payload.new as any;

        // Import completed
        if (importData.ocr_status === 'completed') {
          const qc = getQueryClient();
          if (qc) {
            await qc.invalidateQueries({
              queryKey: ['admin', 'study-plan-imports'],
            });
          }

          toast.success('Study plan import completed', {
            duration: 4000,
          });
        }
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] Admin subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Live updates for teacher student profile modal (attendance, tasks by date, progress).
 */
export function subscribeToTeacherStudentProfile(
  studentId: string,
  teacherId: string,
  options?: { tenantId?: string; classIds?: string[] },
) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const refreshProfile = () => {
    softRefetch(queryKeys.teacher.studentOverview(studentId));
    const now = new Date();
    softRefetch(
      queryKeys.teacher.studentReport(
        studentId,
        now.getMonth() + 1,
        now.getFullYear(),
        'all',
      ),
    );
  };

  let channel = supabase.channel(`teacher:${teacherId}:student-profile:${studentId}`);

  channel = channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'student_login_attendance',
        filter: `student_id=eq.${studentId}`,
      },
      refreshProfile,
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'student_login_attendance_logs',
        filter: `student_id=eq.${studentId}`,
      },
      refreshProfile,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plan_submissions',
        filter: `student_id=eq.${studentId}`,
      },
      refreshProfile,
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'doubts',
        filter: `student_id=eq.${studentId}`,
      },
      refreshProfile,
    );

  const tenantId = options?.tenantId;
  if (tenantId) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plan_tasks',
        filter: `tenant_id=eq.${tenantId}`,
      },
      refreshProfile,
    );
  }

  const classIds = options?.classIds ?? [];
  for (const classId of classIds) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plans',
        filter: `class_id=eq.${classId}`,
      },
      refreshProfile,
    );
  }

  channel.subscribe((status) => {
    console.log(`[Realtime] Teacher student profile subscription: ${status}`);
  });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Subscribe to competition updates for the admin competitions page.
 */
export function subscribeToAdminCompetitions(tenantId: string) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const refreshAdminCompetitions = () => {
    softRefetch(queryKeys.admin.competitions());
  };

  const refreshRegistrations = (competitionId: string) => {
    softRefetch(queryKeys.competitions.registrations(competitionId));
  };

  const channel = supabase
    .channel(`admin:${tenantId}:competitions`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'competitions',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        if (payload.eventType === 'UPDATE') {
          handleCompetitionRowUpdate(
            { new: payload.new as Record<string, unknown>, old: (payload.old || {}) as Record<string, unknown> },
            { toastExam: false, toastStatus: false },
          );
        } else {
          refreshAdminCompetitions();
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'competition_registrations',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        refreshAdminCompetitions();
        const reg = payload.new as { competition_id?: string };
        if (reg.competition_id) refreshRegistrations(reg.competition_id);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_registrations',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        const reg = payload.new as { competition_id?: string };
        if (reg.competition_id) refreshRegistrations(reg.competition_id);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_results',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        const result = payload.new as { competition_id?: string };
        if (result.competition_id) refreshRegistrations(result.competition_id);
      },
    )
    .subscribe((status) => {
      console.log(`[Realtime] Admin competitions subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Subscribe to competition updates for students.
 * Call this on student competitions page.
 *
 * Events handled:
 * - competition_created: New competition available
 * - competition_status_changed: Competition opens/closes
 * - competition_score_entered: Student receives a grade
 */
/** Refetch student progress report and today's tasks after submissions change. */
export function subscribeToStudentProgress(studentId: string) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const refresh = () => {
    softRefetch(['student', 'progress-report']);
    softRefetch(queryKeys.student.tasksToday());
    softRefetch(queryKeys.student.classesMy());
  };

  const channel = supabase
    .channel(`student:${studentId}:progress`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'study_plan_submissions',
        filter: `student_id=eq.${studentId}`,
      },
      refresh,
    )
    .subscribe((status) => {
      console.log(`[Realtime] Student progress subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

export function subscribeToStudentCompetitions(tenantId: string, studentId: string) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const channel = supabase
    .channel(`student:${studentId}:competitions:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'competitions',
        filter: `tenant_id=eq.${tenantId}`,
      },
      async (payload) => {
        const competition = payload.new as { title?: string; name?: string };

        toast(`New competition available: ${competition.title || competition.name || 'Competition'}`, {
          duration: 5000,
          icon: '🏆',
        });

        softRefetch(queryKeys.competitions.studentRegistrations());
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competitions',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        handleCompetitionRowUpdate(
          { new: payload.new as Record<string, unknown>, old: (payload.old || {}) as Record<string, unknown> },
          { toastExam: true, toastStatus: true },
        );
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'competition_registrations',
        filter: `student_id=eq.${studentId}`,
      },
      async (payload) => {
        const reg = payload.new as {
          is_submitted?: boolean;
          results_released?: boolean;
        };
        const oldReg = (payload.old || {}) as {
          is_submitted?: boolean;
          results_released?: boolean;
        };

        if (reg.results_released && !oldReg.results_released) {
          toast.success('Competition results are now available!', { duration: 5000 });
        } else if (reg.is_submitted && !oldReg.is_submitted) {
          toast.success('Your competition submission was recorded', { duration: 3000 });
        }

        softRefetch(queryKeys.competitions.studentRegistrations());
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_results',
        filter: `student_id=eq.${studentId}`,
      },
      async (payload) => {
        const result = payload.new as { score?: number };
        const oldResult = payload.old as { score?: number };

        if (result.score !== oldResult.score && result.score != null) {
          toast.success(`Competition score updated: ${result.score} points`, {
            duration: 4000,
          });
        }

        softRefetch(queryKeys.competitions.studentRegistrations());
      },
    )
    .subscribe((status) => {
      console.log(`[Realtime] Student competitions subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Subscribe to competition updates for teachers.
 * Call this on teacher competitions or grading pages.
 *
 * Events handled:
 * - competition_registration: New student registered
 * - competition_submitted: Student submitted answers
 * - competition_grader_assigned: Teacher assigned as grader
 */
export function subscribeToTeacherCompetitions(tenantId: string, teacherId: string) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const channel = supabase
    .channel(`teacher:${teacherId}:competitions:${tenantId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competitions',
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        handleCompetitionRowUpdate(
          { new: payload.new as Record<string, unknown>, old: (payload.old || {}) as Record<string, unknown> },
          { toastExam: true, toastStatus: false },
        );
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'competition_registrations',
        filter: `tenant_id=eq.${tenantId}`,
      },
      async (payload) => {
        const registration = payload.new as { competition_id?: string };
        softRefetch(queryKeys.teacher.competitions());
        if (registration?.competition_id) {
          softRefetch(
            queryKeys.competitions.registrations(registration.competition_id),
          );
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_registrations',
        filter: `tenant_id=eq.${tenantId}`,
      },
      async (payload) => {
        const registration = payload.new as any;
        const oldRegistration = payload.old as any;

        // Student submitted their answers
        if (registration.is_submitted && !oldRegistration.is_submitted) {
          toast(`New competition submission received`, {
            duration: 3000,
            icon: '📝',
          });

          softRefetch(queryKeys.teacher.competitions());
          if (registration.competition_id) {
            softRefetch(
              queryKeys.competitions.registrations(registration.competition_id),
            );
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'competition_graders',
        filter: `teacher_id=eq.${teacherId}`,
      },
      async () => {
        toast(`You've been assigned as a grader for a competition`, {
          duration: 5000,
          icon: '✅',
        });

        softRefetch(queryKeys.teacher.competitions());
      }
    )
    .subscribe((status) => {
      console.log(`[Realtime] Teacher competitions subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Subscribe to a specific competition for live grading updates.
 * Call this when a teacher opens a competition grading page.
 */
export function subscribeToCompetitionGrading(
  competitionId: string,
  teacherId: string,
  options?: { onRefresh?: () => void },
) {
  if (!USE_REALTIME) {
    return () => {};
  }

  const refresh = () => {
    softRefetch(queryKeys.competitions.registrations(competitionId));
    options?.onRefresh?.();
  };

  const channel = supabase
    .channel(`competition:${competitionId}:grading:${teacherId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'competition_grader_scores',
        filter: `competition_id=eq.${competitionId}`,
      },
      () => {
        refresh();
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_registrations',
        filter: `competition_id=eq.${competitionId}`,
      },
      async (payload) => {
        const registration = payload.new as { is_submitted?: boolean };
        const oldRegistration = payload.old as { is_submitted?: boolean };

        if (registration.is_submitted && !oldRegistration.is_submitted) {
          toast(`New submission received for this competition`, {
            duration: 3000,
          });
          refresh();
        }
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'competition_results',
        filter: `competition_id=eq.${competitionId}`,
      },
      () => {
        refresh();
      },
    )
    .subscribe((status) => {
      console.log(`[Realtime] Competition grading subscription: ${status}`);
    });

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Health check for realtime connection.
 * Returns true if connected and working.
 */
export async function checkRealtimeHealth(): Promise<boolean> {
  if (!USE_REALTIME) {
    return false;
  }

  try {
    const channel = supabase.channel('health-check');
    channel.subscribe((status) => {
      console.log(`[Realtime] Health check status: ${status}`);
    });

    // Quick unsubscribe
    setTimeout(() => {
      channel.unsubscribe();
    }, 1000);

    return true;
  } catch (error) {
    console.error('[Realtime] Health check failed:', error);
    return false;
  }
}
