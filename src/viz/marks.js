import { format, line, pointer as d3Pointer } from 'd3'

import { isUsableProviderRating, isUsableRating } from '../data/stats.js'
import { scalePointRadiusForDensity } from './pointSize.js'

const formatRating = format('.1f')
const Y_LABEL_INSET = 8
const MIN_SOURCE_SPREAD_PIXELS = 3
const SOURCE_SPREAD_OPACITY = 0.16
const ACTIVE_SOURCE_SPREAD_OPACITY = 0.72
const CLIPPED_SPREAD_NUB_WIDTH = 4
const SOURCE_SPREAD_WHISKER_WIDTH = 7
const SOURCE_RATING_OPACITY = 0.68
const FALLBACK_POINT_FILL_OPACITY = 0.2
const DEFAULT_POINT_RADIUS = 3
const ACTIVE_POINT_RADIUS_OFFSET = 1.5
const TREND_LABEL_EDGE_BUFFER = 60
const TREND_LABEL_INSET = 6

export function renderRangeFrame(svg, scales, dimensions, theme) {
  const [minRating, maxRating] = scales.yDomain
  const axis = svg.selectAll('.range-frame').data([null]).join('g').attr('class', 'range-frame')
  const tickValues = buildTickValues(scales, minRating, maxRating)

  axis
    .selectAll('.range-line')
    .data([null])
    .join('line')
    .attr('class', 'range-line')
    .attr('x1', dimensions.width - 0.5)
    .attr('x2', dimensions.width - 0.5)
    .attr('y1', scales.yScale(maxRating))
    .attr('y2', scales.yScale(minRating))
    .attr('stroke', theme.textSecondary)
    .attr('stroke-width', 1)

  const ticks = axis
    .selectAll('.range-tick')
    .data(tickValues, (tick) => String(tick))
    .join((enter) => {
      const group = enter.append('g').attr('class', 'range-tick')
      group.append('text')
      return group
    })

  ticks
    .select('text')
    .attr('x', dimensions.width - 8)
    .attr('y', (tick) => clamp(scales.yScale(tick), Y_LABEL_INSET, dimensions.height - Y_LABEL_INSET))
    .attr('fill', theme.textSecondary)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', 'var(--font-sans)')
    .attr('font-size', 12)
    .text((tick) => formatRating(tick))
}

export function renderSeasonLabels(svg, spans, viewport, scales, dimensions, theme) {
  const labels = spans
    .map((span, index) => ({
      ...span,
      y: index % 2 === 0 ? dimensions.height - 10 : 14,
      x: clamp(span.midpoint, viewport.start, viewport.end)
    }))
    .filter((span) => span.end >= viewport.start && span.start <= viewport.end)

  const labelLayer = svg.selectAll('.season-label-layer').data([null]).join('g').attr('class', 'season-label-layer')

  labelLayer
    .selectAll('.season-label')
    .data(labels, (span) => span.seasonNumber)
    .join('text')
    .attr('class', 'season-label')
    .attr('x', (span) => scales.xScale(span.x))
    .attr('y', (span) => span.y)
    .attr('text-anchor', 'middle')
    .attr('fill', theme.textSecondary)
    .attr('font-family', 'var(--font-serif)')
    .attr('font-size', 12)
    .text((span) => `Season ${span.seasonNumber}`)
}

export function renderTrendlines(
  svg,
  trendlines,
  macroTrendline,
  scales,
  dimensions,
  theme,
  interactions = {}
) {
  const trendlineLayer = svg
    .selectAll('.trendline-layer')
    .data([null])
    .join('g')
    .attr('class', 'trendline-layer')
  const generator = line()
    .x((point) => scales.xScale(point.x))
    .y((point) => scales.yScale(point.y))
  const segments = [macroTrendline, ...trendlines].filter(Boolean)
  const activeTrendId = interactions.activeTrendId ?? null

  const hitSurface = trendlineLayer
    .selectAll('.chart-hit-surface')
    .data([null])
    .join('rect')
    .attr('class', 'chart-hit-surface')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', dimensions.width)
    .attr('height', dimensions.height)
    .attr('fill', 'transparent')
    .attr('aria-hidden', 'true')
    .style('cursor', 'default')

  hitSurface
    .on('pointermove', function (event) {
      if (!interactions.hoverEnabled) {
        return
      }

      const trendline = resolveTrendHit(
        d3Pointer(event, this),
        segments,
        scales,
        interactions.hitTolerance ?? 7
      )
      hitSurface.style('cursor', trendline ? 'pointer' : 'default')
      interactions.onHover?.(trendline)
    })
    .on('pointerleave', () => {
      hitSurface.style('cursor', 'default')
      interactions.onHover?.(null)
    })
    .on('click', function (event) {
      event.stopPropagation()
      if (interactions.shouldSuppressClick?.()) {
        return
      }

      interactions.onSelect?.(
        resolveTrendHit(
          d3Pointer(event, this),
          segments,
          scales,
          interactions.hitTolerance ?? 7
        )
      )
    })

  trendlineLayer
    .selectAll('.macro-trendline')
    .data(macroTrendline ? [macroTrendline] : [])
    .join('path')
    .attr(
      'class',
      (trendline) =>
        `macro-trendline${trendline.id === activeTrendId ? ' is-active' : ''}`
    )
    .attr('fill', 'none')
    .attr('stroke', (trendline) =>
      trendline.id === activeTrendId ? theme.spotColor : theme.trendMacro
    )
    .attr('stroke-width', (trendline) =>
      trendline.id === activeTrendId ? 2 : 1
    )
    .attr('stroke-dasharray', '5 5')
    .attr('pointer-events', 'none')
    .attr('d', (trendline) => generator(trendline.points))

  trendlineLayer
    .selectAll('.micro-trendline')
    .data(trendlines, (trendline) => trendline.id)
    .join('path')
    .attr(
      'class',
      (trendline) =>
        `micro-trendline${trendline.id === activeTrendId ? ' is-active' : ''}`
    )
    .attr('fill', 'none')
    .attr('stroke', (trendline) =>
      trendline.id === activeTrendId ? theme.spotColor : theme.trendMicro
    )
    .attr('stroke-width', (trendline) =>
      trendline.id === activeTrendId ? 1.75 : 1
    )
    .attr('pointer-events', 'none')
    .attr('d', (trendline) => generator(trendline.points))

  const activeTrendline = segments.find(
    (trendline) => trendline.id === activeTrendId
  )
  const labelData = activeTrendline
    ? [createTrendLabel(activeTrendline, interactions.summary, scales, dimensions)]
    : []

  trendlineLayer
    .selectAll('.trend-label')
    .data(labelData, (label) => label.id)
    .join('text')
    .attr('class', 'trend-label')
    .attr('x', (label) => label.x)
    .attr('y', (label) => label.y)
    .attr('text-anchor', (label) => label.anchor)
    .attr('fill', theme.spotColor)
    .attr('stroke', theme.background)
    .attr('stroke-width', 3)
    .attr('paint-order', 'stroke')
    .attr('font-family', 'var(--font-sans)')
    .attr('font-size', 12)
    .attr('pointer-events', 'none')
    .attr('aria-hidden', 'true')
    .text((label) => label.text)
}

export function resolveTrendHit([x, y], segments, scales, tolerance) {
  const dataX = scales.xScale.invert(x)

  return (
    segments
      .filter(
        (segment) =>
          dataX >= segment.visibleStartX && dataX <= segment.visibleEndX
      )
      .map((segment) => ({
        segment,
        distance: Math.abs(
          y -
            scales.yScale(
              segment.regression.slope * dataX +
                segment.regression.intercept
            )
        )
      }))
      .filter((candidate) => candidate.distance <= tolerance)
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          trendHitRank(left.segment) - trendHitRank(right.segment)
      )[0]?.segment ?? null
  )
}

function trendHitRank(segment) {
  return segment.kind === 'season' ? 0 : 1
}

function createTrendLabel(trendline, summary, scales, dimensions) {
  const [start, end] = trendline.points
  const endX = scales.xScale(end.x)
  const useStart = endX > dimensions.width - TREND_LABEL_EDGE_BUFFER
  const point = useStart ? start : end
  const direction =
    summary?.direction === 'up'
      ? ` ↑ +${Math.abs(summary.delta).toFixed(1)}`
      : summary?.direction === 'down'
        ? ` ↓ −${Math.abs(summary.delta).toFixed(1)}`
        : ''

  return {
    id: trendline.id,
    text: `${summary?.label ?? trendline.id}${direction}`,
    x:
      scales.xScale(point.x) +
      (useStart ? TREND_LABEL_INSET : -TREND_LABEL_INSET),
    y: clamp(scales.yScale(point.y) - 8, 12, dimensions.height - 6),
    anchor: useStart ? 'start' : 'end'
  }
}

export function renderCrosshair(
  svg,
  point,
  scales,
  dimensions,
  theme,
  showSourceSpread = false
) {
  const crosshairLayer = svg.selectAll('.crosshair-layer').data([null]).join('g').attr('class', 'crosshair-layer')
  const spread = showSourceSpread
    ? createSourceSpreadMark(point, scales)
    : null
  const x = point ? scales.xScale(point.x) : 0

  const lines = point
    ? spread
      ? [
          { key: 'vertical-before', x1: x, x2: x, y1: 0, y2: Math.min(spread.y1, spread.y2) },
          {
            key: 'vertical-after',
            x1: x,
            x2: x,
            y1: Math.max(spread.y1, spread.y2),
            y2: dimensions.height
          }
        ].filter((lineData) => lineData.y2 > lineData.y1)
      : [{ key: 'vertical', x1: x, x2: x, y1: 0, y2: dimensions.height }]
    : []

  crosshairLayer
    .selectAll('.crosshair')
    .data(lines, (lineData) => lineData.key)
    .join('line')
    .attr('class', 'crosshair')
    .attr('x1', (lineData) => lineData.x1)
    .attr('x2', (lineData) => lineData.x2)
    .attr('y1', (lineData) => lineData.y1)
    .attr('y2', (lineData) => lineData.y2)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-width', 0.75)
    .attr('stroke-dasharray', '3 4')
}

export function renderSourceSpreads(
  svg,
  points,
  scales,
  dimensions,
  theme,
  { visible = true, activePointId = null } = {}
) {
  const [domainMin, domainMax] = scales.yDomain
  const spreads = visible
    ? points
        .map((point) => createSourceSpreadMark(point, scales))
        .filter(Boolean)
    : []

  const spreadLayer = svg
    .selectAll('.source-spread-layer')
    .data([null])
    .join('g')
    .attr('class', 'source-spread-layer')
    .attr('pointer-events', 'none')

  spreadLayer
    .selectAll('.source-spread')
    .data(spreads, (spread) => spread.id)
    .join('line')
    .attr('class', (spread) =>
      spread.id === activePointId
        ? 'source-spread is-active'
        : 'source-spread'
    )
    .attr('x1', (spread) => spread.x)
    .attr('x2', (spread) => spread.x)
    .attr('y1', (spread) => spread.y1)
    .attr('y2', (spread) => spread.y2)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', (spread) =>
      spread.id === activePointId
        ? ACTIVE_SOURCE_SPREAD_OPACITY
        : SOURCE_SPREAD_OPACITY
    )
    .attr('stroke-width', (spread) =>
      spread.id === activePointId ? 1.5 : 1.25
    )
    .attr('stroke-linecap', 'round')

  const activeWhiskers = spreads
    .filter((spread) => spread.id === activePointId)
    .flatMap((spread) => [
      { id: `${spread.id}:min-whisker`, x: spread.x, y: spread.y1 },
      { id: `${spread.id}:max-whisker`, x: spread.x, y: spread.y2 }
    ])

  spreadLayer
    .selectAll('.source-spread-whisker')
    .data(activeWhiskers, (whisker) => whisker.id)
    .join('line')
    .attr('class', 'source-spread-whisker')
    .attr('x1', (whisker) => whisker.x - SOURCE_SPREAD_WHISKER_WIDTH / 2)
    .attr('x2', (whisker) => whisker.x + SOURCE_SPREAD_WHISKER_WIDTH / 2)
    .attr('y1', (whisker) => whisker.y)
    .attr('y2', (whisker) => whisker.y)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', ACTIVE_SOURCE_SPREAD_OPACITY)
    .attr('stroke-width', 1.25)

  const clippedEnds = spreads.flatMap((spread) => [
    ...(spread.clippedMin ? [{ id: `${spread.id}:min`, x: spread.x, y: dimensions.height }] : []),
    ...(spread.clippedMax ? [{ id: `${spread.id}:max`, x: spread.x, y: 0 }] : [])
  ])

  spreadLayer
    .selectAll('.source-spread-clip')
    .data(clippedEnds, (end) => end.id)
    .join('line')
    .attr('class', 'source-spread-clip')
    .attr('x1', (end) => end.x - CLIPPED_SPREAD_NUB_WIDTH / 2)
    .attr('x2', (end) => end.x + CLIPPED_SPREAD_NUB_WIDTH / 2)
    .attr('y1', (end) => end.y)
    .attr('y2', (end) => end.y)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', SOURCE_SPREAD_OPACITY)
    .attr('stroke-width', 1.25)

  const secondaryRatings = spreads
    .filter((spread) => spread.id === activePointId)
    .flatMap((spread) =>
      (spread.ratings ?? [])
        .filter(
          (rating) =>
            isUsableProviderRating(rating) &&
            rating.source !== spread.ratingSource
        )
        .map((rating) => ({
          id: `${spread.id}:${rating.source}`,
          source: rating.source,
          x: spread.x,
          y: scales.yScale(clamp(rating.rating, domainMin, domainMax))
        }))
    )

  spreadLayer
    .selectAll('.source-rating-point')
    .data(secondaryRatings, (rating) => rating.id)
    .join('circle')
    .attr('class', 'source-rating-point')
    .attr('cx', (rating) => rating.x)
    .attr('cy', (rating) => rating.y)
    .attr('r', 2.25)
    .attr('fill', theme.textSecondary)
    .attr('fill-opacity', SOURCE_RATING_OPACITY)
    .attr('data-rating-source', (rating) => rating.source)
}

function createSourceSpreadMark(point, scales) {
  if (!point?.ratingSpread) {
    return null
  }

  const [domainMin, domainMax] = scales.yDomain
  const min = clamp(point.ratingSpread.min, domainMin, domainMax)
  const max = clamp(point.ratingSpread.max, domainMin, domainMax)
  const spread = {
    ...point.ratingSpread,
    id: point.id,
    ratingSource: point.ratingSource,
    ratings: point.ratings,
    x: scales.xScale(point.x),
    y1: scales.yScale(min),
    y2: scales.yScale(max),
    clippedMin: point.ratingSpread.min < domainMin,
    clippedMax: point.ratingSpread.max > domainMax
  }

  return Math.abs(spread.y2 - spread.y1) >= MIN_SOURCE_SPREAD_PIXELS ||
    spread.clippedMin ||
    spread.clippedMax
    ? spread
    : null
}

export function renderPoints(svg, points, scales, theme, interactions) {
  const pointLayer = svg
    .selectAll('.point-layer')
    .data([null])
    .join('g')
    .attr('class', 'point-layer')
  const hitLayer = pointLayer
    .selectAll('.episode-hit-layer')
    .data([null])
    .join('g')
    .attr('class', 'episode-hit-layer')
  const markLayer = pointLayer
    .selectAll('.episode-mark-layer')
    .data([null])
    .join('g')
    .attr('class', 'episode-mark-layer')
  const plottedPoints = points.filter((point) => isUsableRating(point.rating))
  const pointColor = (point) => theme.seasonColor(point.seasonIndex, interactions.totalSeasons)
  const pointRadius = scalePointRadiusForDensity(
    DEFAULT_POINT_RADIUS,
    plottedPoints.length,
    scales.xScale
  )
  const hitRadius = getPointHitRadius(pointRadius, scales.xScale)

  const hitPoints = hitLayer
    .selectAll('.episode-point-hit')
    .data(plottedPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point-hit')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', hitRadius)
    .attr('fill', 'transparent')
    .attr('pointer-events', 'all')
    .attr('aria-hidden', 'true')

  const visiblePoints = markLayer
    .selectAll('.episode-point')
    .data(plottedPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', (point) =>
      point.id === interactions.activePointId
        ? pointRadius + ACTIVE_POINT_RADIUS_OFFSET
        : pointRadius
    )
    .attr('fill', (point) => {
      if (point.id === interactions.activePointId) {
        return theme.spotColor
      }
      return pointColor(point)
    })
    .attr('fill-opacity', (point) =>
      point.isFallbackRating && point.id !== interactions.activePointId
        ? FALLBACK_POINT_FILL_OPACITY
        : 1
    )
    .attr('stroke', (point) => (point.isFallbackRating ? pointColor(point) : 'none'))
    .attr('stroke-width', (point) => (point.isFallbackRating ? 1.25 : 0))
    .attr('stroke-opacity', 1)
    .attr('data-rating-source', (point) => point.ratingSource)
    .attr('data-rating-fallback', (point) => String(point.isFallbackRating))

  bindPointInteractions(hitPoints, interactions)
  bindPointInteractions(visiblePoints, interactions)
}

function bindPointInteractions(points, interactions) {
  points
    .on('mouseenter', (_, point) => interactions.hoverEnabled && interactions.onHover(point))
    .on('mouseleave', () => interactions.hoverEnabled && interactions.onLeave())
    .on('click', (event, point) => {
      event.stopPropagation()
      if (interactions.shouldSuppressClick?.()) {
        return
      }
      interactions.onSelect(point)
    })
}

function getPointHitRadius(pointRadius, xScale) {
  const spacing = Math.abs(xScale(2) - xScale(1))
  return Math.max(pointRadius, Math.min(12, Math.max(6, spacing / 2 - 0.25)))
}

function buildTickValues(scales, minRating, maxRating) {
  const domainTicks = scales.yScale
    .ticks(5)
    .filter((tick) => tick > minRating && tick < maxRating)
    .filter((tick) => {
      const y = scales.yScale(tick)
      return Math.abs(y - scales.yScale(minRating)) > 20 && Math.abs(y - scales.yScale(maxRating)) > 20
    })

  return [minRating, ...domainTicks, maxRating]
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
