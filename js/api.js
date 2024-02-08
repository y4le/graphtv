import { getUrlParams } from './util.js'
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

function getApiType () {
  // return either 'tmdb' or 'omdb'
  if (window.apiType) {
    return window.apiType
  }

  let explicitApi
  let implicitApi

  const urlParams = getUrlParams()

  if (urlParams.api) {
    switch (urlParams.api) {
      case 'omdb':
        window.alert('omdb api deprecated')
        break
      case 'testdb':
        window.apiType = urlParams.api
        return window.apiType
      case 'tmdb':
        explicitApi = urlParams.api
        break
      default:
        window.alert(`unknown api param: ${urlParams.api}. should be 'testdb' or 'tmdb'`)
    }
  }

  if (urlParams.t) {
    if (explicitApi && explicitApi !== 'tmdb') {
      console.error(`wrong apiType: ${explicitApi} for tmdbId`)
    }
    implicitApi = 'tmdb'
  }

  if (urlParams.i) {
    window.alert('omdb api deprecated')
    // TODO: consider using external search API to find imdbId
  }

  window.apiType = explicitApi || implicitApi || 'tmdb'

  return window.apiType
}

if (getUrlParams().debug !== null) {
  window.search = search
  window.getSeries = getSeries
  window.getSeason = getSeason
}

export { search, getSeries, getSeason }
