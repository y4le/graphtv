import { scaleLinear } from 'd3'

import {
  getRatingSpread,
  isUsableRating,
  linearRegressionFromPoints,
  resolveEpisodeRating,
  selectPrimaryRatingSource
} from '../data/stats.js'

const MIN_RATING = 0
const MAX_RATING = 10
const X_EDGE_INSET = 6

export function buildChartModel(seasons) {
  const episodes = seasons.flatMap((season) => season.episodes)
  const primaryRating = selectPrimaryRatingSource(episodes)
  const points = []
  const seasonSpans = []
  const seasonTrendlines = []
  let absoluteIndex = 1

  seasons.forEach((season, seasonIndex) => {
    const seasonPoints = []
    const start = absoluteIndex

    season.episodes.forEach((episode) => {
      const resolvedRating = resolveEpisodeRating(episode.ratings, primaryRating.source)
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

    const end = absoluteIndex - 1

    seasonSpans.push({
      seasonNumber: season.number,
      seasonIndex,
      start,
      end,
      midpoint: start + (end - start) / 2
    })

    const ratedSeasonPoints = seasonPoints.filter((point) => isUsableRating(point.rating) && !point.isFallbackRating)
    const regression = linearRegressionFromPoints(
      ratedSeasonPoints.map((point) => ({
        x: point.x,
        y: point.rating
      }))
    )

    if (regression && ratedSeasonPoints.length >= 3) {
      seasonTrendlines.push({
        seasonNumber: season.number,
        seasonIndex,
        startX: ratedSeasonPoints[0].x,
        endX: ratedSeasonPoints[ratedSeasonPoints.length - 1].x,
        regression
      })
    }
  })

  const ratedPoints = points.filter((point) => isUsableRating(point.rating))
  const primaryRatedPoints = ratedPoints.filter((point) => !point.isFallbackRating)
  const macroRegression =
    primaryRatedPoints.length >= 3
      ? linearRegressionFromPoints(
          primaryRatedPoints.map((point) => ({
            x: point.x,
            y: point.rating
          }))
        )
      : null

  return {
    points,
    ratedPoints,
    primaryRatedPoints,
    primaryRatingSource: primaryRating.source,
    ratingSourceCoverage: primaryRating.coverage,
    minimumPrimaryCoverage: primaryRating.minimumCoverage,
    seasonSpans,
    seasonTrendlines,
    macroRegression,
    xMax: Math.max(points.length, 1),
    totalSeasons: seasonSpans.length
  }
}

export function createDefaultViewport(model, width, isMobile) {
  if (model.xMax <= 40) {
    return {
      start: 1,
      end: model.xMax
    }
  }

  const targetSpacing = isMobile ? 18 : 20
  const axisWidth = isMobile ? 44 : 0
  const availableWidth = Math.max(width - axisWidth, 240)
  const preferredWindow = Math.floor(availableWidth / targetSpacing)
  const episodeCount = clamp(preferredWindow, isMobile ? 12 : 18, isMobile ? 18 : 72)

  return {
    start: 1,
    end: Math.min(model.xMax, episodeCount)
  }
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
  return model.points.filter((point) => point.x >= viewport.start && point.x <= viewport.end)
}

export function getVisibleRatedPoints(model, viewport) {
  return model.ratedPoints.filter((point) => point.x >= viewport.start && point.x <= viewport.end)
}

export function getVisibleSeasonSpans(model, viewport) {
  return model.seasonSpans.filter((span) => span.end >= viewport.start && span.start <= viewport.end)
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

  return [
    {
      x: viewport.start,
      y: projectRegression(model.macroRegression, viewport.start)
    },
    {
      x: viewport.end,
      y: projectRegression(model.macroRegression, viewport.end)
    }
  ]
}

export function createSparklineScales(model, dimensions, options = {}) {
  const domain = resolveRatingDomain(model.ratedPoints, options)

  return {
    xScale: scaleLinear().domain([1, model.xMax]).range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

export function createMainScales(model, viewport, dimensions, options = {}) {
  const domain = resolveRatingDomain(model.ratedPoints, options)

  return {
    xScale: scaleLinear().domain([viewport.start, viewport.end]).range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

export function createFullSeriesScales(model, dimensions, options = {}) {
  const domain = resolveRatingDomain(model.ratedPoints, options)

  return {
    xScale: scaleLinear().domain([1, model.xMax]).range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

function resolveXRange(width) {
  if (width <= X_EDGE_INSET * 2) {
    return [0, width]
  }

  return [X_EDGE_INSET, width - X_EDGE_INSET]
}

function resolveRatingDomain(points, { absoluteYAxis = false, showSourceSpread = false } = {}) {
  if (absoluteYAxis) {
    return [MIN_RATING, MAX_RATING]
  }

  const ratings = points
    .flatMap((point) => [
      point.rating,
      ...(showSourceSpread && point.ratingSpread ? [point.ratingSpread.min, point.ratingSpread.max] : [])
    ])
    .filter(isUsableRating)

  if (ratings.length === 0) {
    return [MIN_RATING, MAX_RATING]
  }

  const minRating = Math.min(...ratings)
  const maxRating = Math.max(...ratings)

  if (minRating === maxRating) {
    return [clamp(minRating - 0.6, MIN_RATING, MAX_RATING), clamp(maxRating + 0.6, MIN_RATING, MAX_RATING)]
  }

  const padding = Math.max((maxRating - minRating) * 0.15, 0.18)
  return [clamp(minRating - padding, MIN_RATING, MAX_RATING), clamp(maxRating + padding, MIN_RATING, MAX_RATING)]
}

function projectRegression(regression, x) {
  return regression.slope * x + regression.intercept
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
