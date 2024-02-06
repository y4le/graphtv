function getUrlParams () {
  return new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop)
  })
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
    if (urlParams.api !== 'omdb' && urlParams.api !== 'tmdb') {
      console.error(`unknown api param: ${urlParams.api}. should be 'omdb' or 'tmdb'`)
    } else {
      explicitApi = urlParams.api
    }
  }

  if (urlParams.t) {
    if (explicitApi && explicitApi !== 'tmdb') {
      console.error(`wrong apiType: ${explicitApi} for tmdbId`)
    }
    implicitApi = 'tmdb'
  }

  if (urlParams.i) {
    if (explicitApi && explicitApi !== 'omdb') {
      console.error(`wrong apiType: ${explicitApi} for omdbId`)
    }
    implicitApi = 'omdb'
  }

  window.apiType = implicitApi || explicitApi || 'tmdb'

  return window.apiType
}

function generateXaxis (seasons) {
  const labels = [null] // fill x=0

  seasons.forEach((season, seasonIndex) => {
    season.episodes.forEach((_, episodeIndex) => {
      const seasonString = `S${(seasonIndex + 1).toString().padStart(2, '0')}`
      const episodeString = `E${(episodeIndex + 1).toString().padStart(2, '0')}`
      labels.push(`${seasonString}${episodeString}`)
    })
  })

  return labels
}

export { getUrlParams, getApiType, generateXaxis }
