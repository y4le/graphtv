import { isSeriesRef } from '../providers/ratingsdb/seriesRef.js'

export const DEFAULT_PROVIDER = 'tvmaze'

export function parseShowRef(showRef) {
  const [provider, ...idParts] = showRef.split(':')

  const id = idParts.join(':')
  if (!provider || !id) {
    throw new Error(`Invalid show reference: ${showRef}`)
  }

  return {
    provider,
    id
  }
}

export function getActiveProvider(
  urlParams = new URLSearchParams(window.location.search)
) {
  return urlParams.get('api') || DEFAULT_PROVIDER
}

export function resolveActiveShowRef(
  showRef,
  activeProvider = getActiveProvider()
) {
  if (activeProvider !== 'ratingsdb' || typeof showRef !== 'string') {
    return showRef
  }

  let parsed
  try {
    parsed = parseShowRef(showRef)
  } catch {
    return showRef
  }

  if (parsed.provider === 'ratingsdb') {
    return showRef
  }

  const candidate =
    parsed.provider === 'omdb'
      ? parsed.id
      : ['imdb', 'tvmaze', 'tmdb'].includes(parsed.provider)
        ? `${parsed.provider}:${parsed.id}`
        : null

  return candidate && isSeriesRef(candidate)
    ? `ratingsdb:${candidate}`
    : showRef
}
