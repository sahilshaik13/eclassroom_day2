export type SupabaseAuthTokens = {
  accessToken: string | null
  type: string | null
}

export function getSupabaseAuthTokensFromUrl(
  hash = window.location.hash,
  search = window.location.search,
): SupabaseAuthTokens {
  const hashData = new URLSearchParams(hash.startsWith('#') ? hash.substring(1) : hash)
  const searchData = new URLSearchParams(search)

  const accessToken =
    hashData.get('access_token') ||
    searchData.get('access_token') ||
    searchData.get('token')

  const type = hashData.get('type') || searchData.get('type')

  return { accessToken, type }
}

export function getSupabaseAuthUrlSuffix(
  hash = window.location.hash,
  search = window.location.search,
): string {
  if (hash) return hash
  if (search) return `#${search.substring(1)}`
  return ''
}

/** Route path (with hash suffix) when the current URL carries Supabase auth tokens. */
export function getSupabaseAuthRedirectTarget(
  pathname = window.location.pathname,
): string | null {
  if (pathname.startsWith('/auth/reset-password') || pathname.startsWith('/auth/callback')) {
    return null
  }

  const { accessToken, type } = getSupabaseAuthTokensFromUrl()
  if (!accessToken) return null

  const suffix = getSupabaseAuthUrlSuffix()

  if (type === 'recovery') {
    return `/auth/reset-password${suffix}`
  }

  if (
    type === 'invite' ||
    type === 'signup' ||
    type === 'magiclink' ||
    type === 'email' ||
    accessToken.includes('.')
  ) {
    return `/auth/callback${suffix}`
  }

  return null
}
