import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { competitionApi } from '@/services/competitionApi'
import { useAuthStore } from '@/stores/authStore'
import type { Competition } from '@/types'

export const CompetitionLandingPage: React.FC = () => {
  const { competition_id } = useParams<{ competition_id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user: authedUser } = useAuthStore()

  const [competition, setCompetition] = useState<Competition | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorStr, setErrorStr] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (competition_id) {
      competitionApi.getCompetitionInfo(competition_id)
        .then(res => {
          if (res.success) setCompetition(res.data)
          else setErrorStr('Failed to load competition details.')
        })
        .catch(() => setErrorStr('Error loading competition details.'))
        .finally(() => setLoading(false))
    }
  }, [competition_id])

  const handleJoin = async () => {
    if (isAuthenticated) {
      if (!competition_id) return
      setSubmitting(true)
      try {
        // Just try to register directly if already logged in
        const res = await competitionApi.register(competition_id, authedUser?.phone || '', authedUser?.name || '', competition?.tenant_id || '')
        if (res.success) {
          toast.success('Successfully joined!')
          navigate(authedUser?.role === 'student' ? '/student' : '/admin/competitions')
        }
      } catch (err) {
        navigate(`/auth/student-login?competition_id=${competition_id}`)
      } finally {
        setSubmitting(false)
      }
    } else {
      navigate(`/auth/student-login?competition_id=${competition_id}`)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium animate-pulse">Loading competition...</p>
      </div>
    </div>
  )
  
  if (errorStr && !competition) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="p-8 bg-white shadow-xl rounded-2xl max-w-md text-center border border-slate-100">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Competition Not Found</h2>
        <p className="text-slate-500 text-sm mb-6">{errorStr}</p>
        <button onClick={() => navigate('/')} className="text-blue-600 font-bold hover:underline">Return Home</button>
      </div>
    </div>
  )

  if (!competition) return null

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl shadow-blue-900/5 overflow-hidden border border-slate-100">
        <div className="aspect-[21/9] bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 relative flex items-center justify-center overflow-hidden p-8 text-center">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative z-10">
               <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white border border-white/20 mb-4 shadow-xl">
                  Upcoming Event
               </div>
               <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-sm">
                  {competition.title}
               </h1>
            </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="flex flex-wrap items-center gap-3 mb-8">
             <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100">
                📅 {competition.start_date ? new Date(competition.start_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'TBD'}
             </div>
             <div className="flex items-center gap-2 bg-slate-50 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold border border-slate-100">
                🏆 Interactive Competition
             </div>
          </div>

          <div className="prose prose-slate max-w-none mb-10">
            <h2 className="text-xl font-black text-slate-900 mb-3">About the Competition</h2>
            <p className="text-slate-500 leading-relaxed">
              {competition.description || 'Join this exciting event to showcase your knowledge and compete with peers for the top spots. Skill-up, compete, and excel!'}
            </p>
          </div>

          <div className="bg-slate-50 rounded-3xl p-6 sm:p-8 border border-slate-100 text-center">
            <h3 className="text-lg font-black text-slate-900 mb-2">Ready to take the challenge?</h3>
            <p className="text-sm text-slate-500 mb-8 max-w-xs mx-auto">
               Sign in with your phone number to automatically register and participate.
            </p>
            
            <button
               onClick={handleJoin}
               disabled={submitting}
               className="w-full sm:w-auto min-w-[200px] bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-black py-4 px-10 rounded-2xl transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 group"
            >
               {submitting ? (
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               ) : (
                 <>
                   Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                 </>
               )}
            </button>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-6">
               Secure Single-Step Registration
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
