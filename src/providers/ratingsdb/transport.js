import { getRatingsdbApiBase } from '../../config/ratingsdb.js'
import {
  API_CACHE_TTL,
  decodeJsonResponse,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import { memoizeBundle, readMemoizedBundle } from './bundleMemo.js'
import {
  normalizeRatingsdbBundle,
  normalizeRatingsdbSearch
} from './normalize.js'
import { assertSeriesRef, isTconst } from './seriesRef.js'

export const MAX_RETRY_AFTER_MS = 30_000

export function parseRetryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string') {
    return null
  }

  const header = value.trim()
  if (!header) {
    return null
  }

  let delayMs
  if (/^\d+$/u.test(header)) {
    delayMs = Number(header) * 1000
  } else if (/^[A-Za-z]/u.test(header)) {
    const retryAt = Date.parse(header)
    if (!Number.isFinite(retryAt)) {
      return null
    }
    delayMs = retryAt - now
  } else {
    return null
  }

  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, delayMs))
}

function isChartBundle(value) {
  return value?.schemaVersion === 1
}

function classifyChartBundle(value) {
  return { cache: isChartBundle(value) }
}

function classifySearchResponse(value) {
  return { cache: Array.isArray(value?.results) }
}

function requireApiBase() {
  const apiBase = getRatingsdbApiBase()
  if (!apiBase) {
    throw new Error(
      'RatingsDB is not configured. Set VITE_RATINGSDB_API_BASE to enable it.'
    )
  }

  return apiBase
}

export class RatingsdbPendingError extends Error {
  constructor(body, retryAfterMs = null) {
    super(body?.error || 'RatingsDB request is pending.')
    this.name = 'RatingsdbPendingError'
    this.provider = 'ratingsdb'
    this.code = body?.code
    this.capability = body?.degradation?.capability
    this.reason = body?.degradation?.reason
    this.retryAfterMs = retryAfterMs
    this.pending = true
  }
}

export class RatingsdbResponseError extends Error {
  constructor(body) {
    super(body?.error || 'RatingsDB returned an invalid response.')
    this.name = 'RatingsdbResponseError'
    this.provider = 'ratingsdb'
    this.code = body?.code
  }
}

function responseError(body) {
  if (typeof body?.code === 'string' && body.code.endsWith('_pending')) {
    return new RatingsdbPendingError(body)
  }

  return new RatingsdbResponseError(body)
}

async function decodeRatingsdbResponse(response) {
  if (response.status !== 202) {
    return decodeJsonResponse(response)
  }

  const body = await response.json().catch(() => null)
  throw new RatingsdbPendingError(
    body,
    parseRetryAfterMs(response.headers.get('Retry-After'))
  )
}

export async function search(query, options = {}) {
  const term = typeof query === 'string' ? query.trim() : ''
  if (!term) {
    return []
  }

  const apiBase = requireApiBase()
  const body = await requestJson(
    {
      provider: 'ratingsdb',
      kind: 'search',
      id: term,
      ttlMs: API_CACHE_TTL.search,
      decode: decodeRatingsdbResponse,
      classify: classifySearchResponse
    },
    () => ({
      url: `${apiBase}/api/v1/search?q=${encodeURIComponent(term)}`,
      init: getFetchInit(options)
    }),
    options
  )

  if (!Array.isArray(body?.results)) {
    throw responseError(body)
  }

  return normalizeRatingsdbSearch(body)
}

export async function loadRatingsdbBundle(id, options = {}) {
  const ref = assertSeriesRef(id)
  options.signal?.throwIfAborted()

  const memoized = readMemoizedBundle(ref)
  if (memoized !== undefined) {
    return normalizeRatingsdbBundle(memoized)
  }

  const apiBase = requireApiBase()

  const bundle = await requestJson(
    {
      provider: 'ratingsdb',
      kind: 'bundle',
      id: ref,
      ttlMs: API_CACHE_TTL.bundle,
      decode: decodeRatingsdbResponse,
      classify: classifyChartBundle
    },
    () => ({
      url: `${apiBase}/api/v1/series/${encodeURIComponent(ref)}/chart`,
      init: getFetchInit(options)
    }),
    options
  )

  if (!isChartBundle(bundle)) {
    throw responseError(bundle)
  }

  memoizeBundle(ref, bundle)
  return normalizeRatingsdbBundle(bundle)
}

export async function getShow(id, options = {}) {
  const { show } = await loadRatingsdbBundle(id, options)
  return show
}

export async function getSeasons(id, _totalSeasons, options = {}) {
  const { seasons, diagnostics, meta } = await loadRatingsdbBundle(id, options)
  return {
    seasons,
    meta: {
      ...meta,
      provider: 'ratingsdb',
      sources: diagnostics
    }
  }
}

export async function resolveShowRef({ externalIds }) {
  const imdbId = externalIds?.imdb
  if (!isTconst(imdbId)) {
    return null
  }

  return `ratingsdb:${imdbId}`
}
