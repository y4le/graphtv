function dedupeRatings(ratings = []) {
  const seen = new Map()

  for (const rating of ratings) {
    seen.set(rating.source, rating)
  }

  return Array.from(seen.values())
}

export function createProviderRating(source, rating, votes = null, metadata = {}) {
  return {
    ...metadata,
    source,
    rating: typeof rating === 'number' ? rating : null,
    votes: typeof votes === 'number' ? votes : null
  }
}

export function createShow({
  id,
  title,
  year,
  plot = null,
  poster = null,
  totalSeasons = 0,
  genres = [],
  ratings = [],
  externalIds = {}
}) {
  return {
    id,
    title,
    year,
    plot,
    poster,
    totalSeasons,
    genres,
    ratings: dedupeRatings(ratings),
    externalIds
  }
}

export function createEpisode({
  id,
  title,
  plot = null,
  season,
  episode,
  date = null,
  ratings = [],
  poster = null,
  sourceIds = {}
}) {
  return {
    id,
    title,
    plot,
    season,
    episode,
    date,
    ratings: dedupeRatings(ratings),
    poster,
    sourceIds
  }
}

export function createSeason({ number, title = null, episodes = [] }) {
  return {
    number,
    title,
    episodes
  }
}

export function sortSeasons(seasons) {
  return [...seasons].sort((a, b) => a.number - b.number)
}

export function sortEpisodes(episodes) {
  return [...episodes].sort((a, b) => {
    if (a.season !== b.season) {
      return a.season - b.season
    }

    return a.episode - b.episode
  })
}
