import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  GraduationCap,
  Users,
  Settings,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const PORTALS = [
  {
    title: "Registration Form",
    description: "Onboard new students with our optimized, high-conversion registration flow.",
    href: "/auth/student-registration",
    icon: ClipboardCheck,
    color: "from-blue-600 to-indigo-700",
    shadow: "shadow-blue-500/20",
    delay: "delay-0"
  },
  {
    title: "Student Portal",
    description: "Interactive learning experience with daily lessons, task tracking, and direct teacher access.",
    href: "/auth/student-login",
    icon: GraduationCap,
    color: "from-emerald-500 to-teal-700",
    shadow: "shadow-emerald-500/20",
    delay: "delay-100"
  },
  {
    title: "Teacher Portal",
    description: "Manage classes, track student progress, and provide real-time feedback and grading.",
    href: "/auth/login",
    icon: Users,
    color: "from-amber-500 to-orange-600",
    shadow: "shadow-amber-500/20",
    delay: "delay-200"
  },
  {
    title: "Admin Dashboard",
    description: "Complete oversight of the institution, staff management, and curriculum configuration.",
    href: "/auth/login",
    icon: Settings,
    color: "from-violet-600 to-purple-800",
    shadow: "shadow-violet-500/20",
    delay: "delay-300"
  }
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900">

      {/* Background Orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px] opacity-60 animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-50 rounded-full blur-[120px] opacity-60 animate-pulse delay-700" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 lg:py-20 relative z-10 min-h-screen flex flex-col">

        {/* Header */}
        <header className="flex justify-center mb-16 animate-in fade-in slide-in-from-top-4 duration-1000">
          <div className="relative w-72 h-36 md:w-96 md:h-48 flex items-center justify-center">
            {/* Standard img tag instead of Next.js Image */}
            <img
              src="/assets/logo-final-v3.png"
              alt="E-Classroom Logo"
              className="object-contain w-full h-full"
            />
          </div>
        </header>

        {/* Hero Section */}
        <div className="text-center mb-16 max-w-3xl mx-auto space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="h-3 w-3" />
            Product Demo Version
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
            Experience the Future of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-emerald-600">
              Islamic Education
            </span>
          </h1>
          <p className="text-lg text-slate-600 font-medium leading-relaxed px-4">
            A comprehensive solution designed for digital transformation of Islamic institutions,
            focusing on engagement, efficiency, and premium user experience.
          </p>
        </div>

        {/* Bento Grid */}
        <main className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {PORTALS.map((portal, index) => (
            <Link key={index} to={portal.href} className="group">
              <Card className={`h-64 md:h-72 border-none shadow-lg ${portal.shadow} transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl overflow-hidden cursor-pointer animate-in fade-in zoom-in-95 duration-700 ${portal.delay}`}>
                <CardContent className="p-0 h-full flex flex-col">
                  <div className={`p-6 flex-1 bg-gradient-to-br ${portal.color} text-white relative h-full`}>

                    {/* Decorative Background Element */}
                    <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700">
                      <portal.icon className="w-40 h-40" />
                    </div>

                    <div className="relative z-10 flex flex-col h-full">
                      <div className="bg-white/20 w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/30 mb-4 shadow-inner group-hover:scale-110 transition-transform duration-500">
                        <portal.icon className="h-6 w-6 text-white" />
                      </div>

                      <h2 className="text-xl md:text-2xl font-black mb-2 tracking-tight">
                        {portal.title}
                      </h2>

                      <p className="text-white/80 font-medium leading-relaxed text-xs md:text-sm mb-4 max-w-xs">
                        {portal.description}
                      </p>

                      <div className="mt-auto flex items-center gap-2 text-xs font-bold bg-white/10 w-fit px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/20 group-hover:bg-white group-hover:text-slate-900 transition-all duration-300">
                        Explore Portal
                        <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </main>

        {/* Footer */}
        <footer className="mt-16 text-center animate-in fade-in duration-1000 delay-1000">
          <p className="text-slate-400 text-sm font-medium">
            &copy; {new Date().getFullYear()} ThinkTarteeb. Built for premium Islamic institutions worldwide.
          </p>
        </footer>

      </div>
    </div>
  );
}
