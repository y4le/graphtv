import {
  API_CACHE_TTL,
  getFetchInit,
  requestJson
} from '../../data/apiCache.js'
import {
  normalizeTvmazeEpisodes,
  normalizeTvmazeSearch,
  normalizeTvmazeShow
} from './normalize.js'

const API_ROOT = 'https://api.tvmaze.com'

export async function search(query, options = {}) {
  const data = await requestJson(
    {
      provider: 'tvmaze',
      kind: 'search',
      id: query,
      ttlMs: API_CACHE_TTL.search
    },
    () => ({
      url: `${API_ROOT}/search/shows?q=${encodeURIComponent(query)}`,
      init: getFetchInit(options)
    }),
    options
  )
  return normalizeTvmazeSearch(data)
}

export async function getShow(id, options = {}) {
  const data = await requestJson(
    {
      provider: 'tvmaze',
      kind: 'show',
      id,
      params: { embed: 'seasons' },
      ttlMs: API_CACHE_TTL.show
    },
    () => ({
      url: `${API_ROOT}/shows/${id}?embed=seasons`,
      init: getFetchInit(options)
    }),
    options
  )
  return normalizeTvmazeShow(data)
}

export async function getSeasons(id, _totalSeasons, options = {}) {
  const data = await requestJson(
    { provider: 'tvmaze', kind: 'episodes', id, ttlMs: API_CACHE_TTL.episodes },
    () => ({
      url: `${API_ROOT}/shows/${id}/episodes`,
      init: getFetchInit(options)
    }),
    options
  )
  return normalizeTvmazeEpisodes(data)
}

export async function resolveShowRef({ externalIds }, options = {}) {
  if (!externalIds?.imdb) {
    return null
  }

  const data = await requestJson(
    {
      provider: 'tvmaze',
      kind: 'lookup',
      id: externalIds.imdb,
      ttlMs: API_CACHE_TTL.lookup
    },
    () => ({
      url: `${API_ROOT}/lookup/shows?imdb=${encodeURIComponent(externalIds.imdb)}`,
      init: getFetchInit(options)
    }),
    options
  )
  return `tvmaze:${data.id}`
}
