import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { competitionApi } from '@/services/competitionApi'
import type { CompetitionRegistration } from '@/types'

export const CompetitionPortalPage: React.FC = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [registrations, setRegistrations] = useState<CompetitionRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [completingProfile, setCompletingProfile] = useState(false)
  const [errorStr, setErrorStr] = useState('')

  // We are treating external participants as having role 'student' 
  // but they hit this page if they use the special entry.
  // Actually, if a real student lands here, the plan says:
  useEffect(() => {
    if (user?.is_registered) {
       navigate('/student', { replace: true })
       return
    }

    competitionApi.getStudentCompetitions()
      .then(res => {
        if (res.success) setRegistrations(res.data)
      })
      .finally(() => setLoading(false))
  }, [user, navigate])

  const handleCompleteRegistration = async (e: React.FormEvent, reg: CompetitionRegistration) => {
    e.preventDefault()
    if (!name.trim()) return
    setCompletingProfile(true)
    setErrorStr('')
    try {
      const res = await competitionApi.register(reg.competition_id, reg.phone, name, reg.tenant_id)
      if (res.success) {
        setRegistrations(prev => prev.map(r => r.id === reg.id ? { ...r, name } : r))
      } else {
        // @ts-ignore
        setErrorStr(res.error?.message || 'Failed to update name')
      }
    } catch (err) {
      setErrorStr('Network error updating profile')
    } finally {
      setCompletingProfile(false)
    }
  }

  if (loading) return <div className="p-8 text-center">Loading portal...</div>

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">Competition Portal</h1>
          <button onClick={() => navigate('/auth/logout')} className="text-sm font-medium text-red-600 hover:text-red-800">
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {errorStr && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded">{errorStr}</div>}
        
        {registrations.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center">
            <p className="text-gray-600">You are not registered for any active competitions.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {registrations.map(reg => {
              const comp = reg.competitions
              const isNameMissing = reg.name === 'Competition Participant' || reg.name === 'Participant'
              const hasReleasedResult = !!(reg.results_released && reg.competition_results && reg.competition_results.length > 0)
              const hasHiddenResult = !!(!reg.results_released && reg.competition_results && reg.competition_results.length > 0)
              const releasedResult = hasReleasedResult ? reg.competition_results![0] : null
              
              return (
                <div key={reg.id} className="bg-white overflow-hidden shadow rounded-lg border border-gray-100">
                  <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      {comp?.title || 'Unknown Competition'}
                    </h3>
                    <div className="mt-2 max-w-xl text-sm text-gray-500">
                      <p>Status: <span className="font-semibold text-blue-600 uppercase">{reg.status}</span></p>
                      {comp?.start_date && <p>Starts: {new Date(comp.start_date).toLocaleDateString()}</p>}
                    </div>

                    {isNameMissing ? (
                      <div className="mt-5 border-t pt-5">
                        <p className="text-sm text-gray-700 mb-3 font-medium">Please provide your full name to complete registration:</p>
                        <form onSubmit={(e) => handleCompleteRegistration(e, reg)} className="flex items-center gap-3">
                          <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Full Name"
                            required
                            className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                          />
                          <button
                            type="submit"
                            disabled={completingProfile}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300"
                          >
                            Save
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <p className="text-sm text-gray-700 font-medium">Participant Name: {reg.name}</p>
                        <p className="text-sm text-gray-700">Phone: {reg.phone}</p>
                      </div>
                    )}

                    {hasReleasedResult && (
                      <div className="mt-6 bg-green-50 rounded-md p-4 border border-green-100">
                        <h4 className="text-sm font-medium text-green-800">Your Result</h4>
                        <div className="mt-2 text-sm text-green-700">
                          <p className="text-2xl font-bold">{releasedResult?.score} / 100</p>
                          {releasedResult?.remarks && (
                            <p className="mt-1 italic">"{releasedResult.remarks}"</p>
                          )}
                        </div>
                      </div>
                    )}
                    {hasHiddenResult && (
                      <div className="mt-6 bg-amber-50 rounded-md p-4 border border-amber-100">
                        <h4 className="text-sm font-medium text-amber-800">Result Under Review</h4>
                        <div className="mt-2 text-sm text-amber-700">
                          <p>Your score has been recorded, but it will appear here only after it is officially published.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
