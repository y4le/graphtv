import {
  RATING_SOURCE_PRIORITY,
  getRatingSourceLabel
} from './ratingProviders.js'

export { RATING_SOURCE_PRIORITY, getRatingSourceLabel }

export const TREND_RANKING_COUNT = 3
export const MIN_TREND_RATED_EPISODES = 5
export const MIN_TREND_SIGNAL_RATIO = 2
export const MIN_TREND_DELTA = 0.1

export const SERIES_BREAKPOINT_ID = 'series:breakpoint'
export const SERIES_BREAKPOINT_DEFAULTS = Object.freeze({
  minimumRatedEpisodes: 24,
  minimumCoverage: 0.7,
  maximumCoverageShift: 0.25,
  minimumSegmentFraction: 0.08,
  minimumSegmentFloor: 6,
  minimumSegmentCap: 24,
  minimumAbsoluteDrop: 0.5,
  minimumStandardizedDrop: 1.25,
  minimumSeparation: 0.7,
  minimumSustain: 0.7,
  maximumRecoveryFraction: 0.4,
  maximumPValue: 0.01,
  minimumScore: 70,
  permutations: 299,
  maximumDriftSlopes: 100000
})

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
  const sumSquaredDeviations = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  )
  const ratingStandardDeviation = Math.sqrt(
    sumSquaredDeviations / ratedPoints.length
  )
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
  const residualMeanAbsoluteError =
    ratedPoints.reduce((sum, point) => {
      const projected = regression.slope * point.x + regression.intercept
      return sum + Math.abs(point.rating - projected)
    }, 0) / ratedPoints.length
  const rSquared =
    sumSquaredDeviations > 0
      ? Math.max(0, Math.min(1, 1 - sumSquaredErrors / sumSquaredDeviations))
      : null
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
  const deltaStandardError =
    slopeStandardError === null
      ? null
      : slopeStandardError * (lastRatedX - firstRatedX)
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
    ratingStandardDeviation,
    residualMeanAbsoluteError,
    rSquared,
    top,
    bottom,
    high: toTrendExtreme(topRanked[0]),
    low: toTrendExtreme(bottomRanked[0]),
    firstRatedX,
    lastRatedX,
    slope: regression.slope,
    delta,
    deltaStandardError,
    slopeStandardError,
    trendCriteria,
    direction: hasClearDirection
      ? regression.slope > 0
        ? 'up'
        : 'down'
      : 'unclear'
  }
}

export function detectSeriesBreakpoint(points, options = {}) {
  const config = {
    ...SERIES_BREAKPOINT_DEFAULTS,
    ...options
  }
  const eligibleEpisodes = points
    .filter((point) => point.season !== 0)
    .sort((left, right) => left.x - right.x)
  const primaryRatedPoints = eligibleEpisodes.filter(
    (point) => !point.isFallbackRating && isUsableRating(point.rating)
  )
  const knownVotes = primaryRatedPoints
    .map(getPointVoteCount)
    .filter(Number.isFinite)
  const voteFloor =
    knownVotes.length > 0 ? Math.max(20, median(knownVotes) * 0.05) : null
  const ratedPoints = primaryRatedPoints.filter((point) => {
    const votes = getPointVoteCount(point)
    return voteFloor === null || votes === null || votes >= voteFloor
  })
  const n = ratedPoints.length

  if (eligibleEpisodes.length === 0) {
    return null
  }

  const minimumSegment = clamp(
    Math.ceil(config.minimumSegmentFraction * n),
    config.minimumSegmentFloor,
    config.minimumSegmentCap
  )
  if (n < minimumSegment * 2) {
    return null
  }
  const values = ratedPoints.map((point) => point.rating)
  const observed = scanRankCusum(values, minimumSegment)

  if (!observed) {
    return null
  }

  const beforePoints = ratedPoints.slice(0, observed.k)
  const afterPoints = ratedPoints.slice(observed.k)
  const beforeValues = values.slice(0, observed.k)
  const afterValues = values.slice(observed.k)
  const beforeMedian = median(beforeValues)
  const afterMedian = median(afterValues)
  const drop = beforeMedian - afterMedian
  const scale =
    1.4826 *
    median([
      ...beforeValues.map((value) => Math.abs(value - beforeMedian)),
      ...afterValues.map((value) => Math.abs(value - afterMedian))
    ])
  const sustainThreshold = quantile(beforeValues, 0.25)
  const sustain =
    afterValues.filter((value) => value < sustainThreshold).length /
    afterValues.length
  const tailMedian = median(
    afterValues.slice(-Math.min(10, afterValues.length))
  )
  const recovery = tailMedian - afterMedian
  const firstAfterX = afterPoints[0].x
  const beforeEpisodeCount = eligibleEpisodes.filter(
    (point) => point.x < firstAfterX
  ).length
  const afterEpisodeCount = eligibleEpisodes.length - beforeEpisodeCount
  const beforeCoverage = beforePoints.length / Math.max(beforeEpisodeCount, 1)
  const afterCoverage = afterPoints.length / Math.max(afterEpisodeCount, 1)
  const coverage = n / eligibleEpisodes.length
  const coverageShift = Math.abs(beforeCoverage - afterCoverage)
  const blockLength = resolveBreakpointBlockLength(
    eligibleEpisodes,
    n,
    config.blockLength
  )
  const seriesHash = hashBreakpointSeries(ratedPoints)
  const driftSlope = estimateWithinSegmentSlope(
    ratedPoints,
    observed.k,
    config.maximumDriftSlopes,
    seriesHash ^ 0x85ebca6b
  )
  const meanX =
    ratedPoints.reduce((sum, point) => sum + point.x, 0) / ratedPoints.length
  const drift = ratedPoints.map((point) => driftSlope * (point.x - meanX))
  const residuals = values.map((value, index) => value - drift[index])
  const random = createSeededRandom(options.randomSeed ?? seriesHash)
  let nullStatisticsAtLeastObserved = 0

  for (let index = 0; index < config.permutations; index += 1) {
    const shuffled = shuffleCircularBlocks(residuals, blockLength, random)
    const surrogate = shuffled.map(
      (value, valueIndex) => value + drift[valueIndex]
    )
    const candidate = scanRankCusum(surrogate, minimumSegment)
    if (!candidate) {
      continue
    }
    if (candidate.z >= observed.z) {
      nullStatisticsAtLeastObserved += 1
    }
  }

  const pValue = (1 + nullStatisticsAtLeastObserved) / (config.permutations + 1)
  const standardizedDrop =
    scale === 0 ? (drop > 0 ? Infinity : 0) : drop / scale
  const recoveryFraction =
    drop > 0 ? Math.max(0, recovery) / drop : Number.POSITIVE_INFINITY
  const scoreFactors = {
    effect: clamp01(
      Math.min(drop / 1, scale === 0 ? (drop > 0 ? 1 : 0) : drop / (2 * scale))
    ),
    separation: clamp01((observed.separation - 0.6) / 0.35),
    persistence: clamp01((sustain - 0.4) / 0.5),
    balance: clamp01(Math.min(beforePoints.length, afterPoints.length) / 26)
  }
  const score =
    100 *
    scoreFactors.effect ** 0.4 *
    scoreFactors.separation ** 0.3 *
    scoreFactors.persistence ** 0.2 *
    scoreFactors.balance ** 0.1
  const criteria = {
    enoughRatedEpisodes: {
      value: n,
      minimum: config.minimumRatedEpisodes,
      passed: n >= config.minimumRatedEpisodes
    },
    enoughCoverage: {
      value: coverage,
      minimum: config.minimumCoverage,
      passed: coverage >= config.minimumCoverage
    },
    stableCoverage: {
      value: coverageShift,
      maximum: config.maximumCoverageShift,
      passed: coverageShift <= config.maximumCoverageShift
    },
    absoluteDrop: {
      value: drop,
      minimum: config.minimumAbsoluteDrop,
      passed: drop >= config.minimumAbsoluteDrop
    },
    standardizedDrop: {
      value: standardizedDrop,
      minimum: config.minimumStandardizedDrop,
      passed: standardizedDrop >= config.minimumStandardizedDrop
    },
    separation: {
      value: observed.separation,
      minimum: config.minimumSeparation,
      passed: observed.separation >= config.minimumSeparation
    },
    persistence: {
      value: sustain,
      minimum: config.minimumSustain,
      passed: sustain >= config.minimumSustain
    },
    noRecovery: {
      value: recoveryFraction,
      maximum: config.maximumRecoveryFraction,
      passed: recoveryFraction <= config.maximumRecoveryFraction
    },
    significant: {
      value: pValue,
      maximum: config.maximumPValue,
      passed: pValue <= config.maximumPValue
    },
    interesting: {
      value: score,
      minimum: config.minimumScore,
      passed: score >= config.minimumScore
    }
  }
  const highConfidence = Object.values(criteria).every(
    (criterion) => criterion.passed
  )

  return {
    id: SERIES_BREAKPOINT_ID,
    kind: 'breakpoint',
    highConfidence,
    confidence: highConfidence ? 'high' : 'below threshold',
    score,
    scoreFactors,
    criteria,
    splitIndex: observed.k,
    breakpointX: (beforePoints.at(-1).x + afterPoints[0].x) / 2,
    beforePoints,
    afterPoints,
    beforeMedian,
    afterMedian,
    drop,
    scale,
    standardizedDrop,
    separation: observed.separation,
    sustain,
    tailMedian,
    recoveryFraction,
    pValue,
    blockLength,
    driftSlope,
    voteFloor,
    coverage,
    beforeCoverage,
    afterCoverage
  }
}

function scanRankCusum(values, minimumSegment) {
  if (values.length < minimumSegment * 2) {
    return null
  }

  const { ranks, tieTerm } = averageRanks(values)
  const prefixRanks = [0]
  for (const rank of ranks) {
    prefixRanks.push(prefixRanks.at(-1) + rank)
  }

  let best = null
  const n = values.length
  for (let k = minimumSegment; k <= n - minimumSegment; k += 1) {
    const n1 = k
    const n2 = n - k
    const u = prefixRanks[k] - (n1 * (n1 + 1)) / 2
    const expected = (n1 * n2) / 2
    const variance = (n1 * n2 * (n + 1 - tieTerm / (n * (n - 1)))) / 12
    const z = variance > 0 ? (u - expected) / Math.sqrt(variance) : 0
    if (!best || z > best.z) {
      best = {
        k,
        z,
        separation: u / (n1 * n2)
      }
    }
  }

  return best
}

function averageRanks(values) {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => left.value - right.value || left.index - right.index)
  const ranks = Array(values.length)
  let tieTerm = 0

  for (let start = 0; start < ordered.length; ) {
    let end = start + 1
    while (
      end < ordered.length &&
      ordered[end].value === ordered[start].value
    ) {
      end += 1
    }
    const averageRank = (start + 1 + end) / 2
    for (let index = start; index < end; index += 1) {
      ranks[ordered[index].index] = averageRank
    }
    const tieCount = end - start
    tieTerm += tieCount ** 3 - tieCount
    start = end
  }

  return { ranks, tieTerm }
}

function resolveBreakpointBlockLength(points, ratedCount, configuredLength) {
  const seasonCounts = new Map()
  for (const point of points) {
    seasonCounts.set(point.season, (seasonCounts.get(point.season) ?? 0) + 1)
  }
  const typicalSeasonLength = Math.round(median([...seasonCounts.values()]))
  const blockMaximum = Math.max(
    2,
    Math.min(13, typicalSeasonLength, Math.floor(ratedCount / 12))
  )

  return (
    configuredLength ??
    clamp(Math.round(Math.cbrt(ratedCount)), 2, blockMaximum)
  )
}

function estimateWithinSegmentSlope(points, splitIndex, maximumSlopes, seed) {
  const slopes = []
  const random = createSeededRandom(seed)
  let seen = 0

  for (const [start, end] of [
    [0, splitIndex],
    [splitIndex, points.length]
  ]) {
    for (let left = start; left < end; left += 1) {
      for (let right = left + 1; right < end; right += 1) {
        const xDistance = points[right].x - points[left].x
        if (xDistance <= 0) {
          continue
        }
        const slope = (points[right].rating - points[left].rating) / xDistance
        seen += 1
        if (slopes.length < maximumSlopes) {
          slopes.push(slope)
          continue
        }
        const replacement = Math.floor(random() * seen)
        if (replacement < maximumSlopes) {
          slopes[replacement] = slope
        }
      }
    }
  }

  return slopes.length > 0 ? median(slopes) : 0
}

function shuffleCircularBlocks(values, blockLength, random) {
  const offset = Math.floor(random() * values.length)
  const rotated = values.map(
    (_, index) => values[(index + offset) % values.length]
  )
  const blocks = []
  for (let index = 0; index < rotated.length; index += blockLength) {
    blocks.push(rotated.slice(index, index + blockLength))
  }
  for (let index = blocks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[blocks[index], blocks[swapIndex]] = [blocks[swapIndex], blocks[index]]
  }
  return blocks.flat()
}

function createSeededRandom(seed) {
  let state = seed >>> 0 || 0x9e3779b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

function hashBreakpointSeries(points) {
  let hash = 2166136261
  for (const point of points) {
    hash ^= Math.round(point.x * 31 + point.rating * 1000)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function getPointVoteCount(point) {
  const providerRating = point.ratings?.find(
    (rating) => rating.source === point.ratingSource
  )
  return Number.isFinite(providerRating?.votes) ? providerRating.votes : null
}

function quantile(values, probability) {
  if (values.length === 0) {
    return 0
  }
  const ordered = [...values].sort((left, right) => left - right)
  const position = (ordered.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const weight = position - lower
  return ordered[lower] * (1 - weight) + ordered[upper] * weight
}

function median(values) {
  return quantile(values, 0.5)
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
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
