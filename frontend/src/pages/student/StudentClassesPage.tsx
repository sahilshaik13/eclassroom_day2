import { useEffect, useState } from 'react'
import { Video, Clock, Calendar, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { EnrolledClass } from '@/types'

const DAYS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
}

export default function StudentClassesPage() {
  const [classes, setClasses] = useState<EnrolledClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/classroom/classes/my')
      .then(res => setClasses(res.data.data))
      .catch(() => toast.error('Could not load classes'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6 grid gap-4 sm:grid-cols-2">
      {[1, 2].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
    </div>
  )

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-xl text-ink">My Classes</h1>
        <p className="text-sm text-ink-muted mt-0.5">{classes.length} enrolled class{classes.length !== 1 ? 'es' : ''}</p>
      </div>

      {classes.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-8 h-8 text-ink-faint mx-auto mb-3" />
          <p className="text-sm text-ink-muted">You are not enrolled in any classes yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 stagger">
          {classes.map(cls => (
            <div key={cls.id} className="card-hover flex flex-col gap-4">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">{cls.name}</h2>
                <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {cls.teacher.name}
                </p>
              </div>

              {cls.schedule_json && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Calendar className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span>
                      {cls.schedule_json.days.map(d => DAYS[d] ?? d).join(', ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <Clock className="w-3.5 h-3.5 text-gold shrink-0" />
                    <span>{cls.schedule_json.time} ({cls.schedule_json.timezone})</span>
                  </div>
                </div>
              )}

              {cls.zoom_link ? (
                <a
                  href={cls.zoom_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm mt-auto"
                >
                  <Video className="w-4 h-4" /> Join Class
                </a>
              ) : (
                <p className="text-xs text-ink-faint mt-auto">No Zoom link set yet</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
