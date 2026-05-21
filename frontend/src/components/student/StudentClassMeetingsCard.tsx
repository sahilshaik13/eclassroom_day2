import { useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2, Video } from 'lucide-react'
import { StudentMeetJoinButton } from '@/components/meet/StudentMeetJoinButton'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { queryKeys } from '@/lib/queryKeys'
import { fetchStudentClassMeetings, type ClassMeeting } from '@/services/meetApi'
import { subscribeToClassMeetings } from '@/lib/realtime'
import toast from 'react-hot-toast'

function formatWhen(iso: string) {
  try {
    return format(parseISO(iso), 'EEE, MMM d · h:mm a')
  } catch {
    return iso
  }
}

export function StudentClassMeetingsCard({ classId }: { classId: string }) {
  const queryClient = useQueryClient()
  const key = queryKeys.student.classMeetings(classId)

  const { data: meetings = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchStudentClassMeetings(classId),
    enabled: !!classId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!classId) return
    return subscribeToClassMeetings(classId, (event) => {
      void queryClient.invalidateQueries({ queryKey: key })
      if (event === 'insert') {
        toast('A new class meeting is available', { icon: '📹', duration: 5000 })
      }
    })
  }, [classId, key, queryClient])

  if (!isLoading && meetings.length === 0) return null

  return (
    <Card className="rounded-xl border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-black text-slate-900">
          <Video className="h-4 w-4 text-emerald-600" />
          Live class meetings
        </CardTitle>
        <CardDescription className="text-[10px] font-semibold text-slate-500">
          Join when your teacher starts a Google Meet session
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          </div>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m: ClassMeeting) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{m.title}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{formatWhen(m.start_at)}</p>
                </div>
                <StudentMeetJoinButton
                  meetUrl={m.meet_url}
                  startAt={m.start_at}
                  variant="card"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
