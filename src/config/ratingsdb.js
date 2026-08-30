// The RatingsDB base URL is public deployment configuration, not a credential,
// so it is a plain build-time Vite variable rather than a generated client
// secret. An unset or malformed value leaves the provider unconfigured.
export function getRatingsdbApiBase(env = import.meta.env) {
  const raw = env?.VITE_RATINGSDB_API_BASE
  if (typeof raw !== 'string' || !raw.trim()) {
    return null
  }

  let url
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return null
  }

  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`
}

export function isConfigured(env) {
  return getRatingsdbApiBase(env) !== null
}
