import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Activity, Ban, RefreshCw, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { DashboardPageLayout } from '@/components/layout/DashboardPageLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  gatewayAdminApi,
  gatewayQueryKeys,
  type GatewayConfig,
  type GatewayPolicy,
} from '@/services/gatewayAdminApi'
import { useState } from 'react'

const POLICY_LABELS: Record<string, string> = {
  global: 'Global (all routes)',
  auth: 'Authentication',
  public: 'Public endpoints',
  api: 'Authenticated API',
  admin: 'Admin portal',
  super_admin: 'Super admin',
  translate: 'Translation',
  sse: 'Live streams (SSE)',
}

function PolicyRow({
  name,
  policy,
  onChange,
}: {
  name: string
  policy: GatewayPolicy
  onChange: (patch: Partial<GatewayPolicy>) => void
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-[1fr_140px_auto] sm:items-center">
      <div>
        <p className="text-sm font-semibold text-slate-900">{POLICY_LABELS[name] ?? name}</p>
        <p className="text-xs text-slate-500">Per IP · sliding window</p>
      </div>
      <Input
        value={policy.limit}
        onChange={(e) => onChange({ limit: e.target.value })}
        placeholder="100/minute"
        className="bg-white"
      />
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={policy.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span className="text-xs text-slate-600">{policy.enabled ? 'On' : 'Off'}</span>
      </div>
    </div>
  )
}

export default function SuperAdminGatewayPage() {
  const queryClient = useQueryClient()
  const [newIp, setNewIp] = useState('')
  const [draft, setDraft] = useState<GatewayConfig | null>(null)

  const configQuery = useQuery({
    queryKey: gatewayQueryKeys.config,
    queryFn: async () => (await gatewayAdminApi.getConfig()).data.data,
  })

  const statsQuery = useQuery({
    queryKey: gatewayQueryKeys.stats,
    queryFn: async () => (await gatewayAdminApi.getStats()).data.data,
    refetchInterval: 30_000,
  })

  const config = draft ?? configQuery.data?.config ?? null
  const stats = statsQuery.data?.stats
  const blockedIps = stats?.blocked_ips ?? []

  const saveMutation = useMutation({
    mutationFn: () => gatewayAdminApi.updateConfig(config!),
    onSuccess: () => {
      toast.success('Gateway settings saved')
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: gatewayQueryKeys.config })
      void queryClient.invalidateQueries({ queryKey: gatewayQueryKeys.stats })
    },
    onError: () => toast.error('Failed to save gateway settings'),
  })

  const blockIpMutation = useMutation({
    mutationFn: (ip: string) => gatewayAdminApi.blockIp(ip),
    onSuccess: () => {
      toast.success('IP blocked')
      setNewIp('')
      void queryClient.invalidateQueries({ queryKey: gatewayQueryKeys.stats })
    },
    onError: () => toast.error('Failed to block IP'),
  })

  const unblockIpMutation = useMutation({
    mutationFn: (ip: string) => gatewayAdminApi.unblockIp(ip),
    onSuccess: () => {
      toast.success('IP unblocked')
      void queryClient.invalidateQueries({ queryKey: gatewayQueryKeys.stats })
    },
    onError: () => toast.error('Failed to unblock IP'),
  })

  const patchConfig = (patch: Partial<GatewayConfig>) => {
    if (!config) return
    setDraft({ ...config, ...patch })
  }

  const patchPolicy = (name: string, patch: Partial<GatewayPolicy>) => {
    if (!config) return
    setDraft({
      ...config,
      policies: {
        ...config.policies,
        [name]: { ...config.policies[name], ...patch },
      },
    })
  }

  const totalRequests = Object.values(stats?.requests ?? {}).reduce((a, b) => a + b, 0)
  const totalLimited = Object.values(stats?.rate_limited ?? {}).reduce((a, b) => a + b, 0)

  return (
    <DashboardPageLayout
      title="API Gateway"
      description="Manage rate limits, maintenance mode, and blocked IPs for the platform API."
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Activity className="h-4 w-4" /> Requests today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900">{totalRequests}</p>
              <p className="text-xs text-slate-500">{stats?.date ?? '—'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Shield className="h-4 w-4" /> Rate limited
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">{totalLimited}</p>
              <p className="text-xs text-slate-500">429 responses today</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Ban className="h-4 w-4" /> Blocked IPs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-rose-600">{blockedIps.length}</p>
              <p className="text-xs text-slate-500">
                Redis {stats?.redis_available ? 'connected' : 'unavailable'}
              </p>
            </CardContent>
          </Card>
        </div>

        {configQuery.isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">Loading gateway…</CardContent>
          </Card>
        ) : config ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Gateway controls</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft(null)
                      void statsQuery.refetch()
                      void configQuery.refetch()
                    }}
                  >
                    <RefreshCw className="mr-1 h-4 w-4" /> Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={!draft || saveMutation.isPending}
                  >
                    <Save className="mr-1 h-4 w-4" />
                    {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => patchConfig({ enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Gateway enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={config.maintenance_mode}
                      onChange={(e) => patchConfig({ maintenance_mode: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Maintenance mode
                    {config.maintenance_mode && (
                      <Badge variant="destructive">Active</Badge>
                    )}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={config.rate_limit_headers}
                      onChange={(e) => patchConfig({ rate_limit_headers: e.target.checked })}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Rate-limit headers
                  </label>
                </div>
                <div>
                  <Label htmlFor="maintenance-message">Maintenance message</Label>
                  <Input
                    id="maintenance-message"
                    className="mt-1.5"
                    value={config.maintenance_message}
                    onChange={(e) => patchConfig({ maintenance_message: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rate limit policies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(config.policies).map(([name, policy]) => (
                  <PolicyRow
                    key={name}
                    name={name}
                    policy={policy}
                    onChange={(patch) => patchPolicy(name, patch)}
                  />
                ))}
              </CardContent>
            </Card>
          </>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Blocked IP addresses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="e.g. 203.0.113.42"
                value={newIp}
                onChange={(e) => setNewIp(e.target.value)}
              />
              <Button
                variant="destructive"
                disabled={!newIp.trim() || blockIpMutation.isPending}
                onClick={() => blockIpMutation.mutate(newIp.trim())}
              >
                Block IP
              </Button>
            </div>
            {blockedIps.length === 0 ? (
              <p className="text-sm text-slate-500">No IPs are currently blocked.</p>
            ) : (
              <ul className="space-y-2">
                {blockedIps.map((ip) => (
                  <li
                    key={ip}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <code className="text-sm">{ip}</code>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={unblockIpMutation.isPending}
                      onClick={() => unblockIpMutation.mutate(ip)}
                    >
                      Unblock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardPageLayout>
  )
}
