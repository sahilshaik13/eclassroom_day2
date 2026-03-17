import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { authApi } from '@/services/authApi'
import toast from 'react-hot-toast'

// Utility to decode JWT without verification (safe for client-side)
const decodeJWT = (token: string) => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const decoded = JSON.parse(atob(parts[1]))
    return decoded
  } catch {
    return null
  }
}

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleCallback = async () => {
      // Parse URL hash for access_token and type
      const hashData = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashData.get('access_token')
      const type = hashData.get('type')

      if (accessToken && type === 'invite') {
        // Decode token to extract email
        const decoded = decodeJWT(accessToken)
        const email = decoded?.email
        
        // Store temporarily for setPassword
        localStorage.setItem('temp_invite_token', accessToken)
        if (email) {
          localStorage.setItem('temp_invite_email', email)
        }

        try {
          // Temporarily set token for the status check
          localStorage.setItem('access_token', accessToken)
          
          const statusRes = await authApi.getUserStatus()
          const { has_password } = statusRes.data.data

          if (has_password) {
            // If password already set, go to login
            localStorage.removeItem('temp_invite_token')
            localStorage.removeItem('temp_invite_email')
            localStorage.removeItem('access_token')
            toast.success('Account already active. Please login.')
            navigate('/auth/login', { replace: true })
          } else {
            // Direct to password setup
            // Note: We keep access_token in localStorage so SetupPasswordPage 
            // can use it if needed, OR we can rely on temp_invite_token.
            // SetupPasswordPage uses temp_invite_token explicitly.
            localStorage.removeItem('access_token') 
            navigate('/auth/setup-password', { replace: true })
          }
        } catch (error) {
          console.error('Failed to verify user status:', error)
          localStorage.removeItem('access_token')
          // Fallback to setup password if status check fails but we have a token
          navigate('/auth/setup-password', { replace: true })
        }
      } else {
        // Unknown or unsupported callback type, redirect to login
        localStorage.removeItem('access_token')
        navigate('/auth/login', { replace: true })
      }
    }

    handleCallback()
  }, [navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <Loader2 className="w-8 h-8 text-gold animate-spin mb-4" />
      <p className="text-white/70">Processing authentication...</p>
    </div>
  )
}
