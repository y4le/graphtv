import { fetchJson, parseNumericValue } from '../shared.js'
import { getClientSecret } from '../../config/clientSecrets.js'
import { normalizeOmdbSearch, normalizeOmdbSeason, normalizeOmdbShow } from './normalize.js'

const API_ROOT = 'https://www.omdbapi.com/'

function getKey() {
  const key = getClientSecret('omdbApiKey')

  if (!key) {
    throw new Error('OMDb is not configured. Set OMDB_API_KEY to enable it.')
  }

  return key
}

async function omdbFetch(params, options = {}) {
  const data = await fetchJson(`${API_ROOT}?${params}&apikey=${getKey()}`, options)

  if (data.Response === 'False') {
    const error = new Error(data.Error || 'OMDb request failed')
    error.provider = 'omdb'
    if (/^request limit reached[.!]?$/iu.test(error.message)) {
      error.code = 'quota'
    } else if (/^(invalid api key|no api key provided|api key not activated)[.!]?$/iu.test(error.message)) {
      error.code = 'auth'
    }
    throw error
  }

  return data
}

export async function search(query, options = {}) {
  const data = await omdbFetch(`s=${encodeURIComponent(query)}&type=series`, options)
  return normalizeOmdbSearch(data)
}

export async function getShow(imdbId) {
  const data = await omdbFetch(`i=${encodeURIComponent(imdbId)}`)
  return normalizeOmdbShow(data)
}

export async function getSeasons(imdbId, totalSeasons) {
  const requests = Array.from({ length: totalSeasons }, (_, index) =>
    omdbFetch(`i=${encodeURIComponent(imdbId)}&season=${index + 1}`)
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
  const { expectedSeriesId, ...fetchOptions } = options
  if (!expectedSeriesId) {
    throw new Error('An expected IMDb series ID is required for OMDb episode details.')
  }

  const data = await omdbFetch(`i=${encodeURIComponent(imdbId)}`, fetchOptions)

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
