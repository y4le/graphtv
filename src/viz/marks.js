import { format, line } from 'd3'

import { isUsableRating } from '../data/stats.js'

const formatRating = format('.1f')
const Y_LABEL_INSET = 8
const MIN_SOURCE_SPREAD_PIXELS = 3
const SOURCE_SPREAD_OPACITY = 0.16
const CLIPPED_SPREAD_NUB_WIDTH = 4

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

export function renderTrendlines(svg, trendlines, macroTrendline, scales, theme) {
  const trendlineLayer = svg.selectAll('.trendline-layer').data([null]).join('g').attr('class', 'trendline-layer')
  const generator = line()
    .x((point) => scales.xScale(point.x))
    .y((point) => scales.yScale(point.y))

  trendlineLayer
    .selectAll('.macro-trendline')
    .data(macroTrendline ? [macroTrendline] : [])
    .join('path')
    .attr('class', 'macro-trendline')
    .attr('fill', 'none')
    .attr('stroke', theme.trendMacro)
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '5 5')
    .attr('d', (points) => generator(points))

  trendlineLayer
    .selectAll('.micro-trendline')
    .data(trendlines, (trendline) => `${trendline.seasonNumber}:${trendline.startX}`)
    .join('path')
    .attr('class', 'micro-trendline')
    .attr('fill', 'none')
    .attr('stroke', theme.trendMicro)
    .attr('stroke-width', 1)
    .attr('d', (trendline) => generator(trendline.points))
}

export function renderCrosshair(svg, point, scales, dimensions, theme) {
  const crosshairLayer = svg.selectAll('.crosshair-layer').data([null]).join('g').attr('class', 'crosshair-layer')

  const lines = point
    ? [
        {
          key: 'vertical',
          x1: scales.xScale(point.x),
          x2: scales.xScale(point.x),
          y1: 0,
          y2: dimensions.height
        }
      ]
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

export function renderSourceSpreads(svg, points, scales, dimensions, theme, visible = true) {
  const [domainMin, domainMax] = scales.yDomain
  const spreads = visible
    ? points
        .filter((point) => point.ratingSpread)
        .map((point) => {
          const min = clamp(point.ratingSpread.min, domainMin, domainMax)
          const max = clamp(point.ratingSpread.max, domainMin, domainMax)
          return {
            ...point.ratingSpread,
            id: point.id,
            x: scales.xScale(point.x),
            y1: scales.yScale(min),
            y2: scales.yScale(max),
            clippedMin: point.ratingSpread.min < domainMin,
            clippedMax: point.ratingSpread.max > domainMax
          }
        })
        .filter(
          (spread) =>
            Math.abs(spread.y2 - spread.y1) >= MIN_SOURCE_SPREAD_PIXELS || spread.clippedMin || spread.clippedMax
        )
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
    .attr('class', 'source-spread')
    .attr('x1', (spread) => spread.x)
    .attr('x2', (spread) => spread.x)
    .attr('y1', (spread) => spread.y1)
    .attr('y2', (spread) => spread.y2)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', SOURCE_SPREAD_OPACITY)
    .attr('stroke-width', 1.25)
    .attr('stroke-linecap', 'round')

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
}

export function renderPoints(svg, points, scales, theme, interactions) {
  const pointLayer = svg.selectAll('.point-layer').data([null]).join('g').attr('class', 'point-layer')
  const plottedPoints = points.filter((point) => isUsableRating(point.rating))

  pointLayer
    .selectAll('.episode-point')
    .data(plottedPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', (point) => (point.id === interactions.activePointId ? 4.5 : 3))
    .attr('fill', (point) => {
      if (point.isFallbackRating) {
        return theme.background
      }
      return point.id === interactions.activePointId
        ? theme.spotColor
        : theme.seasonColor(point.seasonIndex, interactions.totalSeasons)
    })
    .attr('stroke', (point) => {
      if (!point.isFallbackRating) {
        return 'none'
      }
      return point.id === interactions.activePointId
        ? theme.spotColor
        : theme.seasonColor(point.seasonIndex, interactions.totalSeasons)
    })
    .attr('stroke-width', (point) => (point.isFallbackRating ? 1.5 : 0))
    .attr('data-rating-source', (point) => point.ratingSource)
    .attr('data-rating-fallback', (point) => String(point.isFallbackRating))
    .on('mouseenter', (_, point) => interactions.hoverEnabled && interactions.onHover(point))
    .on('mouseleave', () => interactions.hoverEnabled && interactions.onLeave())
    .on('click', (event, point) => {
      event.stopPropagation()
      interactions.onSelect(point)
    })
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
