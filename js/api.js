import { getUrlParams, getApiType } from './util.js'
import { testdbSearch, testdbSeries, testdbSeason } from './testdb.js'
import { tmdbSearch, tmdbSeries, tmdbSeason } from './tmdb.js'

async function search (searchTerm, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSearch(searchTerm)
    case 'testdb':
      return testdbSearch(searchTerm)
    case 'omdb':
      window.alert('omdb API deprecated')
  }
}

async function getSeries (identifier, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSeries(identifier)
    case 'testdb':
      return testdbSeries(identifier)
    case 'omdb':
      window.alert('omdb API deprecated')
  }
}

async function getSeason (seriesId, season, apiType) {
  switch (apiType || getApiType()) {
    case 'tmdb':
      return tmdbSeason(seriesId, season)
    case 'testdb':
      return testdbSeason(seriesId, season)
    case 'omdb':
      window.alert('omdb API deprecated')
  }
}

if (getUrlParams().debug !== null) {
  window.search = search
  window.getSeries = getSeries
  window.getSeason = getSeason
}

export { search, getSeries, getSeason }
