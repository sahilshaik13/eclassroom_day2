/**
 * React Query mutation hook for toggling study plan tasks.
 *
 * Features:
 * - Optimistic updates: UI updates immediately before API call
 * - Rollback on error: Reverts UI if the API call fails
 * - Automatic invalidation: Refreshes related queries after success
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { queryKeys } from '@/lib/queryKeys';
import { softRefetchStudyPlan } from '@/lib/studyPlanQueries';
import toast from 'react-hot-toast';

interface ToggleTaskParams {
  taskId: string;
  taskTitle: string;
  audioUrl?: string;
}

interface ToggleTaskContext {
  previousTasks: any[] | undefined;
}

/**
 * Hook for toggling task completion with optimistic UI updates.
 *
 * @param classId - The classroom ID for cache invalidation
 */
export function useToggleTask(classId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, audioUrl }: ToggleTaskParams) => {
      if (audioUrl) {
        // Submit with audio
        const res = await api.post(`/student/tasks/${taskId}/submit`, {
          content: {
            toggled: true,
            submission_mode: 'toggle_with_audio',
          },
          audio_url: audioUrl,
        });
        return res.data.data;
      } else {
        // Simple toggle
        const res = await api.patch(`/student/tasks/${taskId}/toggle`);
        return res.data.data;
      }
    },

    // Optimistic update - update UI before API call
    onMutate: async (variables): Promise<ToggleTaskContext | undefined> => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.student.tasksToday(),
      });
      await queryClient.cancelQueries({
        queryKey: ['student', 'classes', classId, 'study-plan'],
      });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(
        queryKeys.student.tasksToday()
      );

      // Optimistically update the tasks list
      queryClient.setQueryData(
        queryKeys.student.tasksToday(),
        (old: any[] | undefined) => {
          if (!old) return old;

          return old.map((task: any) => {
            if (task.id === variables.taskId) {
              // Toggle the completion status
              const newCompleted = !task.completed;
              return {
                ...task,
                completed: newCompleted,
                status: newCompleted ? 'completed' : 'pending',
              };
            }
            return task;
          });
        }
      );

      // Return context with the previous value for rollback
      return { previousTasks } as { previousTasks: any[] | undefined };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      // Revert to the previous value
      if (context?.previousTasks) {
        queryClient.setQueryData(
          queryKeys.student.tasksToday(),
          context.previousTasks
        );
      }

      // Show error toast
      toast.error(
        `Failed to update "${variables.taskTitle}". Please try again.`,
        {
          duration: 4000,
        }
      );

      console.error('[useToggleTask] Error:', err);
    },

    // Success notification
    onSuccess: (data, variables) => {
      const wasCompleted = data?.completed ?? false;
      const action = wasCompleted ? 'completed' : 'unmarked';

      toast.success(`Task "${variables.taskTitle}" ${action}`, {
        duration: 2000,
      });
    },

    onSettled: () => {
      softRefetchStudyPlan(queryClient, ['student', 'classes', classId, 'study-plan']);
      softRefetchStudyPlan(queryClient, queryKeys.student.tasksToday());
    },
  });
}
