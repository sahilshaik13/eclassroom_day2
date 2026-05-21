import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useStudyPlanSyncStore,
  type StudyPlanLeaveChoice,
} from '@/stores/studyPlanSyncStore'

export function StudyPlanUnsyncedDialog() {
  const leaveOpen = useStudyPlanSyncStore((s) => s.leaveOpen)
  const needsStudentSync = useStudyPlanSyncStore((s) => s.needsStudentSync)
  const hasPendingEdits = useStudyPlanSyncStore((s) => s.hasPendingEdits)
  const resolveLeave = useStudyPlanSyncStore((s) => s.resolveLeave)
  const closeLeaveDialog = useStudyPlanSyncStore((s) => s.closeLeaveDialog)
  const syncHandler = useStudyPlanSyncStore((s) => s.syncHandler)
  const flushPendingEditsHandler = useStudyPlanSyncStore((s) => s.flushPendingEditsHandler)

  const handleChoice = async (choice: StudyPlanLeaveChoice) => {
    if (choice === 'sync' && syncHandler) {
      const ok = await syncHandler()
      if (!ok) {
        closeLeaveDialog()
        return
      }
    }
    resolveLeave(choice)
  }

  const description =
    hasPendingEdits && needsStudentSync
      ? 'You have unsaved edits in the day editor and changes that are not synced to students. If you leave without syncing, students will not see your latest plan and any unblurred fields may be lost.'
      : hasPendingEdits
        ? 'You have unsaved edits in the day editor. Leave this page without finishing those fields? Unsaved values in open inputs may be lost.'
        : 'You have changes that are not synced to students. If you continue without syncing, students will keep seeing the older version until you sync.'

  return (
    <Dialog open={leaveOpen} onOpenChange={(open) => !open && closeLeaveDialog()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save or sync before leaving?</DialogTitle>
          <DialogDescription className="text-left text-slate-600">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => closeLeaveDialog()}>
            Stay on page
          </Button>
          {hasPendingEdits && flushPendingEditsHandler ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 border-blue-200 text-blue-800"
              onClick={() =>
                void flushPendingEditsHandler().then((ok) => {
                  if (ok) resolveLeave('stay')
                })
              }
            >
              Save changes
            </Button>
          ) : null}
          {needsStudentSync ? (
            <Button
              type="button"
              className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void handleChoice('sync')}
            >
              <BookOpen className="h-4 w-4" />
              Sync to students
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="text-slate-600"
            onClick={() => void handleChoice('discard')}
          >
            Leave without syncing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
