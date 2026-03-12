import { createEpisode, createSeason, createShow } from '../../data/schema.js'
import { cleanHtmlSummary, createRatings, getYear } from '../shared.js'

function getPoster(image) {
  return image?.original ?? image?.medium ?? null
}

export function normalizeTvmazeSearch(results = []) {
  return results.slice(0, 10).map(({ show }) =>
    createShow({
      id: `tvmaze:${show.id}`,
      title: show.name,
      year: getYear(show.premiered),
      poster: getPoster(show.image),
      genres: show.genres ?? []
    })
  )
}

export function normalizeTvmazeShow(show) {
  return createShow({
    id: `tvmaze:${show.id}`,
    title: show.name,
    year: getYear(show.premiered),
    plot: cleanHtmlSummary(show.summary),
    poster: getPoster(show.image),
    totalSeasons: show._embedded?.seasons?.length ?? 0,
    genres: show.genres ?? [],
    ratings: createRatings('tvmaze', show.rating?.average),
    externalIds: {
      imdb: show.externals?.imdb ?? undefined
    }
  })
}

export function normalizeTvmazeEpisodes(episodes = []) {
  const bySeason = new Map()

  for (const episode of episodes) {
    if (!bySeason.has(episode.season)) {
      bySeason.set(
        episode.season,
        createSeason({
          number: episode.season,
          title: `Season ${episode.season}`,
          episodes: []
        })
      )
    }

    bySeason.get(episode.season).episodes.push(
      createEpisode({
        id: `tvmaze:episode:${episode.id}`,
        title: episode.name,
        plot: cleanHtmlSummary(episode.summary),
        season: episode.season,
        episode: episode.number,
        date: episode.airdate ?? null,
        ratings: createRatings('tvmaze', episode.rating?.average),
        poster: getPoster(episode.image)
      })
    )
  }

  return Array.from(bySeason.values()).sort((a, b) => a.number - b.number)
}
