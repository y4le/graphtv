function getUrlParams () {
  return new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop)
  })
}

function preserveParams (newLink) {
  const urlParams = getUrlParams()

  let link = newLink

  if (urlParams.debug) {
    link += '&debug'
  }

  if (urlParams.api) {
    link += '&api=' + urlParams.api
  }

  return link
}

function generateXAxisLabels (seasons) {
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

function getColorStep (numOfSteps, step) {
  // This function generates vibrant, "evenly spaced" colours (i.e. no clustering). This is ideal for creating easily distinguishable vibrant markers in Google Maps and other apps.
  // Adam Cole, 2011-Sept-14
  // HSV to RBG adapted from: http://mjijackson.com/2008/02/rgb-to-hsl-and-rgb-to-hsv-color-model-conversion-algorithms-in-javascript
  let r, g, b
  const h = step / numOfSteps
  const i = ~~(h * 6)
  const f = h * 6 - i
  const q = 1 - f
  switch (i % 6) {
    case 0: r = 1; g = f; b = 0; break
    case 1: r = q; g = 1; b = 0; break
    case 2: r = 0; g = 1; b = f; break
    case 3: r = 0; g = q; b = 1; break
    case 4: r = f; g = 0; b = 1; break
    case 5: r = 1; g = 0; b = q; break
  }
  const c = '#' + ('00' + (~~(r * 255)).toString(16)).slice(-2) + ('00' + (~~(g * 255)).toString(16)).slice(-2) + ('00' + (~~(b * 255)).toString(16)).slice(-2)
  return (c)
}

function clampNum (lowerBound, n, upperBound) {
  return Math.max(lowerBound, Math.min(n, upperBound))
}

export { getUrlParams, preserveParams, generateXAxisLabels, getColorStep, clampNum }
