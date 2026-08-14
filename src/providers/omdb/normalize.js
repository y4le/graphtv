import { createEpisode, createSeason, createShow } from '../../data/schema.js'
import { createRatings, getYear } from '../shared.js'

const MONTHS = new Map(
  [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ].map((month, index) => [
    month.toLowerCase(),
    String(index + 1).padStart(2, '0')
  ])
)

export function parseOmdbReleased(value) {
  if (!value || value === 'N/A') {
    return null
  }

  const match = String(value)
    .trim()
    .match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/u)
  const month = match ? MONTHS.get(match[2].toLowerCase()) : null

  if (!match || !month) {
    return null
  }

  return `${match[3]}-${month}-${match[1].padStart(2, '0')}`
}

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
        date: parseOmdbReleased(episode.Released),
        ratings: createRatings('omdb', episode.imdbRating, episode.imdbVotes, {
          ratingStatus: episode.imdbRating === 'N/A' ? 'unrated' : 'rated',
          votesStatus:
            episode.imdbVotes === 'N/A'
              ? 'unavailable'
              : episode.imdbVotes
                ? 'loaded'
                : 'unknown'
        }),
        sourceIds:
          episode.imdbID && episode.imdbID !== 'N/A'
            ? { omdb: episode.imdbID }
            : {}
      })
    )
  })
}
