import { line, select } from 'd3'

export function renderAxes(svg, dimensions, scales, theme) {
  const axisLayer = svg.selectAll('.axis-layer').data([null]).join('g').attr('class', 'axis-layer')

  axisLayer
    .selectAll('.x-axis-line')
    .data([null])
    .join('line')
    .attr('class', 'x-axis-line')
    .attr('x1', dimensions.padding.left)
    .attr('x2', dimensions.width - dimensions.padding.right)
    .attr('y1', dimensions.height - dimensions.padding.bottom)
    .attr('y2', dimensions.height - dimensions.padding.bottom)
    .attr('stroke', theme.axis)

  axisLayer
    .selectAll('.y-axis-line')
    .data([null])
    .join('line')
    .attr('class', 'y-axis-line')
    .attr('x1', dimensions.padding.left)
    .attr('x2', dimensions.padding.left)
    .attr('y1', dimensions.padding.top)
    .attr('y2', dimensions.height - dimensions.padding.bottom)
    .attr('stroke', theme.axis)

  const yTicks = scales.yScale.ticks(5)
  const tickLayer = axisLayer.selectAll('.y-tick').data(yTicks).join('g').attr('class', 'y-tick')

  tickLayer
    .selectAll('line')
    .data((tick) => [tick])
    .join('line')
    .attr('x1', dimensions.padding.left)
    .attr('x2', dimensions.width - dimensions.padding.right)
    .attr('y1', (tick) => scales.yScale(tick))
    .attr('y2', (tick) => scales.yScale(tick))
    .attr('stroke', theme.grid)

  tickLayer
    .selectAll('text')
    .data((tick) => [tick])
    .join('text')
    .attr('x', dimensions.padding.left - 10)
    .attr('y', (tick) => scales.yScale(tick))
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('fill', theme.text)
    .text((tick) => tick.toFixed(1))
}

export function renderSeasonSeparators(svg, spans, scales, dimensions, theme) {
  const separators = spans.slice(0, -1).map((span) => span.end + 0.5)

  svg
    .selectAll('.season-separator')
    .data(separators)
    .join('line')
    .attr('class', 'season-separator')
    .attr('x1', (value) => scales.xScale(value))
    .attr('x2', (value) => scales.xScale(value))
    .attr('y1', dimensions.padding.top)
    .attr('y2', dimensions.height - dimensions.padding.bottom)
    .attr('stroke', theme.grid)
    .attr('stroke-dasharray', '3 6')
}

export function renderTrendlines(svg, trendlines, scales, theme) {
  const generator = line()
    .x((point) => scales.xScale(point.x))
    .y((point) => scales.yScale(point.y))

  svg
    .selectAll('.trendline')
    .data(trendlines)
    .join('path')
    .attr('class', 'trendline')
    .attr('fill', 'none')
    .attr('stroke-width', 2)
    .attr('stroke', (lineData) => theme.seasonPalette[lineData.seasonIndex % theme.seasonPalette.length])
    .attr('opacity', 0.6)
    .attr('d', (lineData) => generator(lineData.points))
}

export function renderPoints(svg, points, scales, theme, onPointEnter, onPointLeave) {
  const plottedPoints = points.filter((point) => typeof point.rating === 'number')
  const radius = Math.max(4, Math.min(11, 15 - plottedPoints.length * 0.08))

  const pointLayer = svg.selectAll('.point-layer').data([null]).join('g').attr('class', 'point-layer')

  pointLayer
    .selectAll('.episode-point')
    .data(plottedPoints, (point) => point.id)
    .join('circle')
    .attr('class', 'episode-point')
    .attr('cx', (point) => scales.xScale(point.x))
    .attr('cy', (point) => scales.yScale(point.rating))
    .attr('r', radius)
    .attr('fill', (point) => theme.seasonPalette[point.seasonIndex % theme.seasonPalette.length])
    .attr('stroke', '#04101d')
    .attr('stroke-width', 2)
    .on('mouseenter', function (event, point) {
      select(this).attr('stroke', '#ffffff').attr('stroke-width', 2.5)
      onPointEnter(event, point)
    })
    .on('mouseleave', function () {
      select(this).attr('stroke', '#04101d').attr('stroke-width', 2)
      onPointLeave()
    })
    .on('click', function (event, point) {
      onPointEnter(event, point)
    })
}
