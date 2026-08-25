import { format, line, pointer as d3Pointer } from 'd3'

import { isUsableProviderRating, isUsableRating } from '../data/stats.js'
import {
  INDIVIDUAL_POINT_MARK_LIMIT,
  scaleLineWidthForDensity,
  scalePointRadiusForDensity,
  scaleSelectedLineWidth,
  scaleSelectedPointRadius
} from './pointSize.js'
import { createCirclePath, createLineSegmentsPath } from './svgPath.js'

const formatRating = format('.1f')
const Y_LABEL_INSET = 8
const MIN_SOURCE_SPREAD_PIXELS = 3
const SOURCE_SPREAD_OPACITY = 0.16
const ACTIVE_SOURCE_SPREAD_OPACITY = 0.72
const CLIPPED_SPREAD_NUB_WIDTH = 4
const SOURCE_SPREAD_WHISKER_WIDTH = 7
const SOURCE_RATING_OPACITY = 0.68
const FALLBACK_POINT_FILL_OPACITY = 0.2
const COMPARISON_CONTEXT_OPACITY = 0.38
const DEFAULT_POINT_RADIUS = 3
const SEASON_AXIS_FONT_SIZE = 12
const SEASON_AXIS_FULL_LABEL_PADDING = 12
const SEASON_AXIS_LEFT_EXTENSION = 15
const SEASON_AXIS_TICK_SIZE = 5

export function renderRangeFrame(svg, scales, dimensions, theme) {
  const [minRating, maxRating] = scales.yDomain
  const axis = svg
    .selectAll('.range-frame')
    .data([null])
    .join('g')
    .attr('class', 'range-frame')
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
    .attr('y', (tick) =>
      clamp(
        scales.yScale(tick),
        Y_LABEL_INSET,
        dimensions.height - Y_LABEL_INSET
      )
    )
    .attr('fill', theme.textSecondary)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-family', 'var(--font-sans)')
    .attr('font-size', 12)
    .text((tick) => formatRating(tick))
}

export function renderSeasonAxis(
  svg,
  spans,
  viewport,
  scales,
  dimensions,
  theme,
  interactions = {}
) {
  const focusedLabel = svg.node()?.ownerDocument.activeElement
  const focusedSeasonNumber = focusedLabel?.matches?.('.season-axis-label')
    ? focusedLabel.__data__?.seasonNumber
    : null
  const layer = svg
    .selectAll('.season-axis-layer')
    .data([null])
    .join('g')
    .attr('class', 'season-axis-layer')
    .raise()
  const visibleSpans = createVisibleSeasonAxisSpans(spans, viewport, scales)
  const boundaries = createVisibleSeasonBoundaries(spans, viewport)
  const activeSpan = visibleSpans.find(
    (span) => span.seasonNumber === interactions.activeSeasonNumber
  )
  const activeBoundaries = new Set(
    getSeasonAxisSpanBoundaries(spans, interactions.activeSeasonNumber)
  )
  const [, axisEndX] = scales.xScale.range()
  const axisY = dimensions.height - 0.5
  const comparisonRange = interactions.comparisonRange
  const visibleComparisonRange =
    comparisonRange &&
    comparisonRange.end >= viewport.start &&
    comparisonRange.start <= viewport.end
      ? {
          startX: scales.xScale(
            Math.max(comparisonRange.start, viewport.start)
          ),
          endX: scales.xScale(Math.min(comparisonRange.end, viewport.end))
        }
      : null

  if (
    focusedSeasonNumber != null &&
    !visibleSpans.some(
      (span) =>
        span.seasonNumber === focusedSeasonNumber &&
        isSelectableSeasonAxisLabel(span, interactions)
    )
  ) {
    svg.node().focus({ preventScroll: true })
  }

  layer
    .selectAll('.season-axis-line')
    .data(spans.length > 0 ? [null] : [])
    .join('line')
    .attr('class', 'season-axis-line')
    .attr('x1', -SEASON_AXIS_LEFT_EXTENSION)
    .attr('x2', axisEndX)
    .attr('y1', axisY)
    .attr('y2', axisY)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', 0.45)
    .attr('stroke-width', 1)
    .attr('aria-hidden', 'true')
    .attr('pointer-events', 'none')

  layer
    .selectAll('.season-axis-comparison')
    .data(visibleComparisonRange ? [visibleComparisonRange] : [])
    .join('line')
    .attr('class', 'season-axis-comparison')
    .attr('x1', (range) => range.startX)
    .attr('x2', (range) => range.endX)
    .attr('y1', axisY)
    .attr('y2', axisY)
    .attr('stroke', theme.spotColor)
    .attr('stroke-opacity', 1)
    .attr('stroke-width', 3)
    .attr('stroke-linecap', 'round')
    .attr('aria-hidden', 'true')
    .attr('pointer-events', 'none')

  layer
    .selectAll('.season-axis-selection')
    .data(activeSpan ? [activeSpan] : [], (span) => span.seasonNumber)
    .join('line')
    .attr('class', 'season-axis-selection')
    .attr('x1', (span) => span.startX)
    .attr('x2', (span) => span.endX)
    .attr('y1', axisY)
    .attr('y2', axisY)
    .attr('stroke', theme.spotColor)
    .attr('stroke-opacity', 1)
    .attr('stroke-width', 2)
    .attr('aria-hidden', 'true')
    .attr('pointer-events', 'none')

  layer
    .selectAll('.season-axis-tick')
    .data(boundaries, (boundary) => String(boundary))
    .join('line')
    .attr('class', (boundary) =>
      activeBoundaries.has(boundary)
        ? 'season-axis-tick is-active'
        : 'season-axis-tick'
    )
    .attr('x1', (boundary) => scales.xScale(boundary))
    .attr('x2', (boundary) => scales.xScale(boundary))
    .attr('y1', axisY)
    .attr('y2', axisY - SEASON_AXIS_TICK_SIZE)
    .attr('stroke', (boundary) =>
      activeBoundaries.has(boundary) ? theme.spotColor : theme.textSecondary
    )
    .attr('stroke-opacity', (boundary) =>
      activeBoundaries.has(boundary) ? 1 : 0.7
    )
    .attr('stroke-width', (boundary) =>
      activeBoundaries.has(boundary) ? 2 : 1
    )
    .attr('aria-hidden', 'true')
    .attr('pointer-events', 'none')

  const labels = layer
    .selectAll('.season-axis-label')
    .data(visibleSpans, (span) => span.seasonNumber)
    .join('text')
    .attr('class', (span) =>
      span.seasonNumber === interactions.activeSeasonNumber
        ? 'season-axis-label is-active'
        : 'season-axis-label'
    )
    .attr('x', (span) => span.centerX)
    .attr('y', dimensions.height - SEASON_AXIS_TICK_SIZE - 4)
    .attr('fill', (span) =>
      span.seasonNumber === interactions.activeSeasonNumber
        ? theme.spotColor
        : theme.textSecondary
    )
    .attr('text-anchor', 'middle')
    .attr('font-family', 'var(--font-sans)')
    .attr('font-size', SEASON_AXIS_FONT_SIZE)
    .attr('role', (span) =>
      isSelectableSeasonAxisLabel(span, interactions) ? 'button' : null
    )
    .attr('tabindex', (span) =>
      isSelectableSeasonAxisLabel(span, interactions) ? 0 : null
    )
    .attr('aria-hidden', (span) =>
      isSelectableSeasonAxisLabel(span, interactions) ? null : 'true'
    )
    .attr('aria-label', (span) =>
      isSelectableSeasonAxisLabel(span, interactions)
        ? getSeasonAxisLabelAriaLabel(span, interactions)
        : null
    )
    .attr('aria-pressed', (span) =>
      isSelectableSeasonAxisLabel(span, interactions)
        ? String(span.seasonNumber === interactions.selectedSeasonNumber)
        : null
    )
    .attr('data-keyboard-chart', (span) =>
      isSelectableSeasonAxisLabel(span, interactions) ? 'true' : null
    )
    .attr('pointer-events', (span) =>
      isSelectableSeasonAxisLabel(span, interactions) ? null : 'none'
    )
    .on('pointerenter', (event, span) => {
      if (
        !interactions.hoverEnabled ||
        !isSelectableSeasonAxisLabel(span, interactions)
      ) {
        return
      }
      interactions.onEnter?.(span.seasonNumber)
    })
    .on('pointermove', (event, span) => {
      if (
        !interactions.hoverEnabled ||
        !isSelectableSeasonAxisLabel(span, interactions)
      ) {
        return
      }
      interactions.onHover?.(span.seasonNumber)
    })
    .on('pointerleave', (event, span) => {
      if (
        !interactions.hoverEnabled ||
        !isSelectableSeasonAxisLabel(span, interactions)
      ) {
        return
      }
      interactions.onLeave?.(span.seasonNumber)
    })
    .on('click', (event, span) => {
      if (!isSelectableSeasonAxisLabel(span, interactions)) {
        return
      }
      event.stopPropagation()
      if (interactions.shouldSuppressClick?.()) {
        return
      }
      interactions.onSelect?.(span.seasonNumber)
    })
    .on('keydown', (event, span) => {
      if (
        !isSelectableSeasonAxisLabel(span, interactions) ||
        (event.key !== 'Enter' && event.key !== ' ')
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      interactions.onSelect?.(span.seasonNumber)
    })
    .text((span) => `Season ${span.seasonNumber}`)

  labels.each(function (span) {
    const fullLabel = `Season ${span.seasonNumber}`
    const fullLabelWidth = measureSvgText(this, fullLabel)
    this.textContent =
      fullLabelWidth + SEASON_AXIS_FULL_LABEL_PADDING <= span.availableWidth
        ? fullLabel
        : String(span.seasonNumber)
  })
}

export function renderCompanionSeriesContext(
  svg,
  { trendline = null, seasonSpans = [], viewport, label = null } = {},
  scales,
  dimensions,
  theme
) {
  const layer = svg
    .selectAll('.companion-series-layer')
    .data([null])
    .join('g')
    .attr('class', 'companion-series-layer')
    .attr('aria-hidden', 'true')
    .attr('data-companion-label', label)
    .attr('pointer-events', 'none')
  const generator = line()
    .x((point) => scales.xScale(point.x))
    .y((point) => scales.yScale(point.y))

  layer
    .selectAll('.companion-series-trace')
    .data(trendline ? [trendline] : [])
    .join('path')
    .attr('class', 'companion-series-trace')
    .attr('fill', 'none')
    .attr('stroke', theme.textSecondary)
    .attr('stroke-width', 1.4)
    .attr('stroke-dasharray', '2 5')
    .attr('stroke-linecap', 'round')
    .attr('stroke-opacity', 0.68)
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('d', (value) => generator(value.points))

  const boundaries = viewport
    ? createVisibleSeasonBoundaries(seasonSpans, viewport)
    : []
  const axisY = dimensions.height - 0.5

  layer
    .selectAll('.companion-season-tick')
    .data(boundaries, (boundary) => String(boundary))
    .join('line')
    .attr('class', 'companion-season-tick')
    .attr('x1', (boundary) => scales.xScale(boundary))
    .attr('x2', (boundary) => scales.xScale(boundary))
    .attr('y1', axisY)
    .attr('y2', axisY + 5)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.68)
    .attr('vector-effect', 'non-scaling-stroke')
}

function isSelectableSeasonAxisLabel(span, interactions) {
  return interactions.isSelectable?.(span.seasonNumber) ?? false
}

function getSeasonAxisLabelAriaLabel(span, interactions) {
  return span.seasonNumber === interactions.selectedSeasonNumber
    ? `Season ${span.seasonNumber} trendline selected`
    : `Select Season ${span.seasonNumber} trendline`
}

function createVisibleSeasonAxisSpans(spans, viewport, scales) {
  if (
    spans.length === 1 &&
    spans[0].start === spans[0].end &&
    viewport.start === viewport.end
  ) {
    const [rangeStart, rangeEnd] = scales.xScale.range()
    return [
      {
        ...spans[0],
        visibleStart: viewport.start,
        visibleEnd: viewport.end,
        startX: rangeStart,
        endX: rangeEnd,
        centerX: (rangeStart + rangeEnd) / 2,
        availableWidth: Math.abs(rangeEnd - rangeStart)
      }
    ]
  }

  return spans
    .map((span, index) => {
      const startBoundary = index === 0 ? span.start : span.start - 0.5
      const endBoundary = index === spans.length - 1 ? span.end : span.end + 0.5
      const visibleStart = Math.max(startBoundary, viewport.start)
      const visibleEnd = Math.min(endBoundary, viewport.end)
      const startX = scales.xScale(visibleStart)
      const endX = scales.xScale(visibleEnd)

      return {
        ...span,
        visibleStart,
        visibleEnd,
        startX,
        endX,
        centerX: (startX + endX) / 2,
        availableWidth: Math.abs(endX - startX)
      }
    })
    .filter((span) => span.visibleEnd > span.visibleStart)
}

function createVisibleSeasonBoundaries(spans, viewport) {
  if (spans.length === 0) {
    return []
  }

  return Array.from(
    new Set([
      spans[0].start,
      ...spans.slice(1).map((span) => span.start - 0.5),
      spans.at(-1).end
    ])
  ).filter((boundary) => boundary >= viewport.start && boundary <= viewport.end)
}

function getSeasonAxisSpanBoundaries(spans, seasonNumber) {
  const index = spans.findIndex((span) => span.seasonNumber === seasonNumber)
  if (index === -1) {
    return []
  }

  const span = spans[index]
  return [
    index === 0 ? span.start : span.start - 0.5,
    index === spans.length - 1 ? span.end : span.end + 0.5
  ]
}

function measureSvgText(node, text) {
  try {
    if (typeof node.getComputedTextLength === 'function') {
      const measuredWidth = node.getComputedTextLength()
      if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
        return measuredWidth
      }
    }
  } catch {
    // Fall back to the monospaced estimate when SVG measurement is unavailable.
  }

  return text.length * SEASON_AXIS_FONT_SIZE * 0.62
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
  const comparisonRange = interactions.comparisonRange ?? null
  const getTrendlineOpacity = (trendline) =>
    comparisonRange &&
    (trendline.startX < comparisonRange.start ||
      trendline.endX > comparisonRange.end)
      ? COMPARISON_CONTEXT_OPACITY
      : 1
  const lineWidth = (baseWidth) =>
    scaleLineWidthForDensity(baseWidth, scales.xScale, theme.markDensity)

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
    .on('pointerleave', function () {
      hitSurface.style('cursor', 'default')
      interactions.onLeave?.()
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
      trendline.id === activeTrendId
        ? scaleSelectedLineWidth(lineWidth(2.2), theme.markDensity)
        : lineWidth(2.2)
    )
    .attr('stroke-dasharray', '5 5')
    .attr('opacity', getTrendlineOpacity)
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
      trendline.id === activeTrendId
        ? scaleSelectedLineWidth(lineWidth(2.2), theme.markDensity)
        : lineWidth(2.2)
    )
    .attr('opacity', getTrendlineOpacity)
    .attr('pointer-events', 'none')
    .attr('d', (trendline) => generator(trendline.points))
}

export function renderSeriesBreakpoint(
  svg,
  breakpoint,
  scales,
  dimensions,
  theme
) {
  const layer = svg
    .selectAll('.series-breakpoint-layer')
    .data([null])
    .join('g')
    .attr('class', 'series-breakpoint-layer')
    .attr('aria-hidden', 'true')
    .raise()
  const generator = line()
    .x((point) => scales.xScale(point.x))
    .y((point) => scales.yScale(point.y))

  layer
    .selectAll('.series-breakpoint-trend')
    .data(breakpoint?.segments ?? [], (segment) => segment.id)
    .join('path')
    .attr('class', 'series-breakpoint-trend')
    .attr('fill', 'none')
    .attr('stroke', theme.spotColor)
    .attr('stroke-width', 2.5)
    .attr('stroke-linecap', 'round')
    .attr('d', (segment) => generator(segment.points))

  layer
    .selectAll('.series-breakpoint-marker')
    .data(breakpoint?.markerVisible ? [breakpoint] : [])
    .join('line')
    .attr('class', 'series-breakpoint-marker')
    .attr('x1', (value) => scales.xScale(value.breakpointX))
    .attr('x2', (value) => scales.xScale(value.breakpointX))
    .attr('y1', 0)
    .attr('y2', dimensions.height)
    .attr('stroke', theme.spotColor)
    .attr('stroke-width', 1.5)
    .attr('stroke-dasharray', '3 4')
    .attr('opacity', 0.75)
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
              segment.regression.slope * dataX + segment.regression.intercept
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

export function renderCrosshair(
  svg,
  pointOrPoints,
  scales,
  dimensions,
  theme,
  showSourceSpread = false,
  pointerX = null
) {
  const crosshairLayer = svg
    .selectAll('.crosshair-layer')
    .data([null])
    .join('g')
    .attr('class', 'crosshair-layer')
  const followsPointer = Number.isFinite(pointerX)
  const points = Array.isArray(pointOrPoints)
    ? pointOrPoints.filter(Boolean)
    : pointOrPoints
      ? [pointOrPoints]
      : []
  const targets = followsPointer
    ? [{ key: 'pointer', x: scales.xScale(pointerX), spread: null }]
    : points.map((point, index) => ({
        key: point.id ?? String(index),
        x: scales.xScale(point.x),
        spread: showSourceSpread ? createSourceSpreadMark(point, scales) : null
      }))

  const lines = targets.flatMap((target) =>
    target.spread
      ? [
          {
            key: `${target.key}:vertical-before`,
            x1: target.x,
            x2: target.x,
            y1: 0,
            y2: Math.min(target.spread.y1, target.spread.y2)
          },
          {
            key: `${target.key}:vertical-after`,
            x1: target.x,
            x2: target.x,
            y1: Math.max(target.spread.y1, target.spread.y2),
            y2: dimensions.height
          }
        ].filter((lineData) => lineData.y2 > lineData.y1)
      : [
          {
            key: `${target.key}:vertical`,
            x1: target.x,
            x2: target.x,
            y1: 0,
            y2: dimensions.height
          }
        ]
  )

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
  { visible = true, activePointId = null, activePointIds = [] } = {}
) {
  const [domainMin, domainMax] = scales.yDomain
  const activeIds = new Set(
    [activePointId, ...activePointIds].filter((pointId) => pointId != null)
  )
  const isActiveSpread = (spread) => activeIds.has(spread.id)
  const spreads = visible
    ? points
        .map((point) => createSourceSpreadMark(point, scales))
        .filter(Boolean)
    : []
  const shouldBatchSpreads = spreads.length > INDIVIDUAL_POINT_MARK_LIMIT
  const individualSpreads = shouldBatchSpreads
    ? spreads.filter(isActiveSpread)
    : spreads

  const spreadLayer = svg
    .selectAll('.source-spread-layer')
    .data([null])
    .join('g')
    .attr('class', 'source-spread-layer')
    .attr('pointer-events', 'none')

  spreadLayer
    .selectAll('.source-spread')
    .data(individualSpreads, (spread) => spread.id)
    .join('line')
    .attr('class', (spread) =>
      isActiveSpread(spread) ? 'source-spread is-active' : 'source-spread'
    )
    .attr('x1', (spread) => spread.x)
    .attr('x2', (spread) => spread.x)
    .attr('y1', (spread) => spread.y1)
    .attr('y2', (spread) => spread.y2)
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', (spread) =>
      isActiveSpread(spread)
        ? ACTIVE_SOURCE_SPREAD_OPACITY
        : SOURCE_SPREAD_OPACITY
    )
    .attr('stroke-width', (spread) => (isActiveSpread(spread) ? 1.5 : 1.25))
    .attr('stroke-linecap', 'round')

  spreadLayer
    .selectAll('.source-spread-batch')
    .data(
      shouldBatchSpreads
        ? [
            {
              id: 'inactive',
              spreads: spreads.filter((spread) => !isActiveSpread(spread))
            }
          ].filter((batch) => batch.spreads.length > 0)
        : [],
      (batch) => batch.id
    )
    .join('path')
    .attr('class', 'source-spread-batch')
    .attr('d', (batch) =>
      createLineSegmentsPath(
        batch.spreads,
        (spread) => spread.x,
        (spread) => spread.y1,
        (spread) => spread.x,
        (spread) => spread.y2
      )
    )
    .attr('fill', 'none')
    .attr('stroke', theme.textSecondary)
    .attr('stroke-opacity', SOURCE_SPREAD_OPACITY)
    .attr('stroke-width', 1.25)
    .attr('stroke-linecap', 'round')

  const activeWhiskers = spreads.filter(isActiveSpread).flatMap((spread) => [
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
    ...(spread.clippedMin
      ? [{ id: `${spread.id}:min`, x: spread.x, y: dimensions.height }]
      : []),
    ...(spread.clippedMax
      ? [{ id: `${spread.id}:max`, x: spread.x, y: 0 }]
      : [])
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

  const secondaryRatings = spreads.filter(isActiveSpread).flatMap((spread) =>
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
  const pointColor = (point) =>
    theme.seasonColor(point.seasonIndex, interactions.totalSeasons)
  const pointRadius = scalePointRadiusForDensity(
    DEFAULT_POINT_RADIUS,
    scales.xScale,
    theme.markDensity
  )
  const hitRadius = getPointHitRadius(pointRadius, scales.xScale)
  const shouldBatchPoints = plottedPoints.length > INDIVIDUAL_POINT_MARK_LIMIT
  const individualPoints = shouldBatchPoints ? [] : plottedPoints

  const hitPoints = hitLayer
    .selectAll('.episode-point-hit')
    .data(individualPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point-hit')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', hitRadius)
    .attr('fill', 'transparent')
    .attr('pointer-events', 'all')
    .attr('aria-hidden', 'true')

  const isEmphasized = (point) =>
    point.id === interactions.activePointId ||
    interactions.selectedPointIds?.includes(point.id)
  const getComparisonOpacity = (point) =>
    interactions.comparisonRange &&
    (point.x < interactions.comparisonRange.start ||
      point.x > interactions.comparisonRange.end)
      ? COMPARISON_CONTEXT_OPACITY
      : 1
  const visiblePoints = markLayer
    .selectAll('.episode-point')
    .data(individualPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', (point) =>
      isEmphasized(point)
        ? scaleSelectedPointRadius(pointRadius, theme.markDensity)
        : pointRadius
    )
    .attr('fill', (point) => {
      if (isEmphasized(point)) {
        if (isSecondaryRatingActive(point, interactions)) {
          return theme.textSecondary
        }
        return theme.spotColor
      }
      return pointColor(point)
    })
    .attr('fill-opacity', (point) => {
      const baseOpacity =
        point.isFallbackRating && !isEmphasized(point)
          ? FALLBACK_POINT_FILL_OPACITY
          : 1
      return baseOpacity * getComparisonOpacity(point)
    })
    .attr('stroke', (point) => {
      if (!point.isFallbackRating) {
        return 'none'
      }
      return isSecondaryRatingActive(point, interactions)
        ? theme.textSecondary
        : pointColor(point)
    })
    .attr('stroke-width', (point) => (point.isFallbackRating ? 1.25 : 0))
    .attr('stroke-opacity', getComparisonOpacity)
    .attr('data-rating-source', (point) => point.ratingSource)
    .attr('data-rating-fallback', (point) => String(point.isFallbackRating))

  bindPointInteractions(hitPoints, interactions)
  bindPointInteractions(visiblePoints, interactions)

  const hitBatch = hitLayer
    .selectAll('.episode-point-hit-batch')
    .data(
      shouldBatchPoints ? [{ points: plottedPoints, radius: hitRadius }] : []
    )
    .join('path')
    .attr('class', 'episode-point-hit-batch')
    .attr('d', (batch) =>
      createCirclePath(
        batch.points,
        (point) => scales.xScale(point.x),
        (point) => scales.yScale(point.rating),
        batch.radius
      )
    )
    .attr('fill', 'transparent')
    .attr('pointer-events', 'all')
    .attr('aria-hidden', 'true')

  const markBatches = shouldBatchPoints
    ? createPointMarkBatches(
        plottedPoints,
        pointRadius,
        pointColor,
        theme,
        interactions
      )
    : []

  markLayer
    .selectAll('.episode-point-batch')
    .data(markBatches, (batch) => batch.key)
    .join('path')
    .attr('class', 'episode-point-batch')
    .attr('d', (batch) =>
      createCirclePath(
        batch.points,
        (point) => scales.xScale(point.x),
        (point) => scales.yScale(point.rating),
        batch.radius
      )
    )
    .attr('fill', (batch) => batch.fill)
    .attr('fill-opacity', (batch) => batch.fillOpacity)
    .attr('stroke', (batch) => batch.stroke)
    .attr('stroke-width', (batch) => batch.strokeWidth)
    .attr('stroke-opacity', (batch) => batch.strokeOpacity)
    .attr('data-rating-source', (batch) => batch.ratingSource)
    .attr('data-rating-fallback', (batch) => String(batch.isFallbackRating))
    .attr('pointer-events', 'none')

  bindBatchedPointInteractions(hitBatch, plottedPoints, scales, interactions)
}

function createPointMarkBatches(
  points,
  pointRadius,
  pointColor,
  theme,
  interactions
) {
  const batches = new Map()

  for (const point of points) {
    const isActive =
      point.id === interactions.activePointId ||
      interactions.selectedPointIds?.includes(point.id)
    const isSecondaryActive =
      isActive && isSecondaryRatingActive(point, interactions)
    const comparisonOpacity =
      interactions.comparisonRange &&
      (point.x < interactions.comparisonRange.start ||
        point.x > interactions.comparisonRange.end)
        ? COMPARISON_CONTEXT_OPACITY
        : 1
    const style = {
      radius: isActive
        ? scaleSelectedPointRadius(pointRadius, theme.markDensity)
        : pointRadius,
      fill: isActive
        ? isSecondaryActive
          ? theme.textSecondary
          : theme.spotColor
        : pointColor(point),
      fillOpacity:
        (point.isFallbackRating && !isActive
          ? FALLBACK_POINT_FILL_OPACITY
          : 1) * comparisonOpacity,
      stroke: point.isFallbackRating
        ? isSecondaryActive
          ? theme.textSecondary
          : pointColor(point)
        : 'none',
      strokeWidth: point.isFallbackRating ? 1.25 : 0,
      strokeOpacity: comparisonOpacity,
      ratingSource: point.ratingSource,
      isFallbackRating: point.isFallbackRating
    }
    const key = JSON.stringify(style)
    const batch = batches.get(key) ?? { key, ...style, points: [] }
    batch.points.push(point)
    batches.set(key, batch)
  }

  return Array.from(batches.values())
}

function bindBatchedPointInteractions(hitBatch, points, scales, interactions) {
  function updateHover(event) {
    if (!interactions.hoverEnabled) {
      return
    }

    const point = resolvePointHit(
      d3Pointer(event, this),
      points,
      scales,
      this.__data__.radius
    )
    const pointId = point?.id ?? null
    if (pointId === this.__hoveredPointId) {
      return
    }

    const previousPointId = this.__hoveredPointId ?? null
    this.__hoveredPointId = pointId
    if (point) {
      interactions.onHover(point)
    } else if (previousPointId) {
      interactions.onLeave?.(previousPointId)
    }
  }

  hitBatch
    .on('mousemove', updateHover)
    .on('mouseleave', function () {
      const previousPointId = this.__hoveredPointId ?? null
      this.__hoveredPointId = null
      if (previousPointId) {
        interactions.onLeave?.(previousPointId)
      }
    })
    .on('click', function (event) {
      const point = resolvePointHit(
        d3Pointer(event, this),
        points,
        scales,
        this.__data__.radius
      )
      if (!point) {
        return
      }

      event.stopPropagation()
      if (interactions.shouldSuppressClick?.()) {
        return
      }
      interactions.onSelect(point, event)
    })
}

function resolvePointHit([x, y], points, scales, hitRadius) {
  let nearestPoint = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const point of points) {
    const deltaX = x - scales.xScale(point.x)
    const deltaY = y - scales.yScale(point.rating)
    const distance = deltaX * deltaX + deltaY * deltaY
    if (distance <= hitRadius * hitRadius && distance < nearestDistance) {
      nearestPoint = point
      nearestDistance = distance
    }
  }

  return nearestPoint
}

export function renderProviderRatingPreview(
  svg,
  points,
  providerRatings,
  scales,
  theme
) {
  const layer = svg
    .selectAll('.provider-rating-preview-layer')
    .data([null])
    .join('g')
    .attr('class', 'provider-rating-preview-layer')
    .attr('pointer-events', 'none')
    .raise()
  const pointRadius = scalePointRadiusForDensity(
    DEFAULT_POINT_RADIUS,
    scales.xScale,
    theme.markDensity
  )
  const preview = providerRatings
    .filter(
      ({ point, rating }) =>
        point &&
        rating?.source !== point.ratingSource &&
        isUsableProviderRating(rating)
    )
    .map(({ point, rating }) => ({
      pointId: point.id,
      source: rating.source,
      x: scales.xScale(point.x),
      y: scales.yScale(rating.rating)
    }))

  layer
    .selectAll('.provider-rating-preview')
    .data(preview, (rating) => `${rating.pointId}:${rating.source}`)
    .join('circle')
    .attr('class', 'provider-rating-preview')
    .attr('cx', (rating) => rating.x)
    .attr('cy', (rating) => rating.y)
    .attr('r', scaleSelectedPointRadius(pointRadius, theme.markDensity))
    .attr('fill', theme.spotColor)
    .attr('data-point-id', (rating) => rating.pointId)
    .attr('data-rating-source', (rating) => rating.source)
    .attr('aria-hidden', 'true')
}

function isSecondaryRatingActive(point, interactions) {
  return (
    (point.id === interactions.activePointId ||
      interactions.selectedPointIds?.includes(point.id)) &&
    interactions.activeRatingSource != null &&
    interactions.activeRatingSource !== point.ratingSource
  )
}

function bindPointInteractions(points, interactions) {
  points
    .on(
      'mousemove',
      (_, point) => interactions.hoverEnabled && interactions.onHover(point)
    )
    .on(
      'mouseleave',
      (_, point) =>
        interactions.hoverEnabled && interactions.onLeave?.(point.id)
    )
    .on('click', (event, point) => {
      event.stopPropagation()
      if (interactions.shouldSuppressClick?.()) {
        return
      }
      interactions.onSelect(point, event)
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
      return (
        Math.abs(y - scales.yScale(minRating)) > 20 &&
        Math.abs(y - scales.yScale(maxRating)) > 20
      )
    })

  return [minRating, ...domainTicks, maxRating]
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
