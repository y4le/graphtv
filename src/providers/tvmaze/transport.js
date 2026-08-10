import { fetchJson } from '../shared.js'
import { normalizeTvmazeEpisodes, normalizeTvmazeSearch, normalizeTvmazeShow } from './normalize.js'

const API_ROOT = 'https://api.tvmaze.com'

export async function search(query, options = {}) {
  const data = await fetchJson(`${API_ROOT}/search/shows?q=${encodeURIComponent(query)}`, options)
  return normalizeTvmazeSearch(data)
}

export async function getShow(id) {
  const data = await fetchJson(`${API_ROOT}/shows/${id}?embed=seasons`)
  return normalizeTvmazeShow(data)
}

export async function getSeasons(id) {
  const data = await fetchJson(`${API_ROOT}/shows/${id}/episodes`)
  return normalizeTvmazeEpisodes(data)
}

export async function resolveShowRef({ externalIds }) {
  if (!externalIds?.imdb) {
    return null
  }

  const data = await fetchJson(
    `${API_ROOT}/lookup/shows?imdb=${encodeURIComponent(externalIds.imdb)}`
  )
  return `tvmaze:${data.id}`
}
