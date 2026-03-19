import { useEffect, useState } from 'react'
import { Video, Clock, Calendar, Users, Hash, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { EnrolledClass } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const DAYS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

export default function StudentClassesPage() {
  const [classes, setClasses] = useState<EnrolledClass[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/classroom/classes/my')
      .then(res => setClasses(res.data.data))
      .catch(() => toast.error('Could not load your classes'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardPageLayout
      title="My Learning Path"
      description="Access your enrolled sessions, schedules, and virtual classrooms."
      actions={
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
          <Hash className="h-3 w-3 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {classes.length} {classes.length === 1 ? 'Subscription' : 'Subscriptions'}
          </span>
        </div>
      }
    >
      <div className="space-y-8">
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="h-64 w-full bg-slate-50 animate-pulse rounded-[2rem] border border-slate-100" />)}
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="h-20 w-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-6">
              <Users className="h-10 w-10 text-slate-300" />
            </div>
            <h3 className="text-2xl font-black text-slate-900">No active enrollments</h3>
            <p className="text-slate-500 max-w-sm mt-3 leading-relaxed font-medium">
              You aren't enrolled in any classes yet. Please contact support or browse the catalogue to begin your journey.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2">
            {classes.map(cls => (
              <Card key={cls.id} className="group border-slate-200/60 shadow-xl shadow-slate-200/20 hover:shadow-primary/10 hover:-translate-y-1 transition-all duration-500 overflow-hidden bg-white/50 backdrop-blur-sm rounded-[2rem]">
                <CardHeader className="p-8 pb-4">
                  <div className="flex justify-between items-start mb-6">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/5 text-primary rounded-full text-[9px] font-black uppercase tracking-widest border border-primary/10">
                      <ShieldCheck className="h-3 w-3" /> Active Enrollment
                    </div>
                    {cls.zoom_link && (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-black uppercase tracking-wider">
                        Class Live Soon
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-2xl font-black text-slate-900 group-hover:text-primary transition-colors">{cls.name}</CardTitle>
                  <div className="flex items-center gap-3 mt-4">
                    <Avatar className="h-8 w-8 border-2 border-white shadow-sm ring-1 ring-slate-100">
                      <AvatarFallback className="bg-slate-100 text-slate-500 font-bold text-[10px]">
                        {cls.teacher.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{cls.teacher.name}</p>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Primary Educator</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-8 pt-4">
                  <div className="bg-slate-50/50 rounded-3xl p-6 mb-8 border border-slate-100 group-hover:bg-white transition-colors duration-500">
                    <h5 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> Weekly Commitment
                    </h5>
                    {cls.schedule_json ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100">
                            <Clock className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{cls.schedule_json.time}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{cls.schedule_json.timezone}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {cls.schedule_json.days.map(d => (
                            <span key={d} className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm">
                              {DAYS[d] || d}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs italic text-slate-400">Schedule pending teacher update</p>
                    )}
                  </div>

                  {cls.zoom_link ? (
                    <Button
                      asChild
                      className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-xs gap-3 shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <a href={cls.zoom_link} target="_blank" rel="noopener noreferrer">
                        <Video className="h-5 w-5" />
                        Enter Classroom Portal
                      </a>
                    </Button>
                  ) : (
                    <div className="w-full h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-bold uppercase tracking-widest border border-slate-200/50">
                      Classroom Link TBA
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardPageLayout>
  )
}
