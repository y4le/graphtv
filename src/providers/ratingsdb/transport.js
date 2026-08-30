import { getRatingsdbApiBase } from '../../config/ratingsdb.js'
import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import { memoizeBundle, readMemoizedBundle } from './bundleMemo.js'
import {
  normalizeRatingsdbBundle,
  normalizeRatingsdbSearch
} from './normalize.js'
import { assertSeriesRef, isTconst } from './seriesRef.js'

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
  constructor(body) {
    super(body?.error || 'RatingsDB request is pending.')
    this.name = 'RatingsdbPendingError'
    this.provider = 'ratingsdb'
    this.code = body?.code
    this.capability = body?.degradation?.capability
    this.reason = body?.degradation?.reason
    this.retryAfterMs = null
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
  const { seasons, diagnostics } = await loadRatingsdbBundle(id, options)
  return { seasons, diagnostics }
}

export async function resolveShowRef({ externalIds }) {
  const imdbId = externalIds?.imdb
  if (!isTconst(imdbId)) {
    return null
  }

  return `ratingsdb:${imdbId}`
}
