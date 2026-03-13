import { scaleLinear } from 'd3'

import { getAverageRating, linearRegressionFromPoints } from '../data/stats.js'

const MIN_RATING = 0
const MAX_RATING = 10
const X_EDGE_INSET = 6

export function buildChartModel(seasons) {
  const points = []
  const seasonSpans = []
  const seasonTrendlines = []
  let absoluteIndex = 1

  seasons.forEach((season, seasonIndex) => {
    const seasonPoints = []
    const start = absoluteIndex

    season.episodes.forEach((episode) => {
      const rating = getAverageRating(episode.ratings)
      const point = {
        ...episode,
        x: absoluteIndex,
        rating,
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

    const ratedSeasonPoints = seasonPoints.filter((point) => typeof point.rating === 'number')
    const regression = linearRegressionFromPoints(
      ratedSeasonPoints.map((point) => ({
        x: point.x,
        y: point.rating
      }))
    )

    if (regression && ratedSeasonPoints.length > 1) {
      seasonTrendlines.push({
        seasonNumber: season.number,
        seasonIndex,
        startX: ratedSeasonPoints[0].x,
        endX: ratedSeasonPoints[ratedSeasonPoints.length - 1].x,
        regression
      })
    }
  })

  const ratedPoints = points.filter((point) => typeof point.rating === 'number')
  const macroRegression = linearRegressionFromPoints(
    ratedPoints.map((point) => ({
      x: point.x,
      y: point.rating
    }))
  )

  return {
    points,
    ratedPoints,
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
  const episodeCount = clamp(preferredWindow, isMobile ? 12 : 18, isMobile ? 18 : 34)

  return {
    start: 1,
    end: Math.min(model.xMax, episodeCount)
  }
}

export function clampViewport(viewport, model) {
  const width = Math.max(1, Math.round(viewport.end - viewport.start + 1))
  const safeWidth = Math.min(width, model.xMax)
  const maxStart = Math.max(1, model.xMax - safeWidth + 1)
  const start = clamp(Math.round(viewport.start), 1, maxStart)
  const end = Math.min(model.xMax, start + safeWidth - 1)

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
  if (!model.macroRegression || model.ratedPoints.length <= 1) {
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

export function createSparklineScales(model, dimensions) {
  return {
    xScale: scaleLinear().domain([1, model.xMax]).range(resolveXRange(dimensions.width)),
    yScale: scaleLinear()
      .domain(resolveRatingDomain(model.ratedPoints))
      .range([dimensions.height, 0])
  }
}

export function createMainScales(model, viewport, dimensions) {
  const visibleRatedPoints = getVisibleRatedPoints(model, viewport)
  const domain = resolveRatingDomain(visibleRatedPoints.length ? visibleRatedPoints : model.ratedPoints)

  return {
    xScale: scaleLinear()
      .domain([viewport.start, viewport.end])
      .range(resolveXRange(dimensions.width)),
    yScale: scaleLinear().domain(domain).range([dimensions.height, 0]),
    yDomain: domain
  }
}

export function createFullSeriesScales(model, dimensions) {
  const domain = resolveRatingDomain(model.ratedPoints)

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

function resolveRatingDomain(points) {
  const ratings = points.map((point) => point.rating).filter((rating) => typeof rating === 'number')

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
