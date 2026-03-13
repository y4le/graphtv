import { format, line } from 'd3'

const formatRating = format('.1f')

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

  const ticks = axis.selectAll('.range-tick').data(tickValues, (tick) => String(tick)).join((enter) => {
    const group = enter.append('g').attr('class', 'range-tick')
    group.append('text')
    return group
  })

  ticks
    .select('text')
    .attr('x', dimensions.width - 8)
    .attr('y', (tick) => scales.yScale(tick))
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
        },
        {
          key: 'horizontal',
          x1: 0,
          x2: dimensions.width,
          y1: scales.yScale(point.rating),
          y2: scales.yScale(point.rating)
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

export function renderPoints(svg, points, scales, theme, interactions) {
  const pointLayer = svg.selectAll('.point-layer').data([null]).join('g').attr('class', 'point-layer')
  const plottedPoints = points.filter((point) => typeof point.rating === 'number')

  pointLayer
    .selectAll('.episode-point')
    .data(plottedPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', (point) => (point.id === interactions.activePointId ? 4.5 : 3))
    .attr('fill', (point) =>
      point.id === interactions.activePointId
        ? theme.spotColor
        : theme.seasonColor(point.seasonIndex, interactions.totalSeasons)
    )
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (point) => buildPointAriaLabel(point))
    .on('mouseenter', (_, point) => interactions.onHover(point))
    .on('mouseleave', () => interactions.onLeave())
    .on('focus', (_, point) => interactions.onFocus(point))
    .on('blur', () => interactions.onBlur())
    .on('click', (_, point) => interactions.onSelect(point))
    .on('keydown', function (event, point) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        interactions.onNavigate(point, 1)
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        interactions.onNavigate(point, -1)
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        interactions.onEscape()
        this.blur()
      }
    })

  if (interactions.focusPointId) {
    const activeNode = pointLayer.selectAll('.episode-point').filter((point) => point.id === interactions.focusPointId)

    if (!activeNode.empty() && document.activeElement !== activeNode.node()) {
      activeNode.node().focus({ preventScroll: true })
    }
  }
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

function buildPointAriaLabel(point) {
  const seasonEpisode = `Season ${point.season}, episode ${point.episode}`
  const rating = typeof point.rating === 'number' ? `rated ${formatRating(point.rating)}` : 'unrated'
  return `${seasonEpisode}, ${point.title}, ${rating}`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
