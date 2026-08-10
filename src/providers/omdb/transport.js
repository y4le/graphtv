import { fetchJson } from '../shared.js'
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
    throw new Error(data.Error || 'OMDb request failed')
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
  const seasons = await Promise.all(requests)
  return seasons.map(normalizeOmdbSeason)
}

export async function resolveShowRef({ externalIds }) {
  if (!externalIds?.imdb) {
    return null
  }

  return `omdb:${externalIds.imdb}`
}
