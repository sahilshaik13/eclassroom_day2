import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TaskType } from '@/components/study-plan/StudyPlanBuilder'

export type EditableCalendarTask = {
  id: string
  title: string
  description?: string
  task_type: string
  required?: boolean
}

type StudyPlanTaskEditModalProps = {
  open: boolean
  task: EditableCalendarTask | null
  dayLabel?: string
  periodLabel?: string
  saving?: boolean
  onClose: () => void
  onSave: (updates: {
    title: string
    description?: string
    task_type: TaskType
    required: boolean
  }) => void | Promise<void>
}

const TASK_TYPE_KEYS: { value: TaskType; key: string }[] = [
  { value: 'memorise', key: 'studyPlan.memorise' },
  { value: 'review', key: 'studyPlan.reviewType' },
  { value: 'recite', key: 'studyPlan.recite' },
  { value: 'listen', key: 'studyPlan.listen' },
  { value: 'read', key: 'studyPlan.readType' },
  { value: 'mcq', key: 'studyPlan.quizMcq' },
  { value: 'written', key: 'studyPlan.written' },
  { value: 'reflection', key: 'studyPlan.reflection' },
]

export function StudyPlanTaskEditModal({
  open,
  task,
  dayLabel,
  periodLabel,
  saving,
  onClose,
  onSave,
}: StudyPlanTaskEditModalProps) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [taskType, setTaskType] = useState<TaskType>('memorise')
  const [required, setRequired] = useState(true)

  useEffect(() => {
    if (!task) return
    setTitle(task.title || '')
    setDescription(task.description || '')
    setTaskType((task.task_type as TaskType) || 'memorise')
    setRequired(task.required !== false)
  }, [task])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      task_type: taskType,
      required,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t('studyPlan.editTask')}</DialogTitle>
          <DialogDescription>
            {dayLabel ? `${dayLabel}` : t('studyPlan.studyPlanTask')}
            {periodLabel ? ` · ${periodLabel}` : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t('studyPlan.taskTitle')}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">{t('studyPlan.descriptionOptional')}</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[80px] rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('studyPlan.type')}</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPE_KEYS.map((tt) => (
                    <SelectItem key={tt.value} value={tt.value}>
                      {t(tt.key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.required')}</Label>
              <Select
                value={required ? 'yes' : 'no'}
                onValueChange={(v) => setRequired(v === 'yes')}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">{t('common.yes')}</SelectItem>
                  <SelectItem value="no">{t('common.no')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="rounded-xl bg-slate-900 hover:bg-slate-800" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('studyPlan.saveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
