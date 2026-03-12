import { createEpisode, createSeason, createShow } from '../../data/schema.js'
import { createRatings, getYear } from '../shared.js'

export function normalizeOmdbSearch(data) {
  return (data?.Search ?? []).map((show) =>
    createShow({
      id: `omdb:${show.imdbID}`,
      title: show.Title,
      year: getYear(show.Year),
      poster: show.Poster && show.Poster !== 'N/A' ? show.Poster : null,
      externalIds: { imdb: show.imdbID }
    })
  )
}

export function normalizeOmdbShow(show) {
  return createShow({
    id: `omdb:${show.imdbID}`,
    title: show.Title,
    year: getYear(show.Year),
    plot: show.Plot && show.Plot !== 'N/A' ? show.Plot : null,
    poster: show.Poster && show.Poster !== 'N/A' ? show.Poster : null,
    totalSeasons: Number(show.totalSeasons) || 0,
    genres: show.Genre ? show.Genre.split(', ') : [],
    ratings: createRatings('omdb', show.imdbRating, show.imdbVotes),
    externalIds: { imdb: show.imdbID }
  })
}

export function normalizeOmdbSeason(season) {
  return createSeason({
    number: Number(season.Season),
    title: `Season ${season.Season}`,
    episodes: (season.Episodes ?? []).map((episode) =>
      createEpisode({
        id: `omdb:episode:${episode.imdbID}`,
        title: episode.Title,
        season: Number(season.Season),
        episode: Number(episode.Episode),
        date: new Date(episode.Released).toISOString().slice(0, 10),
        ratings: createRatings('omdb', episode.imdbRating, episode.imdbVotes)
      })
    )
  })
}
