import { parseNumericValue } from '../shared.js'
import { getClientSecret } from '../../config/clientSecrets.js'
import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import {
  normalizeOmdbSearch,
  normalizeOmdbSeason,
  normalizeOmdbShow
} from './normalize.js'

const API_ROOT = 'https://www.omdbapi.com/'

function getKey() {
  const key = getClientSecret('omdbApiKey')

  if (!key) {
    throw new Error('OMDb is not configured. Set OMDB_API_KEY to enable it.')
  }

  return key
}

function classifyOmdbPayload(data) {
  if (data.Response !== 'False') {
    return { cache: true }
  }

  const error = createOmdbError(data)

  if (/not found|incorrect imdb id/iu.test(error.message)) {
    return { cache: true, ttlMs: API_CACHE_TTL.negative }
  }

  throw error
}

function createOmdbError(data) {
  const error = new Error(data.Error || 'OMDb request failed')
  error.provider = 'omdb'
  if (/^request limit reached[.!]?$/iu.test(error.message)) {
    error.code = 'quota'
  } else if (
    /^(invalid api key|no api key provided|api key not activated)[.!]?$/iu.test(
      error.message
    )
  ) {
    error.code = 'auth'
  }
  return error
}

async function omdbFetch(params, descriptor, options = {}) {
  const data = await requestJson(
    { provider: 'omdb', classify: classifyOmdbPayload, ...descriptor },
    () => {
      const searchParams = new URLSearchParams({ ...params, apikey: getKey() })
      return { url: `${API_ROOT}?${searchParams}`, init: getFetchInit(options) }
    },
    options
  )

  if (data.Response === 'False') {
    throw createOmdbError(data)
  }

  return data
}

export async function search(query, options = {}) {
  const data = await omdbFetch(
    { s: query, type: 'series' },
    {
      kind: 'search',
      id: query,
      params: { type: 'series' },
      ttlMs: API_CACHE_TTL.search
    },
    options
  )
  return normalizeOmdbSearch(data)
}

export async function getShow(imdbId, options = {}) {
  const data = await omdbFetch(
    { i: imdbId },
    { kind: 'title', id: imdbId, ttlMs: API_CACHE_TTL.omdbTitle },
    options
  )
  return normalizeOmdbShow(data)
}

export async function getSeasons(imdbId, totalSeasons, options = {}) {
  const requests = Array.from({ length: totalSeasons }, (_, index) =>
    omdbFetch(
      { i: imdbId, season: index + 1 },
      {
        kind: 'season',
        id: imdbId,
        params: { season: index + 1 },
        ttlMs: API_CACHE_TTL.season
      },
      options
    )
  )
  const results = await Promise.allSettled(requests)
  const seasons = []
  const failures = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      seasons.push(normalizeOmdbSeason(result.value))
    } else {
      failures.push({
        season: index + 1,
        reason: result.reason?.message ?? String(result.reason)
      })
    }
  })

  const diagnostics = {
    requested: totalSeasons,
    loaded: seasons.length,
    failures
  }

  if (seasons.length === 0 && results.length > 0) {
    const error = new Error(`OMDb failed to load all ${totalSeasons} seasons.`)
    error.seasonDiagnostics = diagnostics
    throw error
  }

  return { seasons, diagnostics }
}

export async function getEpisodeVoteCount(imdbId, options = {}) {
  const { expectedSeriesId, ...requestOptions } = options
  if (!expectedSeriesId) {
    throw new Error(
      'An expected IMDb series ID is required for OMDb episode details.'
    )
  }

  const data = await omdbFetch(
    { i: imdbId },
    { kind: 'title', id: imdbId, ttlMs: API_CACHE_TTL.omdbTitle },
    requestOptions
  )

  if (data.seriesID !== expectedSeriesId) {
    throw new Error(`OMDb episode ${imdbId} belongs to an unexpected series.`)
  }

  return parseNumericValue(data.imdbVotes)
}

export async function resolveShowRef({ externalIds }) {
  if (!externalIds?.imdb) {
    return null
  }

  return `omdb:${externalIds.imdb}`
}
