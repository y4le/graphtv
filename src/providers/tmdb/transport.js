import { fetchJson } from '../shared.js'
import { getClientSecret } from '../../config/clientSecrets.js'
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
    throw new Error('TMDB is not configured. Set TMDB_BEARER_TOKEN to enable it.')
  }

  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  }
}

function tmdbFetch(path, options = {}) {
  return fetchJson(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options.headers
    }
  })
}

export async function search(query, options = {}) {
  const data = await tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}`, options)
  return normalizeTmdbSearch(data)
}

export async function getShow(id) {
  const [show, externalIds] = await Promise.all([
    tmdbFetch(`/tv/${id}`),
    tmdbFetch(`/tv/${id}/external_ids`)
  ])
  return normalizeTmdbShow(show, normalizeTmdbExternalIds(externalIds))
}

export async function getSeasons(id, totalSeasons) {
  const requests = Array.from({ length: totalSeasons }, (_, index) =>
    tmdbFetch(`/tv/${id}/season/${index + 1}`)
  )
  const seasons = await Promise.all(requests)
  return seasons.map(normalizeTmdbSeason)
}

export async function resolveShowRef({ externalIds }) {
  if (!externalIds?.imdb) {
    return null
  }

  const data = await tmdbFetch(
    `/find/${encodeURIComponent(externalIds.imdb)}?external_source=imdb_id`
  )
  const match = data.tv_results?.[0]
  return match ? `tmdb:${match.id}` : null
}
