const omdbApiGateway = 'https://www.omdbapi.com'

async function omdbApi (query) {
  const key = await omdbKey()
  const response = await fetch(`${omdbApiGateway}/?${query}&apikey=${key}`)
  return response.json()
}

async function omdbKey () {
  // need this for gh pages, the fate of the site is in your hands, pls don't break me
  return 'e0d17059'
}

async function omdbSearch (searchTerm) {
  const data = await omdbApi(`s=${encodeURIComponent(searchTerm)}&type=series`)
  const shows = []
  for (const result of data.Search) {
    if (result.Type !== 'series') {
      continue
    }
    const show = {
      title: result.Title,
      year: result.Year,
      imdbId: result.imdbID,
      poster: result.Poster
    }
    shows.push(show)
  }
  return shows
}

async function omdbSeries (imdbId) {
  const result = await omdbApi(`i=${encodeURIComponent(imdbId)}`)
  const series = {
    title: result.Title,
    plot: result.Plot,
    poster: result.Poster,
    year: result.Year,
    rating: result.imdbRating,
    votes: result.imdbVotes,
    totalSeasons: result.totalSeasons,
    genres: result.Genre.split(', ')
  }
  return series
}

async function omdbSeason (imdbId, seasonNumber) {
  const result = await omdbApi(`i=${encodeURIComponent(imdbId)}&season=${seasonNumber}`)
  const season = {
    episodes: result.Episodes.map((episode) => {
      return {
        title: episode.Title,
        date: episode.Released,
        imdbId: episode.imdbID,
        rating: episode.imdbRating
      }
    })
  }
  return season
}

export { omdbSearch, omdbSeries, omdbSeason }
