import { CheckCircle2 } from 'lucide-react'

type ApplicationSubmittedNoticeProps = {
  tenantName: string
  /** Teachers receive email; students may get SMS if no email on file. */
  channel?: 'email' | 'update'
}

export function ApplicationSubmittedNotice({
  tenantName,
  channel = 'email',
}: ApplicationSubmittedNoticeProps) {
  const statusLine =
    channel === 'email'
      ? 'You will receive an email regarding your application status.'
      : 'You will receive an update regarding your application status.'

  return (
    <div className="p-12 text-center animate-in fade-in zoom-in duration-500">
      <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-3">Application Received!</h2>
      <p className="text-slate-600 mb-4 max-w-md mx-auto leading-relaxed">
        Thank you for applying to <strong>{tenantName}</strong>.
      </p>
      <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
        Your application will be processed within <strong>3–5 working days</strong>. {statusLine}{' '}
        Please stay tuned.
      </p>
    </div>
  )
}
