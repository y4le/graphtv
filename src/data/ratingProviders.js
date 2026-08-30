const DEFAULT_RATING_PROVIDER = Object.freeze({
  label: null,
  order: Number.MAX_SAFE_INTEGER,
  showInRatings: true,
  minimumVotes: 0,
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

function getSlugId(value) {
  if (typeof value !== 'string') {
    return null
  }

  const id = value
  return /^[a-z0-9][a-z0-9-]*$/iu.test(id) ? encodeURIComponent(id) : null
}

function getHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : null
  } catch {
    return null
  }
}

function getEpisodeNumber(value, { allowZero = false } = {}) {
  return Number.isInteger(value) && (allowZero ? value >= 0 : value > 0)
    ? value
    : null
}

function createImdbLinks(episodeSource) {
  return Object.freeze({
    series({ show }) {
      const id = getImdbTitleId(show?.externalIds?.imdb)
      return id ? `https://www.imdb.com/title/${id}/` : null
    },
    episode({ episode }) {
      const id = getImdbTitleId(episode?.sourceIds?.[episodeSource])
      return id ? `https://www.imdb.com/title/${id}/` : null
    }
  })
}

const IMDB_LINKS = createImdbLinks('imdb')
const OMDB_LINKS = createImdbLinks('omdb')

const TRAKT_LINKS = Object.freeze({
  series({ show }) {
    const id = getSlugId(show?.externalIds?.trakt)
    return id ? `https://trakt.tv/shows/${id}` : null
  }
})

function createExternalUrlLinks(externalId) {
  return Object.freeze({
    series({ show }) {
      return getHttpUrl(show?.externalIds?.[externalId])
    }
  })
}

const ROTTEN_TOMATOES_LINKS = createExternalUrlLinks('rt_url')
const METACRITIC_LINKS = createExternalUrlLinks('mc_url')

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
      source: 'combined',
      label: 'Combined',
      order: 0,
      showInRatings: true
    },
    {
      source: 'imdb',
      label: 'IMDb',
      order: 1,
      showInRatings: true,
      links: IMDB_LINKS
    },
    {
      source: 'tvmaze',
      label: 'TVmaze',
      order: 2,
      showInRatings: true,
      links: TVMAZE_LINKS
    },
    {
      source: 'tmdb',
      label: 'TMDB',
      order: 3,
      showInRatings: true,
      minimumVotes: 5,
      links: TMDB_LINKS
    },
    {
      source: 'trakt',
      label: 'Trakt',
      order: 4,
      showInRatings: true,
      links: TRAKT_LINKS
    },
    {
      source: 'rtCritics',
      label: 'RT Critics',
      order: 5,
      showInRatings: false,
      links: ROTTEN_TOMATOES_LINKS
    },
    {
      source: 'rtAudience',
      label: 'RT Audience',
      order: 6,
      showInRatings: false,
      links: ROTTEN_TOMATOES_LINKS
    },
    {
      source: 'mcCritics',
      label: 'Metacritic',
      order: 7,
      showInRatings: false,
      links: METACRITIC_LINKS
    },
    {
      source: 'mcAudience',
      label: 'Metacritic Users',
      order: 8,
      showInRatings: false,
      links: METACRITIC_LINKS
    },
    {
      source: 'omdb',
      label: 'IMDb (OMDb)',
      order: 9,
      showInRatings: true,
      links: OMDB_LINKS
    }
  ].map((provider) =>
    Object.freeze({ ...DEFAULT_RATING_PROVIDER, ...provider })
  )
)

const RATING_PROVIDERS_BY_SOURCE = new Map(
  RATING_PROVIDER_REGISTRY.map((provider) => [provider.source, provider])
)

export const RATING_SOURCE_PRIORITY = RATING_PROVIDER_REGISTRY.filter(
  (provider) => provider.showInRatings
).map((provider) => provider.source)

const SHOW_HIDDEN_RATINGS_KEY = 'graphtv:show-hidden-ratings'
let showHiddenRatings = readShowHiddenRatings()

function readShowHiddenRatings() {
  try {
    return window.localStorage.getItem(SHOW_HIDDEN_RATINGS_KEY) === 'true'
  } catch {
    return false
  }
}

export function getShowHiddenRatings() {
  return showHiddenRatings
}

export function setShowHiddenRatings(value) {
  showHiddenRatings = Boolean(value)

  try {
    if (showHiddenRatings) {
      window.localStorage.setItem(SHOW_HIDDEN_RATINGS_KEY, 'true')
    } else {
      window.localStorage.removeItem(SHOW_HIDDEN_RATINGS_KEY)
    }
  } catch {
    // Keep the session preference when browser storage is unavailable.
  }
}

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

export function getRatingMinimumVotes(source) {
  return getRatingProvider(source).minimumVotes ?? 0
}

export function isRatingSourceVisible(
  source,
  includeHidden = getShowHiddenRatings()
) {
  return includeHidden || getRatingProvider(source).showInRatings
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

export function orderVisibleRatings(
  ratings = [],
  { includeHidden = getShowHiddenRatings() } = {}
) {
  return ratings
    .map((rating, index) => ({
      index,
      provider: getRatingProvider(rating.source),
      rating
    }))
    .filter(({ provider }) => includeHidden || provider.showInRatings)
    .sort(
      (left, right) =>
        left.provider.order - right.provider.order || left.index - right.index
    )
    .map(({ rating }) => rating)
}

export function getDisplayedRatingSources(
  bundleOrBundles,
  { includeHidden = getShowHiddenRatings() } = {}
) {
  const bundles = Array.isArray(bundleOrBundles)
    ? bundleOrBundles
    : [bundleOrBundles]
  const sources = new Map()

  function collect(ratings) {
    for (const rating of ratings ?? []) {
      const source = rating?.source
      if (
        typeof source !== 'string' ||
        source.length === 0 ||
        sources.has(source) ||
        !isRatingSourceVisible(source, includeHidden)
      ) {
        continue
      }
      sources.set(source, {
        source,
        order: getRatingProvider(source).order,
        index: sources.size
      })
    }
  }

  for (const bundle of bundles) {
    collect(bundle?.show?.ratings)
    for (const season of bundle?.seasons ?? []) {
      for (const episode of season?.episodes ?? []) {
        collect(episode?.ratings)
      }
    }
  }

  return Array.from(sources.values())
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ source }) => source)
}
