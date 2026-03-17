import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Parse URL hash for access_token and type
    const hashData = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashData.get('access_token')
    const type = hashData.get('type')

    if (accessToken && type === 'invite') {
      // Store temporarily and redirect to password setup
      localStorage.setItem('temp_invite_token', accessToken)
      navigate('/auth/setup-password', { replace: true })
    } else {
      // Unknown or unsupported callback type, redirect to login
      navigate('/auth/login', { replace: true })
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <Loader2 className="w-8 h-8 text-gold animate-spin mb-4" />
      <p className="text-white/70">Processing authentication...</p>
    </div>
  )
}
