import { getRatingsdbApiBase } from '../../config/ratingsdb.js'
import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import { memoizeBundle, readMemoizedBundle } from './bundleMemo.js'
import { normalizeRatingsdbBundle } from './normalize.js'

const TCONST_REF = /^tt[0-9]+$/u
const ALIAS_REF = /^(?:imdb|tvmaze|tmdb):[a-z0-9]+$/iu

function validateSeriesRef(value) {
  if (
    typeof value !== 'string' ||
    (!TCONST_REF.test(value) && !ALIAS_REF.test(value))
  ) {
    throw new Error(`Invalid RatingsDB series reference: ${String(value)}`)
  }

  return value
}

function isChartBundle(value) {
  return value?.schemaVersion === 1
}

function classifyChartBundle(value) {
  return { cache: isChartBundle(value) }
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

export async function loadRatingsdbBundle(id, options = {}) {
  const ref = validateSeriesRef(id)
  options.signal?.throwIfAborted()

  const memoized = readMemoizedBundle(ref)
  if (memoized !== undefined) {
    return normalizeRatingsdbBundle(memoized)
  }

  const apiBase = getRatingsdbApiBase()
  if (!apiBase) {
    throw new Error(
      'RatingsDB is not configured. Set VITE_RATINGSDB_API_BASE to enable it.'
    )
  }

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
  if (typeof imdbId !== 'string' || !TCONST_REF.test(imdbId)) {
    return null
  }

  return `ratingsdb:${imdbId}`
}
