const tmdbApiGateway = 'https://api.themoviedb.org/3'

async function tmdbApi (query) {
  const token = await tmdbToken()
  const response = await fetch(`${tmdbApiGateway}/${query}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'en'
    }
  })
  return response.json()
}

async function tmdbToken () {
  // need this for gh pages, the fate of the site is in your hands, pls don't break me
  return 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIwNGJkOWVlMjc5ZTY5MTlhNWQ3MjM3ZDE1ZjIzMWM5MSIsInN1YiI6IjY1YmM2ZWI3ZTE4Yjk3MDE2Mjk5Y2NmYSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.nqOz-8QfgW48zQn_JGkBaLmjlSMeGmDpyU56ngpkWzM'
}

async function tmdbSearch (searchTerm) {
  const query = `search/tv?query=${encodeURIComponent(searchTerm)}`
  const data = await tmdbApi(query)
  return parseSearch(data)
}

function parseSearch (data) {
  const results = data.results.slice(0, 10) // limit to first 10
  const shows = []
  for (const result of results) {
    const show = {
      title: result.name,
      year: result.first_air_date,
      tmdbId: result.id,
      poster: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
      popularity: result.popularity
    }
    shows.push(show)
  }

  return shows
}

async function tmdbSeries (seriesId) {
  const query = `tv/${seriesId}`
  const result = await tmdbApi(query)
  return parseSeries(result)
}

function parseSeries (result) {
  const series = {
    title: result.name,
    plot: result.overview,
    tagLine: result.tagline,
    year: result.first_air_date,
    tmdbId: result.id,
    poster: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
    popularity: result.popularity,
    rating: result.vote_average,
    votes: result.vote_count,
    totalSeasons: result.number_of_seasons,
    genres: result.genres.map((g) => g.name)
  }
  return series
}

async function tmdbSeason (seriesId, seasonNumber) {
  const query = `tv/${seriesId}/season/${seasonNumber}`
  const result = await tmdbApi(query)
  return parseSeason(result)
}

function parseSeason (result) {
  const season = {
    episodes: result.episodes.map((episode) => {
      return {
        title: episode.name,
        plot: episode.overview,
        date: episode.air_date,
        tmdbId: episode.id,
        rating: episode.vote_average,
        votes: episode.vote_count,
        poster: `https://image.tmdb.org/t/p/w500${result.still_path}`
      }
    }),
    rating: result.vote_average,
    votes: result.vote_count,
    title: result.name,
    plot: result.overview,
    tmdbId: result.id,
    poster: `https://image.tmdb.org/t/p/w500${result.poster_path}`
  }
  return season
}

export { tmdbSearch, tmdbSeries, tmdbSeason, parseSearch, parseSeries, parseSeason }
