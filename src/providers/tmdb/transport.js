import { getClientSecret } from '../../config/clientSecrets.js'
import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import {
  normalizeTmdbCollection,
  normalizeTmdbExternalIds,
  normalizeTmdbSearch,
  normalizeTmdbSeason,
  normalizeTmdbShow
} from './normalize.js'
import { mapWithConcurrency } from '../../lib/concurrency.js'

const API_ROOT = 'https://api.themoviedb.org/3'
const SEASON_REQUEST_CONCURRENCY = 4

function getHeaders() {
  const token = getClientSecret('tmdbBearerToken')

  if (!token) {
    throw new Error(
      'TMDB is not configured. Set TMDB_BEARER_TOKEN to enable it.'
    )
  }

  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  }
}

function tmdbFetch(path, descriptor, options = {}) {
  return requestJson(
    { provider: 'tmdb', ...descriptor },
    () => ({
      url: `${API_ROOT}${path}`,
      init: {
        ...getFetchInit(options),
        headers: {
          ...getHeaders(),
          ...options.headers
        }
      }
    }),
    options
  )
}

export async function search(query, options = {}) {
  const data = await tmdbFetch(
    `/search/tv?query=${encodeURIComponent(query)}`,
    { kind: 'search', id: query, ttlMs: API_CACHE_TTL.search },
    options
  )
  return normalizeTmdbSearch(data)
}

export async function getTrendingShows(options = {}) {
  const data = await tmdbFetch(
    '/trending/tv/week',
    {
      kind: 'collection',
      id: 'trending-tv-week',
      ttlMs: API_CACHE_TTL.collection
    },
    options
  )
  return normalizeTmdbCollection(data)
}

export async function getPopularShows(options = {}) {
  const minVotes = 50
  const params = new URLSearchParams({
    include_adult: 'false',
    language: 'en-US',
    page: '1',
    sort_by: 'popularity.desc',
    'vote_count.gte': String(minVotes)
  })
  const data = await tmdbFetch(
    `/discover/tv?${params}`,
    {
      kind: 'collection',
      id: 'popular-tv',
      params: Object.fromEntries(params),
      ttlMs: API_CACHE_TTL.popularCollection
    },
    options
  )
  return normalizeTmdbCollection(data, { minVotes })
}

export async function getShow(id, options = {}) {
  const [show, externalIds] = await Promise.all([
    tmdbFetch(
      `/tv/${id}`,
      { kind: 'show', id, ttlMs: API_CACHE_TTL.show },
      options
    ),
    tmdbFetch(
      `/tv/${id}/external_ids`,
      { kind: 'external-ids', id, ttlMs: API_CACHE_TTL.externalIds },
      options
    )
  ])
  return normalizeTmdbShow(show, normalizeTmdbExternalIds(externalIds))
}

export async function getSeasons(id, totalSeasons, options = {}) {
  const seasonNumbers = Array.from(
    { length: totalSeasons },
    (_, index) => index + 1
  )
  const seasons = await mapWithConcurrency(
    seasonNumbers,
    SEASON_REQUEST_CONCURRENCY,
    (seasonNumber) =>
      tmdbFetch(
        `/tv/${id}/season/${seasonNumber}`,
        {
          kind: 'season',
          id,
          params: { season: seasonNumber },
          ttlMs: API_CACHE_TTL.season
        },
        options
      )
  )
  return seasons.map(normalizeTmdbSeason)
}

export async function resolveShowRef({ externalIds }, options = {}) {
  if (!externalIds?.imdb) {
    return null
  }

  const data = await tmdbFetch(
    `/find/${encodeURIComponent(externalIds.imdb)}?external_source=imdb_id`,
    {
      kind: 'lookup',
      id: externalIds.imdb,
      params: { externalSource: 'imdb_id' },
      ttlMs: API_CACHE_TTL.lookup
    },
    options
  )
  const match = data.tv_results?.[0]
  return match ? `tmdb:${match.id}` : null
}
