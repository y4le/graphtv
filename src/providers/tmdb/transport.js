import { getClientSecret } from '../../config/clientSecrets.js'
import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import {
  normalizeTmdbExternalIds,
  normalizeTmdbSearch,
  normalizeTmdbSeason,
  normalizeTmdbShow
} from './normalize.js'

const API_ROOT = 'https://api.themoviedb.org/3'

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
  const requests = Array.from({ length: totalSeasons }, (_, index) =>
    tmdbFetch(
      `/tv/${id}/season/${index + 1}`,
      {
        kind: 'season',
        id,
        params: { season: index + 1 },
        ttlMs: API_CACHE_TTL.season
      },
      options
    )
  )
  const seasons = await Promise.all(requests)
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
