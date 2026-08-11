const DEFAULT_RATING_PROVIDER = Object.freeze({
  label: null,
  order: Number.MAX_SAFE_INTEGER,
  showInRatings: true
})

export const RATING_PROVIDER_REGISTRY = Object.freeze(
  [
    { source: 'omdb', label: 'IMDb', order: 0, showInRatings: true },
    { source: 'tvmaze', label: 'TVmaze', order: 1, showInRatings: true },
    { source: 'tmdb', label: 'TMDB', order: 2, showInRatings: true }
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
