import { create } from 'zustand'

export type StudyPlanLeaveChoice = 'stay' | 'discard' | 'sync'

type StudyPlanSyncState = {
  /** Saved to server but not published to students since last sync/load */
  needsStudentSync: boolean
  /** Editor fields changed but not yet saved (blur) */
  hasPendingEdits: boolean
  leaveOpen: boolean
  leaveResolve: ((choice: StudyPlanLeaveChoice) => void) | null
  syncHandler: (() => Promise<boolean>) | null
  flushPendingEditsHandler: (() => Promise<boolean>) | null
  markNeedsStudentSync: () => void
  markPendingEdits: () => void
  clearPendingEdits: () => void
  resetOnPlanLoad: () => void
  markSyncedToStudents: () => void
  needsLeaveGuard: () => boolean
  setSyncHandler: (fn: (() => Promise<boolean>) | null) => void
  setFlushPendingEditsHandler: (fn: (() => Promise<boolean>) | null) => void
  askBeforeLeave: () => Promise<StudyPlanLeaveChoice>
  resolveLeave: (choice: StudyPlanLeaveChoice) => void
  closeLeaveDialog: () => void
}

export const useStudyPlanSyncStore = create<StudyPlanSyncState>((set, get) => ({
  needsStudentSync: false,
  hasPendingEdits: false,
  leaveOpen: false,
  leaveResolve: null,
  syncHandler: null,
  flushPendingEditsHandler: null,

  markNeedsStudentSync: () => set({ needsStudentSync: true }),

  markPendingEdits: () => set({ hasPendingEdits: true }),

  clearPendingEdits: () => set({ hasPendingEdits: false }),

  resetOnPlanLoad: () =>
    set({
      needsStudentSync: false,
      hasPendingEdits: false,
    }),

  markSyncedToStudents: () =>
    set({
      needsStudentSync: false,
      hasPendingEdits: false,
    }),

  needsLeaveGuard: () => {
    const { needsStudentSync, hasPendingEdits } = get()
    return needsStudentSync || hasPendingEdits
  },

  setSyncHandler: (fn) => set({ syncHandler: fn }),

  setFlushPendingEditsHandler: (fn) => set({ flushPendingEditsHandler: fn }),

  askBeforeLeave: () => {
    if (!get().needsLeaveGuard()) {
      return Promise.resolve('discard')
    }
    if (get().leaveOpen) {
      return Promise.resolve('stay')
    }
    return new Promise<StudyPlanLeaveChoice>((resolve) => {
      set({ leaveOpen: true, leaveResolve: resolve })
    })
  },

  resolveLeave: (choice) => {
    const resolve = get().leaveResolve
    set({ leaveOpen: false, leaveResolve: null })
    if (choice === 'discard') {
      set({ hasPendingEdits: false })
    }
    resolve?.(choice)
  },

  closeLeaveDialog: () => {
    const resolve = get().leaveResolve
    set({ leaveOpen: false, leaveResolve: null })
    resolve?.('stay')
  },
}))
