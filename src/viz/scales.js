import { scaleLinear } from 'd3'

import {
  SERIES_BREAKPOINT_ID,
  detectSeriesBreakpoint,
  getRatingSpread,
  isUsableProviderRating,
  isUsableRating,
  linearRegressionFromPoints,
  resolveEpisodeRating,
  selectPrimaryRatingSource,
  summarizeTrendScope
} from '../data/stats.js'

const MIN_RATING = 0
const MAX_RATING = 10
const X_EDGE_INSET = 6
const DEFAULT_VIEWPORT_SNAP_EPISODES = 3
const DEFAULT_VIEWPORT_MIN_SPACING_RATIO = 0.85
const SPARSE_CENTER_MAX_SPACING = 80
const SPARSE_CENTER_ZOOM_TRANSITION_RATIO = 0.1
const VIEWPORT_DENSITY_CONFIG = {
  roomy: {
    desktop: { targetSpacing: 30, minimum: 12, maximum: 40 },
    mobile: { targetSpacing: 26, minimum: 8, maximum: 12 }
  },
  balanced: {
    desktop: { targetSpacing: 20, minimum: 18, maximum: 72 },
    mobile: { targetSpacing: 18, minimum: 12, maximum: 18 }
  },
  dense: {
    desktop: { targetSpacing: 12, minimum: 30, maximum: 120 },
    mobile: { targetSpacing: 12, minimum: 18, maximum: 30 }
  }
}

export function buildChartModel(seasons, options = {}) {
  const breakpointDetector =
    options.breakpointDetector ?? detectSeriesBreakpoint
  const episodes = seasons.flatMap((season) => season.episodes)
  const automaticPrimaryRating = selectPrimaryRatingSource(episodes)
  const requestedPrimarySource = options.primaryRatingSource
  const primaryRating = {
    ...automaticPrimaryRating,
    source: automaticPrimaryRating.coverage.some(
      (entry) =>
        entry.source === requestedPrimarySource && entry.ratedEpisodes > 0
    )
      ? requestedPrimarySource
      : automaticPrimaryRating.source
  }
  const points = []
  const seasonSpans = []
  const seasonTrendlines = []
  const trendSummaries = {}
  const comparableSeasonSummaries = []
  let seriesBreakpointCandidate = null
  let seriesBreakpoint = null
  let absoluteIndex = 1

  seasons.forEach((season, seasonIndex) => {
    const seasonPoints = []
    const start = absoluteIndex

    season.episodes.forEach((episode) => {
      let resolvedRating = resolveEpisodeRating(
        episode.ratings,
        primaryRating.source
      )
      if (
        options.strictPrimaryRatingSource &&
        resolvedRating.ratingSource !== primaryRating.source
      ) {
        resolvedRating = {
          rating: null,
          ratingSource: null,
          isFallbackRating: false
        }
      }
      const point = {
        ...episode,
        x: absoluteIndex,
        ...resolvedRating,
        ratingSpread: getRatingSpread(episode.ratings),
        seasonIndex
      }

      points.push(point)
      seasonPoints.push(point)
      absoluteIndex += 1
    })

    if (seasonPoints.length > 0) {
      const end = absoluteIndex - 1
      seasonSpans.push({
        seasonNumber: season.number,
        seasonIndex,
        start,
        end,
        midpoint: start + (end - start) / 2
      })
    }

    const ratedSeasonPoints = seasonPoints.filter(
      (point) => isUsableRating(point.rating) && !point.isFallbackRating
    )
    const regression = linearRegressionFromPoints(
      ratedSeasonPoints.map((point) => ({
        x: point.x,
        y: point.rating
      }))
    )

    const seasonSummary = summarizeTrendScope(seasonPoints, {
      totalEpisodes: seasonPoints.length,
      source: primaryRating.source
    })

    if (regression && ratedSeasonPoints.length >= 3 && seasonSummary) {
      const id = `season:${season.number}`
      const decoratedSummary = {
        ...seasonSummary,
        id,
        kind: 'season',
        label: `Season ${season.number}`,
        seasonNumber: season.number
      }

      seasonTrendlines.push({
        id,
        kind: 'season',
        seasonNumber: season.number,
        seasonIndex,
        startX: ratedSeasonPoints[0].x,
        endX: ratedSeasonPoints[ratedSeasonPoints.length - 1].x,
        regression
      })
      trendSummaries[id] = decoratedSummary
      comparableSeasonSummaries.push(decoratedSummary)
    }
  })

  const ratedPoints = points.filter((point) => isUsableRating(point.rating))
  const primaryRatedPoints = ratedPoints.filter(
    (point) => !point.isFallbackRating
  )
  const xMax = Math.max(ratedPoints.at(-1)?.x ?? points.length, 1)
  const visibleSeasonSpans = seasonSpans
    .filter((span) => span.start <= xMax)
    .map((span) => {
      const end = Math.min(span.end, xMax)
      return {
        ...span,
        end,
        midpoint: span.start + (end - span.start) / 2
      }
    })
  const macroRegression =
    primaryRatedPoints.length >= 3
      ? linearRegressionFromPoints(
          primaryRatedPoints.map((point) => ({
            x: point.x,
            y: point.rating
          }))
        )
      : null

  if (macroRegression) {
    const seriesSummary = summarizeTrendScope(points, {
      totalEpisodes: points.length,
      source: primaryRating.source
    })
    const seasonVariation = summarizeSeasonVariation(primaryRatedPoints)

    trendSummaries.series = {
      ...seriesSummary,
      ratingStandardDeviation:
        seasonVariation?.withinSeasonStandardDeviation ??
        seriesSummary.ratingStandardDeviation,
      betweenSeasonVariationShare:
        seasonVariation?.betweenSeasonVariationShare ?? null,
      seasonExtremes: summarizeSeasonExtremes(comparableSeasonSummaries),
      id: 'series',
      kind: 'series',
      label: 'Full series'
    }

    seriesBreakpointCandidate = breakpointDetector(points)
    if (seriesBreakpointCandidate) {
      seriesBreakpoint = createSeriesBreakpointSummary(
        seriesBreakpointCandidate,
        points,
        primaryRating.source
      )
      trendSummaries[SERIES_BREAKPOINT_ID] = seriesBreakpoint
      if (seriesBreakpoint.highConfidence) {
        trendSummaries.series.detectedBreakpoint = {
          id: SERIES_BREAKPOINT_ID,
          breakpointPoint: seriesBreakpoint.breakpointPoint,
          score: seriesBreakpoint.score
        }
      }
    }

    for (const summary of comparableSeasonSummaries) {
      summary.seriesMeanDifference = summary.mean - seriesSummary.mean
    }
  }

  const pointById = new Map()
  for (const point of points) {
    if (!pointById.has(point.id)) {
      pointById.set(point.id, point)
    }
  }
  const ratedPointIndexById = new Map()
  ratedPoints.forEach((point, index) => {
    if (!ratedPointIndexById.has(point.id)) {
      ratedPointIndexById.set(point.id, index)
    }
  })
  const seriesRankByPointId = createSeriesRankByPointId(primaryRatedPoints)
  const seriesRankingsBySource = createSeriesRankingsBySource(points)
  const ratedPointsBySeason = new Map()
  for (const point of ratedPoints) {
    const seasonPoints = ratedPointsBySeason.get(point.season) ?? []
    seasonPoints.push(point)
    ratedPointsBySeason.set(point.season, seasonPoints)
  }

  return {
    points,
    pointById,
    ratedPoints,
    ratedPointIndexById,
    seriesRankByPointId,
    seriesRankingsBySource,
    ratedPointsBySeason,
    primaryRatedPoints,
    primaryRatingSource: primaryRating.source,
    ratingSourceCoverage: primaryRating.coverage,
    minimumPrimaryCoverage: primaryRating.minimumCoverage,
    seasonSpans: visibleSeasonSpans,
    seasonTrendlines,
    trendSummaries,
    seriesBreakpointCandidate,
    seriesBreakpoint,
    macroRegression,
    xMax,
    totalSeasons: seasons.length
  }
}

function createSeriesRankByPointId(points) {
  const seenIds = new Set()
  const uniquePoints = points.filter((point) => {
    if (seenIds.has(point.id)) {
      return false
    }
    seenIds.add(point.id)
    return true
  })
  const rankedPoints = uniquePoints.sort(
    (left, right) => right.rating - left.rating || left.x - right.x
  )
  const ranks = new Map()
  let previousRating = null
  let rank = 0

  rankedPoints.forEach((point, index) => {
    if (point.rating !== previousRating) {
      rank = index + 1
      previousRating = point.rating
    }
    ranks.set(point.id, rank)
  })

  return ranks
}

function createSeriesRankingsBySource(points) {
  const pointsBySource = new Map()

  for (const point of points) {
    for (const rating of point.ratings.filter(isUsableProviderRating)) {
      const sourcePoints = pointsBySource.get(rating.source) ?? []
      sourcePoints.push({
        id: point.id,
        rating: rating.rating,
        x: point.x
      })
      pointsBySource.set(rating.source, sourcePoints)
    }
  }

  return new Map(
    Array.from(pointsBySource, ([source, sourcePoints]) => [
      source,
      {
        rankByPointId: createSeriesRankByPointId(sourcePoints),
        total: new Set(sourcePoints.map((point) => point.id)).size
      }
    ])
  )
}

function createSeriesBreakpointSummary(candidate, allPoints, source) {
  const beforeEndX = candidate.beforePoints.at(-1).x
  const afterStartX = candidate.afterPoints[0].x
  const beforeTotal = allPoints.filter(
    (point) => point.season !== 0 && point.x < afterStartX
  ).length
  const afterTotal = allPoints.filter(
    (point) => point.season !== 0 && point.x >= afterStartX
  ).length
  const beforeSummary = summarizeTrendScope(candidate.beforePoints, {
    totalEpisodes: beforeTotal,
    source
  })
  const afterSummary = summarizeTrendScope(candidate.afterPoints, {
    totalEpisodes: afterTotal,
    source
  })
  const beforeRegression = linearRegressionFromPoints(
    candidate.beforePoints.map((point) => ({ x: point.x, y: point.rating }))
  )
  const afterRegression = linearRegressionFromPoints(
    candidate.afterPoints.map((point) => ({ x: point.x, y: point.rating }))
  )

  return {
    ...candidate,
    id: SERIES_BREAKPOINT_ID,
    kind: 'breakpoint',
    label: 'Series breakpoint',
    breakpointPoint: candidate.afterPoints[0],
    beforeSummary,
    afterSummary,
    beforeTrendline: {
      startX: candidate.beforePoints[0].x,
      endX: beforeEndX,
      regression: beforeRegression
    },
    afterTrendline: {
      startX: afterStartX,
      endX: candidate.afterPoints.at(-1).x,
      regression: afterRegression
    }
  }
}

function summarizeSeasonVariation(points) {
  if (points.length === 0) {
    return null
  }

  const seasonValues = new Map()

  for (const point of points) {
    const values = seasonValues.get(point.seasonIndex) ?? []
    values.push(point.rating)
    seasonValues.set(point.seasonIndex, values)
  }

  const overallMean =
    points.reduce((sum, point) => sum + point.rating, 0) / points.length
  let withinSeasonSquares = 0
  let betweenSeasonSquares = 0

  for (const values of seasonValues.values()) {
    const seasonMean =
      values.reduce((sum, value) => sum + value, 0) / values.length
    withinSeasonSquares += values.reduce(
      (sum, value) => sum + (value - seasonMean) ** 2,
      0
    )
    betweenSeasonSquares += values.length * (seasonMean - overallMean) ** 2
  }

  const totalSquares = withinSeasonSquares + betweenSeasonSquares

  return {
    withinSeasonStandardDeviation: Math.sqrt(
      withinSeasonSquares / points.length
    ),
    betweenSeasonVariationShare:
      totalSquares > 0 ? betweenSeasonSquares / totalSquares : null
  }
}

function summarizeSeasonExtremes(summaries) {
  if (summaries.length < 2) {
    return null
  }

  const highestMean = Math.max(...summaries.map((summary) => summary.mean))
  const lowestMean = Math.min(...summaries.map((summary) => summary.mean))

  if (highestMean === lowestMean) {
    return null
  }

  return {
    best: toSeasonExtreme(summaries, highestMean),
    worst: toSeasonExtreme(summaries, lowestMean)
  }
}

function toSeasonExtreme(summaries, mean) {
  const matchingSummaries = summaries.filter((summary) => summary.mean === mean)

  return {
    mean,
    seasonNumbers: matchingSummaries.map((summary) => summary.seasonNumber),
    ratedEpisodes:
      matchingSummaries.length === 1 ? matchingSummaries[0].n : null
  }
}

export function createDefaultViewport(
  model,
  width,
  isMobile,
  density = 'balanced'
) {
  if (density === 'all' || (model.xMax <= 40 && density !== 'roomy')) {
    return {
      start: 1,
      end: model.xMax
    }
  }

  const densityConfig =
    VIEWPORT_DENSITY_CONFIG[density] ?? VIEWPORT_DENSITY_CONFIG.balanced
  const deviceConfig = densityConfig[isMobile ? 'mobile' : 'desktop']
  const axisWidth = isMobile ? 44 : 0
  const availableWidth = Math.max(width - axisWidth, 240)
  const preferredWindow = Math.floor(
    availableWidth / deviceConfig.targetSpacing
  )
  const episodeCount = clamp(
    preferredWindow,
    deviceConfig.minimum,
    deviceConfig.maximum
  )
  const defaultEnd = Math.min(model.xMax, episodeCount)
  const snappedEnd = snapDefaultViewportEnd(
    model,
    defaultEnd,
    availableWidth,
    deviceConfig.targetSpacing
  )

  return {
    start: 1,
    end: snappedEnd
  }
}

function snapDefaultViewportEnd(
  model,
  defaultEnd,
  availableWidth,
  targetSpacing
) {
  const hasComfortableSpacing = (end) =>
    end > defaultEnd &&
    (availableWidth - X_EDGE_INSET * 2) / Math.max(end - 1, 1) >=
      targetSpacing * DEFAULT_VIEWPORT_MIN_SPACING_RATIO
  const canSnapToNearbyEdge = (end) =>
    end - defaultEnd <= DEFAULT_VIEWPORT_SNAP_EPISODES &&
    hasComfortableSpacing(end)

  if (hasComfortableSpacing(model.xMax)) {
    return model.xMax
  }

  const nearbySeasonEnd = (model.seasonSpans ?? [])
    .map((season) => season.end)
    .filter(
      (end) =>
        canSnapToNearbyEdge(end) &&
        model.xMax - end > DEFAULT_VIEWPORT_SNAP_EPISODES
    )
    .sort((left, right) => left - right)[0]

  return nearbySeasonEnd ?? defaultEnd
}

export function clampViewport(viewport, model) {
  const span = Math.max(0, viewport.end - viewport.start)
  const safeSpan = Math.min(span, Math.max(model.xMax - 1, 0))
  const maxStart = Math.max(1, model.xMax - safeSpan)
  const start = clamp(viewport.start, 1, maxStart)
  const end = Math.min(model.xMax, start + safeSpan)

  return { start, end }
}

export function viewportToBrushSelection(viewport, scale) {
  return [scale(viewport.start), scale(viewport.end)]
}

export function getVisiblePoints(model, viewport) {
  const start = Math.floor(viewport.start)
  const end = Math.ceil(viewport.end)

  return model.points.filter((point) => point.x >= start && point.x <= end)
}

export function getVisibleRatedPoints(model, viewport) {
  const start = Math.floor(viewport.start)
  const end = Math.ceil(viewport.end)

  return model.ratedPoints.filter((point) => point.x >= start && point.x <= end)
}

export function getVisibleSeasonTrendlines(model, viewport) {
  return model.seasonTrendlines
    .map((trendline) => {
      const startX = Math.max(viewport.start, trendline.startX)
      const endX = Math.min(viewport.end, trendline.endX)

      if (endX <= startX) {
        return null
      }

      return {
        ...trendline,
        visibleStartX: startX,
        visibleEndX: endX,
        points: [
          {
            x: startX,
            y: projectRegression(trendline.regression, startX)
          },
          {
            x: endX,
            y: projectRegression(trendline.regression, endX)
          }
        ]
      }
    })
    .filter(Boolean)
}

export function getMacroTrendline(model, viewport) {
  if (!model.macroRegression || model.primaryRatedPoints.length < 3) {
    return null
  }

  const firstRatedX = model.primaryRatedPoints[0].x
  const lastRatedX = model.primaryRatedPoints.at(-1).x
  const startX = Math.max(viewport.start, firstRatedX)
  const endX = Math.min(viewport.end, lastRatedX)

  if (endX <= startX) {
    return null
  }

  return {
    id: 'series',
    kind: 'series',
    startX: firstRatedX,
    endX: lastRatedX,
    visibleStartX: startX,
    visibleEndX: endX,
    regression: model.macroRegression,
    points: [
      {
        x: startX,
        y: projectRegression(model.macroRegression, startX)
      },
      {
        x: endX,
        y: projectRegression(model.macroRegression, endX)
      }
    ]
  }
}

export function getVisibleSeriesBreakpoint(model, viewport) {
  const breakpoint = model.seriesBreakpoint
  if (!breakpoint) {
    return null
  }

  return {
    id: breakpoint.id,
    breakpointX: breakpoint.breakpointX,
    markerVisible:
      breakpoint.breakpointX >= viewport.start &&
      breakpoint.breakpointX <= viewport.end,
    segments: [breakpoint.beforeTrendline, breakpoint.afterTrendline]
      .map((trendline, index) => {
        const startX = Math.max(viewport.start, trendline.startX)
        const endX = Math.min(viewport.end, trendline.endX)
        if (!trendline.regression || endX <= startX) {
          return null
        }
        return {
          id: `${breakpoint.id}:${index === 0 ? 'before' : 'after'}`,
          points: [
            {
              x: startX,
              y: projectRegression(trendline.regression, startX)
            },
            {
              x: endX,
              y: projectRegression(trendline.regression, endX)
            }
          ]
        }
      })
      .filter(Boolean)
  }
}

export function createSparklineScales(model, dimensions, options = {}) {
  const domain = resolveRatingDomain(model.ratedPoints, options)

  return {
    xScale: scaleLinear()
      .domain(
        resolveHorizontalDomain(
          model,
          [1, model.xMax],
          dimensions.width,
          options
        )
      )
      .range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

export function createMainScales(model, viewport, dimensions, options = {}) {
  const domain = resolveRatingDomain(model.ratedPoints, options)

  return {
    xScale: scaleLinear()
      .domain(
        resolveHorizontalDomain(
          model,
          [viewport.start, viewport.end],
          dimensions.width,
          options
        )
      )
      .range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

function resolveHorizontalDomain(model, domain, width, options) {
  const centering = getSparseCentering(model, width, options)
  if (!centering) {
    return domain
  }

  const [start, end] = domain
  const { centeredCenter, centeredSpan, fullCenter, fullSpan } = centering
  if (fullSpan === 0) {
    return [
      centeredCenter - centeredSpan / 2,
      centeredCenter + centeredSpan / 2
    ]
  }

  // Ease the centering space away as zoom begins. Previously it disappeared
  // as soon as an endpoint left the logical viewport, which made tiny zoom
  // changes snap between two unrelated horizontal domains.
  const viewportSpan = Math.max(end - start, 0)
  const centeredRatio = getSparseCenterRatio(viewportSpan, fullSpan)
  const viewportCenter = start + viewportSpan / 2
  const resolvedCenter =
    viewportCenter + (centeredCenter - fullCenter) * centeredRatio
  const resolvedSpan = viewportSpan + (centeredSpan - fullSpan) * centeredRatio

  return [resolvedCenter - resolvedSpan / 2, resolvedCenter + resolvedSpan / 2]
}

export function resolveViewportFromDisplay(
  model,
  displayViewport,
  width,
  options = {}
) {
  const centering = getSparseCentering(model, width, options)
  if (!centering) {
    return displayViewport
  }

  const { centeredCenter, centeredSpan, fullCenter, fullSpan } = centering
  if (fullSpan === 0) {
    return { start: 1, end: model.xMax }
  }

  const displaySpan = Math.max(displayViewport.end - displayViewport.start, 0)
  const transitionSpan = fullSpan * SPARSE_CENTER_ZOOM_TRANSITION_RATIO
  const transitionStart = fullSpan - transitionSpan
  const addedCenteredSpan = centeredSpan - fullSpan
  const viewportSpan =
    displaySpan <= transitionStart
      ? displaySpan
      : (displaySpan + (addedCenteredSpan * transitionStart) / transitionSpan) /
        (1 + addedCenteredSpan / transitionSpan)
  const safeViewportSpan = clamp(viewportSpan, 0, fullSpan)
  const centeredRatio = getSparseCenterRatio(safeViewportSpan, fullSpan)
  const displayCenter =
    displayViewport.start + (displayViewport.end - displayViewport.start) / 2
  const viewportCenter =
    displayCenter - (centeredCenter - fullCenter) * centeredRatio

  return {
    start: viewportCenter - safeViewportSpan / 2,
    end: viewportCenter + safeViewportSpan / 2
  }
}

function getSparseCentering(model, width, options) {
  if (!options.centerSparse || model.ratedPoints.length === 0) {
    return null
  }

  const ratedStart = model.ratedPoints[0].x
  const ratedEnd = model.ratedPoints.at(-1).x
  const ratedSpan = ratedEnd - ratedStart
  const availableWidth = Math.max(width - X_EDGE_INSET * 2, 0)
  const minimumCenteredSpan = availableWidth / SPARSE_CENTER_MAX_SPACING

  // First let a short series spread out to fill the chart. Only add centered
  // breathing room when doing so would put its episodes farther apart than
  // the sparse-spacing ceiling.
  if (ratedSpan >= minimumCenteredSpan) {
    return null
  }

  const fullSpan = Math.max(model.xMax - 1, 0)
  return {
    centeredCenter: ratedStart + ratedSpan / 2,
    centeredSpan: Math.max(minimumCenteredSpan, fullSpan),
    fullCenter: 1 + fullSpan / 2,
    fullSpan
  }
}

function getSparseCenterRatio(viewportSpan, fullSpan) {
  const transitionSpan = fullSpan * SPARSE_CENTER_ZOOM_TRANSITION_RATIO
  return clamp(
    (viewportSpan - (fullSpan - transitionSpan)) / transitionSpan,
    0,
    1
  )
}

function resolveXRange(width) {
  if (width <= X_EDGE_INSET * 2) {
    return [0, width]
  }

  return [X_EDGE_INSET, width - X_EDGE_INSET]
}

function resolveRatingDomain(
  points,
  {
    absoluteYAxis = false,
    showSourceSpread = false,
    additionalRatings = []
  } = {}
) {
  if (absoluteYAxis) {
    return [MIN_RATING, MAX_RATING]
  }

  const ratings = points
    .flatMap((point) => [
      point.rating,
      ...(showSourceSpread && point.ratingSpread
        ? [point.ratingSpread.min, point.ratingSpread.max]
        : [])
    ])
    .concat(additionalRatings)
    .filter(isUsableRating)

  if (ratings.length === 0) {
    return [MIN_RATING, MAX_RATING]
  }

  const minRating = Math.min(...ratings)
  const maxRating = Math.max(...ratings)

  if (minRating === maxRating) {
    return [
      clamp(minRating - 0.6, MIN_RATING, MAX_RATING),
      clamp(maxRating + 0.6, MIN_RATING, MAX_RATING)
    ]
  }

  const padding = Math.max((maxRating - minRating) * 0.15, 0.18)
  return [
    clamp(minRating - padding, MIN_RATING, MAX_RATING),
    clamp(maxRating + padding, MIN_RATING, MAX_RATING)
  ]
}

function projectRegression(regression, x) {
  return regression.slope * x + regression.intercept
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
