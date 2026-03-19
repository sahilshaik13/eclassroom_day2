import { useEffect, useState } from 'react'
import { Users, MessageCircle, CheckCircle2, ChevronRight, Clock, Calendar, PlayCircle, BookOpen, Layout, Sparkles } from 'lucide-react'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function TeacherDashboard() {
  const { user } = useAuthStore()
  const [pendingDoubts, setPendingDoubts] = useState(5)

  useEffect(() => {
    api.get('/teacher/pulse/today')
      .then(res => {
        const pulse = res.data.data
        const doubts = pulse.reduce((s: number, p: any) => s + p.pending_doubts, 0)
        setPendingDoubts(doubts || 5)
      })
      .catch(() => { /* ignore, use fallback for now */ })
  }, [])

  const avgAttendance = 95 
// Hardcoded for design demo as requested in sample

  return (
    <div className="space-y-10 pb-20 animate-in fade-in duration-700">
      {/* Welcome Banner */}
      <div className="space-y-2">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          Assalamu'Alaykum, {user?.name.split(' ')[0]}!
          <Sparkles className="h-6 w-6 text-amber-400 fill-amber-400" />
        </h1>
        <p className="text-slate-500 font-medium text-lg leading-relaxed">
          You have <span className="text-primary font-bold">3 classes</span> and <span className="text-orange-500 font-bold">{pendingDoubts} student questions</span> today.
        </p>
      </div>

      {/* Stats Grid - Large Colored Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Students - BLUE */}
        <div className="relative group overflow-hidden rounded-[2rem] p-8 transition-all duration-500 hover:-translate-y-1 bg-gradient-to-br from-[#4E7DFF] to-[#3B66DE] text-white shadow-2xl shadow-blue-500/20">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
            <Users className="h-10 w-10" />
          </div>
          <p className="text-6xl font-black tracking-tighter mb-2">48</p>
          <div className="flex items-center gap-2 opacity-90">
            <Users className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Total Students</span>
          </div>
        </div>

        {/* Classes Today - PURPLE */}
        <div className="relative group overflow-hidden rounded-[2rem] p-8 transition-all duration-500 hover:-translate-y-1 bg-gradient-to-br from-[#A855F7] to-[#8B5CF6] text-white shadow-2xl shadow-purple-500/20">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
            <Calendar className="h-10 w-10" />
          </div>
          <p className="text-6xl font-black tracking-tighter mb-2">3</p>
          <div className="flex items-center gap-2 opacity-90">
            <Layout className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Classes Today</span>
          </div>
        </div>

        {/* Student Questions - ORANGE */}
        <div className="relative group overflow-hidden rounded-[2rem] p-8 transition-all duration-500 hover:-translate-y-1 bg-gradient-to-br from-[#FF922B] to-[#F76707] text-white shadow-2xl shadow-orange-500/20">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
            <MessageCircle className="h-10 w-10" />
          </div>
          <p className="text-6xl font-black tracking-tighter mb-2">{pendingDoubts}</p>
          <div className="flex items-center gap-2 opacity-90">
            <MessageCircle className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Student Questions</span>
          </div>
        </div>

        {/* Avg Attendance - GREEN */}
        <div className="relative group overflow-hidden rounded-[2rem] p-8 transition-all duration-500 hover:-translate-y-1 bg-gradient-to-br from-[#20C997] to-[#12B886] text-white shadow-2xl shadow-emerald-500/20">
          <div className="absolute top-0 right-0 p-6 opacity-20 group-hover:scale-110 transition-transform">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <p className="text-6xl font-black tracking-tighter mb-2">{avgAttendance}%</p>
          <div className="flex items-center gap-2 opacity-90">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-black uppercase tracking-widest">Avg. Attendance</span>
          </div>
        </div>
      </div>

      {/* Today's Schedule Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Today's Schedule</h2>
          <Button variant="ghost" className="text-primary font-black uppercase tracking-widest text-xs gap-2">
            View All <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/20 hover:border-primary/20 transition-all group overflow-hidden relative">
             <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
               <div className="space-y-4">
                 <div className="flex items-center gap-3">
                   <Badge className="bg-slate-100 text-slate-500 border-none px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                     Batch A
                   </Badge>
                   <Badge className="bg-primary/10 text-primary border-none px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                     Upcoming
                   </Badge>
                 </div>
                 
                 <div className="space-y-1">
                   <h3 className="text-2xl font-black text-slate-900 leading-tight">Tajweed Fundamentals</h3>
                   <div className="flex items-center gap-6 mt-3 text-slate-400">
                     <div className="flex items-center gap-2">
                       <Clock className="h-4 w-4" />
                       <span className="text-sm font-bold">4:00 PM - 5:30 PM</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <Users className="h-4 w-4" />
                       <span className="text-sm font-bold">15 Students</span>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                 <Button className="h-14 px-10 rounded-2xl bg-[#6345FF] hover:bg-[#5335EE] text-white font-black uppercase tracking-widest text-xs gap-3 shadow-xl shadow-purple-500/20 w-full sm:w-auto">
                   <PlayCircle className="h-5 w-5" /> Start Class
                 </Button>
                 <Button variant="outline" className="h-14 px-10 rounded-2xl border-slate-200 text-slate-600 font-black uppercase tracking-widest text-xs gap-3 hover:bg-slate-50 w-full sm:w-auto">
                   <BookOpen className="h-5 w-5" /> View Materials
                 </Button>
               </div>
             </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl shadow-slate-200/20 hover:border-primary/20 transition-all group overflow-hidden relative opacity-90">
             <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
               <div className="space-y-4">
                 <div className="flex items-center gap-3">
                   <Badge className="bg-slate-100 text-slate-500 border-none px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                     Batch B
                   </Badge>
                   <Badge className="bg-primary/10 text-primary border-none px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                     Upcoming
                   </Badge>
                 </div>
                 
                 <div className="space-y-1">
                   <h3 className="text-2xl font-black text-slate-900 leading-tight">Advanced Hifz</h3>
                   <div className="flex items-center gap-6 mt-3 text-slate-400">
                     <div className="flex items-center gap-2">
                       <Clock className="h-4 w-4" />
                       <span className="text-sm font-bold">6:00 PM - 7:30 PM</span>
                     </div>
                     <div className="flex items-center gap-2">
                       <Users className="h-4 w-4" />
                       <span className="text-sm font-bold">12 Students</span>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                 <Button className="h-14 px-10 rounded-2xl bg-[#6345FF] hover:bg-[#5335EE] text-white font-black uppercase tracking-widest text-xs gap-3 shadow-xl shadow-purple-500/20 w-full sm:w-auto">
                   <PlayCircle className="h-5 w-5" /> Start Class
                 </Button>
                 <Button variant="outline" className="h-14 px-10 rounded-2xl border-slate-200 text-slate-600 font-black uppercase tracking-widest text-xs gap-3 hover:bg-slate-50 w-full sm:w-auto">
                   <BookOpen className="h-5 w-5" /> View Materials
                 </Button>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
