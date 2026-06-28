import api from './api'

export interface GatewayPolicy {
  limit: string
  enabled: boolean
}

export interface GatewayConfig {
  enabled: boolean
  maintenance_mode: boolean
  maintenance_message: string
  trust_proxy: boolean
  rate_limit_headers: boolean
  policies: Record<string, GatewayPolicy>
}

export interface GatewayStats {
  date: string
  requests: Record<string, number>
  rate_limited: Record<string, number>
  blocked: Record<string, number>
  blocked_ips: string[]
  redis_available: boolean
}

export const gatewayQueryKeys = {
  config: ['super-admin', 'gateway', 'config'] as const,
  stats: ['super-admin', 'gateway', 'stats'] as const,
}

export const gatewayAdminApi = {
  getConfig: () =>
    api.get<{ success: true; data: { config: GatewayConfig; defaults: Record<string, GatewayPolicy> } }>(
      '/super-admin/gateway/config',
    ),

  updateConfig: (config: Partial<GatewayConfig>) =>
    api.patch<{ success: true; data: { config: GatewayConfig } }>(
      '/super-admin/gateway/config',
      config,
    ),

  getStats: () =>
    api.get<{ success: true; data: { stats: GatewayStats; config: GatewayConfig } }>(
      '/super-admin/gateway/stats',
    ),

  blockIp: (ip: string) =>
    api.post<{ success: true; data: { blocked_ips: string[] } }>(
      '/super-admin/gateway/blocked-ips',
      { ip },
    ),

  unblockIp: (ip: string) =>
    api.delete<{ success: true; data: { blocked_ips: string[] } }>(
      `/super-admin/gateway/blocked-ips/${encodeURIComponent(ip)}`,
    ),
}
