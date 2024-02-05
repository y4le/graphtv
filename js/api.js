import { getUrlParams, getApiType } from './util.js'
import { omdbSearch, omdbSeries, omdbSeason } from './omdb.js'
import { tmdbSearch, tmdbSeries, tmdbSeason } from './tmdb.js'

async function search (searchTerm, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSearch(searchTerm)
    case 'omdb':
      return omdbSearch(searchTerm)
  }
}

async function getSeries (identifier, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSeries(identifier)
    case 'omdb':
      return omdbSeries(identifier)
  }
}

async function getSeason (seriesId, season, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSeason(seriesId, season)
    case 'omdb':
      return omdbSeason(seriesId, season)
  }
}

if (getUrlParams().debug !== null) {
  window.search = search
  window.getSeries = getSeries
  window.getSeason = getSeason
}

export { search, getSeries, getSeason }
