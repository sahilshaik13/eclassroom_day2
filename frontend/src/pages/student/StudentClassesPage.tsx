import { useEffect, useState } from 'react'
import { Video, Clock, Calendar, Users, ShieldCheck, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import type { EnrolledClass } from '@/types'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
      .catch(() => toast.error('Could not load your classes'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardPageLayout
      title="My Classes"
      description="Access your curriculum and learning materials."
    >
      <div className="space-y-6">
        {/* Curriculum Resource section matching reference Image 6 */}
        <section>
          <h2 className="text-base font-bold text-slate-900 mb-4">Curriculum &amp; Resources</h2>
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-100 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  Revision Material: 15 Juz from the End (2026)
                </CardTitle>
                <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs h-8 gap-2" asChild>
                  <a href="/assets/review-15-juz.pdf" download>
                    ↓ Download Full PDF
                  </a>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-slate-100 p-4 flex flex-col items-center justify-center min-h-[300px] sm:min-h-[500px]">
                <div className="w-full max-w-3xl bg-white shadow-xl rounded-lg overflow-hidden border border-slate-200 flex flex-col">
                  <div className="bg-white border-b border-slate-100 p-2 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    <span>First 2 Pages Preview</span>
                    <span className="text-blue-600 italic">Page 1 / 2</span>
                  </div>
                  <div className="aspect-[1/1.4] w-full bg-slate-50">
                    <iframe
                      src="/assets/review-15-juz.pdf#toolbar=0&navpanes=0&scrollbar=0&view=FitH"
                      className="w-full h-full border-0"
                      title="Curriculum PDF"
                    />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-400 bg-white px-3 py-1.5 rounded-full border border-slate-200">
                  ⚠ Use download button to view all pages.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Enrolled Classes */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="h-48 bg-slate-100 animate-pulse rounded-2xl" />)}
          </div>
        ) : classes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="h-16 w-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
              <Users className="h-8 w-8 text-slate-300" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No active enrollments</h3>
            <p className="text-sm text-slate-400 max-w-xs mt-2 leading-relaxed">
              You aren't enrolled in any classes yet. Contact support to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {classes.map(cls => (
              <Card key={cls.id} className="group border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden rounded-2xl bg-white">
                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold border border-blue-100">
                      <ShieldCheck className="h-3 w-3" /> Active Enrollment
                    </div>
                    {cls.zoom_link && (
                      <Badge className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-bold">Live Soon</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{cls.name}</CardTitle>
                  <div className="flex items-center gap-2.5 mt-3">
                    <Avatar className="h-7 w-7 border border-slate-100">
                      <AvatarFallback className="bg-slate-100 text-slate-500 font-bold text-xs">
                        {cls.teacher.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{cls.teacher.name}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wide">Primary Educator</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-3">
                  <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                    <h5 className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3 flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Weekly Schedule
                    </h5>
                    {cls.schedule_json ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-white shadow-sm flex items-center justify-center border border-slate-100">
                            <Clock className="h-3.5 w-3.5 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{cls.schedule_json.time}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{cls.schedule_json.timezone}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {cls.schedule_json.days.map(d => (
                            <span key={d} className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold uppercase text-slate-600 shadow-sm">
                              {DAYS[d] || d}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs italic text-slate-400">Schedule pending</p>
                    )}
                  </div>

                  {cls.zoom_link ? (
                    <Button asChild className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-2">
                      <a href={cls.zoom_link} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4" /> Join Class
                      </a>
                    </Button>
                  ) : (
                    <div className="w-full h-11 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-semibold border border-slate-200">
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
