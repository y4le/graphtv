const DEFAULT_RATING_PROVIDER = Object.freeze({
  label: null,
  order: Number.MAX_SAFE_INTEGER,
  showInRatings: true,
  links: null
})

function getImdbTitleId(value) {
  const id = String(value ?? '')
  return /^tt\d+$/u.test(id) ? id : null
}

function getNumericId(value) {
  const id = String(value ?? '')
  return /^[1-9]\d*$/u.test(id) ? id : null
}

function getEpisodeNumber(value, { allowZero = false } = {}) {
  return Number.isInteger(value) && (allowZero ? value >= 0 : value > 0)
    ? value
    : null
}

const IMDB_LINKS = Object.freeze({
  series({ show }) {
    const id = getImdbTitleId(show?.externalIds?.imdb)
    return id ? `https://www.imdb.com/title/${id}/` : null
  },
  episode({ episode }) {
    const id = getImdbTitleId(episode?.sourceIds?.omdb)
    return id ? `https://www.imdb.com/title/${id}/` : null
  }
})

const TVMAZE_LINKS = Object.freeze({
  series({ show }) {
    const id = getNumericId(show?.externalIds?.tvmaze)
    return id ? `https://www.tvmaze.com/shows/${id}` : null
  },
  episode({ episode }) {
    const id = getNumericId(episode?.sourceIds?.tvmaze)
    return id ? `https://www.tvmaze.com/episodes/${id}` : null
  }
})

const TMDB_LINKS = Object.freeze({
  series({ show }) {
    const id = getNumericId(show?.externalIds?.tmdb)
    return id ? `https://www.themoviedb.org/tv/${id}` : null
  },
  episode({ show, episode }) {
    const providerEpisodeId = getNumericId(episode?.sourceIds?.tmdb)
    const showId = getNumericId(show?.externalIds?.tmdb)
    const season = getEpisodeNumber(episode?.season, { allowZero: true })
    const number = getEpisodeNumber(episode?.episode)

    if (!providerEpisodeId || !showId || season === null || number === null) {
      return null
    }

    return `https://www.themoviedb.org/tv/${showId}/season/${season}/episode/${number}`
  }
})

export const RATING_PROVIDER_REGISTRY = Object.freeze(
  [
    {
      source: 'omdb',
      label: 'IMDb',
      order: 0,
      showInRatings: true,
      links: IMDB_LINKS
    },
    {
      source: 'tvmaze',
      label: 'TVmaze',
      order: 1,
      showInRatings: true,
      links: TVMAZE_LINKS
    },
    {
      source: 'tmdb',
      label: 'TMDB',
      order: 2,
      showInRatings: true,
      links: TMDB_LINKS
    }
  ].map(Object.freeze)
)

const RATING_PROVIDERS_BY_SOURCE = new Map(
  RATING_PROVIDER_REGISTRY.map((provider) => [provider.source, provider])
)

export const RATING_SOURCE_PRIORITY = RATING_PROVIDER_REGISTRY.filter(
  (provider) => provider.showInRatings
).map((provider) => provider.source)

export function getRatingProvider(source) {
  const registered = RATING_PROVIDERS_BY_SOURCE.get(source)

  if (registered) {
    return registered
  }

  return {
    ...DEFAULT_RATING_PROVIDER,
    source,
    label: String(source ?? '').toUpperCase()
  }
}

export function getRatingSourceLabel(source) {
  return getRatingProvider(source).label
}

export function getRatingSourceUrl(
  source,
  { show = null, episode = null } = {}
) {
  const links = getRatingProvider(source).links

  if (episode) {
    const episodeUrl = links?.episode?.({ show, episode })
    if (episodeUrl) {
      return episodeUrl
    }
  }

  return links?.series?.({ show }) ?? null
}

export function orderVisibleRatings(ratings = []) {
  return ratings
    .map((rating, index) => ({
      index,
      provider: getRatingProvider(rating.source),
      rating
    }))
    .filter(({ provider }) => provider.showInRatings)
    .sort(
      (left, right) =>
        left.provider.order - right.provider.order || left.index - right.index
    )
    .map(({ rating }) => rating)
}
