import { useEffect, useState } from 'react'
import { GraduationCap, CheckCircle2, Clock, User, Phone, Mail, FileText, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { clsx } from 'clsx'

interface Applicant {
    id: string
    name: string
    phone?: string
    email?: string
    gender?: string
    nationality?: string
    level?: string
    created_at: string
    is_registered?: boolean
    deactivated_at?: string
}

type Tab = 'pending' | 'approved' | 'all'

export default function TeacherApplicantsPage() {
    const [applicants, setApplicants] = useState<Applicant[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('pending')
    const [processingId, setProcessingId] = useState<string | null>(null)

    const load = () => {
        setLoading(true)
        api.get('/admin/students?limit=50')
            .then(r => setApplicants(r.data.data || []))
            .catch(() => toast.error('Could not load applicants'))
            .finally(() => setLoading(false))
    }

    useEffect(load, [])

    const pendingCount = applicants.filter(a => !a.is_registered && !a.deactivated_at).length

    const filtered = applicants.filter(a => {
        if (tab === 'pending') return !a.is_registered && !a.deactivated_at
        if (tab === 'approved') return !!a.is_registered
        return true
    })

    const formatDate = (dateStr: string) => {
        if (!dateStr) return ''
        const diff = Date.now() - new Date(dateStr).getTime()
        const hours = Math.floor(diff / 3600000)
        if (hours < 1) return 'Just now'
        if (hours < 24) return `${hours}h ago`
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    return (
        <DashboardPageLayout
            title="New Applicants"
            description="Review students who have registered and are awaiting class enrollment."
        >
            <div className="space-y-5">

                {/* Tabs */}
                <div className="flex items-center gap-2 border-b border-slate-100">
                    {(['pending', 'approved', 'all'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={clsx(
                                'px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize',
                                tab === t
                                    ? 'text-slate-900 bg-white border border-b-white border-slate-200 -mb-px'
                                    : 'text-slate-400 hover:text-slate-600'
                            )}
                        >
                            {t}
                            {t === 'pending' && pendingCount > 0 && (
                                <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded-full">
                                    {pendingCount}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* List */}
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-20 bg-slate-100 animate-pulse rounded-2xl" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="h-14 w-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                            <GraduationCap className="h-7 w-7 text-slate-300" />
                        </div>
                        <h3 className="text-base font-bold text-slate-700">
                            {tab === 'pending' ? 'No pending applicants' : 'No applicants found'}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1 max-w-xs leading-relaxed">
                            {tab === 'pending'
                                ? 'New students who register will appear here for your review.'
                                : 'No students match this filter.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(applicant => (
                            <ApplicantCard
                                key={applicant.id}
                                applicant={applicant}
                                processing={processingId === applicant.id}
                                onRefresh={load}
                                onProcess={setProcessingId}
                                formatDate={formatDate}
                            />
                        ))}
                    </div>
                )}
            </div>
        </DashboardPageLayout>
    )
}

function ApplicantCard({
    applicant, processing, onRefresh, onProcess, formatDate,
}: {
    applicant: Applicant
    processing: boolean
    onRefresh: () => void
    onProcess: (id: string | null) => void
    formatDate: (d: string) => string
}) {
    const isApproved = !!applicant.is_registered
    const initials = applicant.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    const handleApprove = async () => {
        onProcess(applicant.id)
        try {
            await api.patch(`/admin/students/${applicant.id}`, { is_registered: true })
            toast.success(`${applicant.name} approved!`)
            onRefresh()
        } catch {
            toast.error('Could not approve applicant')
        } finally {
            onProcess(null)
        }
    }

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                {/* Avatar + Info */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Avatar className="h-12 w-12 border border-slate-100 shrink-0">
                        <AvatarFallback className={clsx(
                            'text-sm font-bold',
                            isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                        )}>
                            {initials}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-bold text-slate-900 truncate">{applicant.name}</span>
                            <Badge className={clsx(
                                'text-[10px] font-bold border-none px-2 py-0.5',
                                isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            )}>
                                {isApproved ? '✓ Approved' : '⏳ Pending'}
                            </Badge>
                        </div>

                        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                            {applicant.phone && (
                                <span className="flex items-center gap-1">
                                    <Phone className="h-3 w-3" />{applicant.phone}
                                </span>
                            )}
                            {applicant.email && (
                                <span className="flex items-center gap-1">
                                    <Mail className="h-3 w-3" />{applicant.email}
                                </span>
                            )}
                            {applicant.nationality && (
                                <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />{applicant.nationality}
                                </span>
                            )}
                            {applicant.level && (
                                <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />Level {applicant.level}
                                </span>
                            )}
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />Applied {formatDate(applicant.created_at)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action */}
                {!isApproved ? (
                    <Button
                        size="sm"
                        onClick={handleApprove}
                        disabled={processing}
                        className="gap-1.5 h-9 bg-blue-600 hover:bg-blue-700 text-xs font-semibold rounded-xl min-w-[100px] shrink-0"
                    >
                        {processing
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><CheckCircle2 className="h-3.5 w-3.5" />Approve</>
                        }
                    </Button>
                ) : (
                    <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold shrink-0">
                        <CheckCircle2 className="h-4 w-4" />Enrolled
                    </div>
                )}

            </div>
        </div>
    )
}