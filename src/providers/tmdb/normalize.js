import { createEpisode, createSeason, createShow } from '../../data/schema.js'
import { buildImageUrl, createRatings, getYear } from '../shared.js'

const IMAGE_ROOT = 'https://image.tmdb.org/t/p/w780'

export function normalizeTmdbSearch(results) {
  return (results?.results ?? []).slice(0, 10).map((show) =>
    createShow({
      id: `tmdb:${show.id}`,
      title: show.name,
      year: getYear(show.first_air_date),
      plot: show.overview || null,
      poster: buildImageUrl(show.poster_path, IMAGE_ROOT),
      ratings: createRatings('tmdb', show.vote_average, show.vote_count)
    })
  )
}

export function normalizeTmdbExternalIds(data) {
  return {
    imdb: data.imdb_id ?? undefined,
    tmdb: data.id
  }
}

export function normalizeTmdbShow(show, externalIds = {}) {
  return createShow({
    id: `tmdb:${show.id}`,
    title: show.name,
    year: getYear(show.first_air_date),
    plot: show.overview || null,
    poster: buildImageUrl(show.poster_path, IMAGE_ROOT),
    totalSeasons: show.number_of_seasons ?? 0,
    genres: (show.genres ?? []).map((genre) => genre.name),
    ratings: createRatings('tmdb', show.vote_average, show.vote_count),
    externalIds
  })
}

export function normalizeTmdbSeason(season) {
  return createSeason({
    number: season.season_number,
    title: season.name || `Season ${season.season_number}`,
    episodes: (season.episodes ?? []).map((episode) =>
      createEpisode({
        id: `tmdb:episode:${episode.id}`,
        title: episode.name,
        plot: episode.overview || null,
        season: episode.season_number,
        episode: episode.episode_number,
        date: episode.air_date ?? null,
        ratings: createRatings('tmdb', episode.vote_average, episode.vote_count),
        poster: buildImageUrl(episode.still_path, IMAGE_ROOT)
      })
    )
  })
}
