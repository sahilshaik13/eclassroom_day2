import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, MailX } from 'lucide-react'
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

const isTokenExpired = (decoded: Record<string, any> | null): boolean => {
  if (!decoded?.exp) return false
  return Date.now() / 1000 > decoded.exp
}

export default function AuthCallback() {
  const navigate = useNavigate()
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase may send tokens either in the URL hash (#) or query (?)
      const hashData = new URLSearchParams(window.location.hash.substring(1))
      const searchData = new URLSearchParams(window.location.search.substring(1))

      const accessToken =
        hashData.get('access_token') ||
        searchData.get('access_token') ||
        searchData.get('token')

      // No token present — link is missing or expired
      if (!accessToken) {
        setExpired(true)
        return
      }

      const decoded = decodeJWT(accessToken)

      // Token is expired
      if (isTokenExpired(decoded)) {
        setExpired(true)
        return
      }

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
          // Password already set → go to login
          localStorage.removeItem('temp_invite_token')
          localStorage.removeItem('temp_invite_email')
          localStorage.removeItem('access_token')
          toast.success('Account already active. Please login.')
          navigate('/auth/login', { replace: true })
        } else {
          // Not set yet → go to setup
          localStorage.removeItem('access_token')
          navigate('/auth/setup-password', { replace: true })
        }
      } catch (error) {
        console.error('Failed to verify user status:', error)
        localStorage.removeItem('access_token')
        // If status check fails but token exists and isn't expired, still try setup
        navigate('/auth/setup-password', { replace: true })
      }
    }

    handleCallback()
  }, [navigate])

  if (expired) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 max-w-md">
          <MailX className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-2">Invite Link Expired</h2>
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            This invitation link has expired or is no longer valid.
          </p>
          <p className="text-white/40 text-xs">
            Please contact your administrator to resend the invitation email.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      <Loader2 className="w-8 h-8 text-gold animate-spin mb-4" />
      <p className="text-white/70">Processing authentication...</p>
    </div>
  )
}
