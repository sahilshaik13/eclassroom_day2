import { BookOpen, Calendar, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StudentMeetJoinButton } from '@/components/meet/StudentMeetJoinButton'
import type { ClassMeeting } from '@/services/meetApi'
import {
  formatMeetingDayLabel,
  formatMeetingStartTime,
  meetingUpNextBadge,
} from '@/lib/studentMeetings'

interface StudentUpcomingMeetHeroProps {
  meeting: ClassMeeting
}

export function StudentUpcomingMeetHero({ meeting }: StudentUpcomingMeetHeroProps) {
  const classLabel = meeting.class_name?.trim()
  const detailsHref = `/student/classes?class=${encodeURIComponent(meeting.class_id)}`

  return (
    <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
      <div className="absolute right-0 top-0 p-8 opacity-10">
        <BookOpen className="h-28 w-28" />
      </div>
      <CardContent className="relative z-10 p-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm">
          {meetingUpNextBadge(meeting)}
        </div>
        <h2 className="mb-1 text-2xl font-bold">{meeting.title}</h2>
        {classLabel ? (
          <p className="mb-2 text-sm font-medium text-indigo-100/90">{classLabel}</p>
        ) : null}
        <div className="mb-5 flex flex-wrap items-center gap-4 text-sm text-indigo-100">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {formatMeetingDayLabel(meeting.start_at)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatMeetingStartTime(meeting.start_at)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StudentMeetJoinButton
            meetUrl={meeting.meet_url}
            startAt={meeting.start_at}
            variant="hero"
          />
          <Button
            variant="outline"
            className="rounded-xl border-white/40 bg-transparent text-white hover:bg-white/10"
            asChild
          >
            <Link to={detailsHref}>View Details</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
