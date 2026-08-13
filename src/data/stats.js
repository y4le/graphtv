import {
  RATING_SOURCE_PRIORITY,
  getRatingSourceLabel
} from './ratingProviders.js'

export { RATING_SOURCE_PRIORITY, getRatingSourceLabel }

export const TREND_RANKING_COUNT = 3
export const MIN_TREND_RATED_EPISODES = 5
export const MIN_TREND_SIGNAL_RATIO = 2
export const MIN_TREND_DELTA = 0.1

export function linearRegression(values) {
  const points = values.map((value, index) => ({ x: index, y: value }))
  return linearRegressionFromPoints(points)
}

export function linearRegressionFromPoints(values) {
  const points = values.filter(
    (point) =>
      typeof point?.x === 'number' &&
      Number.isFinite(point.x) &&
      typeof point?.y === 'number'
  )

  if (points.length === 0) {
    return null
  }

  if (points.length === 1) {
    return {
      slope: 0,
      intercept: points[0].y
    }
  }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (const point of points) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumXX += point.x * point.x
  }

  const denominator = points.length * sumXX - sumX * sumX

  if (denominator === 0) {
    return {
      slope: 0,
      intercept: points[0].y
    }
  }

  const slope = (points.length * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / points.length

  return { slope, intercept }
}

export function trendline(values, startX) {
  const regression = linearRegression(values)

  if (!regression) {
    return null
  }

  const validCount = values.filter((value) => typeof value === 'number').length

  if (validCount === 0) {
    return null
  }

  const endX = startX + validCount - 1
  const startY = regression.intercept
  const endY = regression.slope * (validCount - 1) + regression.intercept

  return [
    { x: startX, y: startY },
    { x: endX, y: endY }
  ]
}

export function trendlineFromPoints(values) {
  const points = values.filter(
    (point) =>
      typeof point?.x === 'number' &&
      Number.isFinite(point.x) &&
      typeof point?.y === 'number'
  )
  const regression = linearRegressionFromPoints(points)

  if (!regression || points.length === 0) {
    return null
  }

  const startX = points[0].x
  const endX = points[points.length - 1].x

  return [
    { x: startX, y: regression.slope * startX + regression.intercept },
    { x: endX, y: regression.slope * endX + regression.intercept }
  ]
}

export function summarizeTrendScope(
  points,
  { totalEpisodes = points.length, source = null } = {}
) {
  const excludedFallback = points.filter(
    (point) => point.isFallbackRating && isUsableRating(point.rating)
  ).length
  const ratedPoints = points
    .filter((point) => !point.isFallbackRating && isUsableRating(point.rating))
    .sort((left, right) => left.x - right.x)

  if (ratedPoints.length === 0) {
    return null
  }

  const regression = linearRegressionFromPoints(
    ratedPoints.map((point) => ({ x: point.x, y: point.rating }))
  )
  const values = ratedPoints.map((point) => point.rating)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const topRanked = [...ratedPoints].sort(
    (left, right) => right.rating - left.rating || left.x - right.x
  )
  const bottomRanked = [...ratedPoints].sort(
    (left, right) => left.rating - right.rating || right.x - left.x
  )
  const rankingCount = Math.min(
    TREND_RANKING_COUNT,
    Math.floor(ratedPoints.length / 2)
  )
  const top = topRanked.slice(0, rankingCount).map(toTrendExtreme)
  const bottom = bottomRanked.slice(0, rankingCount).map(toTrendExtreme)
  const firstRatedX = ratedPoints[0].x
  const lastRatedX = ratedPoints.at(-1).x
  const delta = regression.slope * (lastRatedX - firstRatedX)
  const meanX =
    ratedPoints.reduce((sum, point) => sum + point.x, 0) / ratedPoints.length
  const sumSquaredX = ratedPoints.reduce(
    (sum, point) => sum + (point.x - meanX) ** 2,
    0
  )
  const sumSquaredErrors = ratedPoints.reduce((sum, point) => {
    const projected = regression.slope * point.x + regression.intercept
    return sum + (point.rating - projected) ** 2
  }, 0)
  const slopeStandardError =
    ratedPoints.length > 2 && sumSquaredX > 0
      ? Math.sqrt(sumSquaredErrors / (ratedPoints.length - 2) / sumSquaredX)
      : null
  const signalRatio =
    slopeStandardError === 0
      ? regression.slope === 0
        ? 0
        : Number.POSITIVE_INFINITY
      : slopeStandardError
        ? Math.abs(regression.slope) / slopeStandardError
        : 0
  const trendCriteria = {
    ratedEpisodes: ratedPoints.length,
    minimumRatedEpisodes: MIN_TREND_RATED_EPISODES,
    enoughRatedEpisodes: ratedPoints.length >= MIN_TREND_RATED_EPISODES,
    signalRatio,
    minimumSignalRatio: MIN_TREND_SIGNAL_RATIO,
    consistentSlope: signalRatio >= MIN_TREND_SIGNAL_RATIO,
    absoluteDelta: Math.abs(delta),
    minimumDelta: MIN_TREND_DELTA,
    meaningfulDelta: Math.abs(delta) >= MIN_TREND_DELTA
  }
  const hasClearDirection =
    trendCriteria.enoughRatedEpisodes &&
    trendCriteria.consistentSlope &&
    trendCriteria.meaningfulDelta

  return {
    n: ratedPoints.length,
    totalEpisodes,
    excludedFallback,
    source,
    mean,
    top,
    bottom,
    high: toTrendExtreme(topRanked[0]),
    low: toTrendExtreme(bottomRanked[0]),
    firstRatedX,
    lastRatedX,
    slope: regression.slope,
    delta,
    slopeStandardError,
    trendCriteria,
    direction: hasClearDirection
      ? regression.slope > 0
        ? 'up'
        : 'down'
      : 'unclear'
  }
}

function toTrendExtreme(point) {
  return { value: point.rating, point }
}

export function isUsableRating(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 10
  )
}

export const MIN_PRIMARY_RATING_COVERAGE = 0.6

export function isTrustedRating(rating) {
  if (!rating?.provenance) {
    return true
  }

  return (
    rating.provenance.relation === 'one-to-one' &&
    rating.provenance.confidence === 'strong'
  )
}

export function isUsableProviderRating(rating) {
  return isTrustedRating(rating) && isUsableRating(rating?.rating)
}

export function selectPrimaryRatingSource(
  episodes = [],
  {
    priority = RATING_SOURCE_PRIORITY,
    minimumCoverage = MIN_PRIMARY_RATING_COVERAGE
  } = {}
) {
  const eligibleEpisodes = episodes.filter((episode) =>
    episode.ratings?.some(isUsableProviderRating)
  )
  const counts = new Map()

  for (const episode of eligibleEpisodes) {
    const sources = new Set(
      episode.ratings
        .filter(isUsableProviderRating)
        .map((rating) => rating.source)
    )
    for (const source of sources) {
      counts.set(source, (counts.get(source) ?? 0) + 1)
    }
  }

  const eligibleCount = eligibleEpisodes.length
  const coverage = Array.from(counts, ([source, ratedEpisodes]) => ({
    source,
    ratedEpisodes,
    eligibleEpisodes: eligibleCount,
    coverage: eligibleCount > 0 ? ratedEpisodes / eligibleCount : 0
  })).sort((left, right) => {
    const coverageDifference = right.coverage - left.coverage
    if (coverageDifference !== 0) {
      return coverageDifference
    }

    return (
      sourceRank(left.source, priority) - sourceRank(right.source, priority)
    )
  })

  const source =
    priority.find(
      (candidate) =>
        (counts.get(candidate) ?? 0) / Math.max(eligibleCount, 1) >=
        minimumCoverage
    ) ??
    coverage[0]?.source ??
    null

  return {
    source,
    minimumCoverage,
    eligibleEpisodes: eligibleCount,
    coverage
  }
}

export function resolveEpisodeRating(
  ratings = [],
  primarySource,
  priority = RATING_SOURCE_PRIORITY
) {
  const usableRatings = ratings.filter(isUsableProviderRating)
  const sources = [
    primarySource,
    ...priority,
    ...usableRatings.map((rating) => rating.source)
  ].filter(
    (source, index, values) => source && values.indexOf(source) === index
  )

  for (const source of sources) {
    const providerRating = usableRatings.find(
      (rating) => rating.source === source
    )
    if (providerRating) {
      return {
        rating: providerRating.rating,
        ratingSource: providerRating.source,
        isFallbackRating: providerRating.source !== primarySource
      }
    }
  }

  return {
    rating: null,
    ratingSource: null,
    isFallbackRating: false
  }
}

export function getRatingSpread(ratings = []) {
  const usableRatings = ratings.filter(isUsableProviderRating)
  if (usableRatings.length < 2) {
    return null
  }

  const values = usableRatings.map((rating) => rating.rating)
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    sources: usableRatings.map((rating) => rating.source)
  }
}

function sourceRank(source, priority) {
  const index = priority.indexOf(source)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}
