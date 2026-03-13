import { brushX, line, select } from 'd3'

import { createSparklineScales, viewportToBrushSelection } from './scales.js'

export function createSparkline(svgNode, config) {
  const svg = select(svgNode)
  const brushLayer = svg.append('g').attr('class', 'viewport-brush')
  let suppressBrushEvents = false

  const brush = brushX().on('brush end', (event) => {
    if (suppressBrushEvents || !event.selection || !config.dimensions.width) {
      return
    }

    const [start, end] = event.selection.map(config.scales.xScale.invert)
    config.onViewportChange({ start, end }, event.type === 'end' ? 'brush-end' : 'brush')
  })

  brush.extent([
    [0, 0],
    [config.dimensions.width, config.dimensions.height]
  ])

  brushLayer.call(brush)

  function render(nextConfig) {
    config = nextConfig
    const generator = line()
      .x((point) => config.scales.xScale(point.x))
      .y((point) => config.scales.yScale(point.rating))

    svg.attr('viewBox', `0 0 ${config.dimensions.width} ${config.dimensions.height}`)

    svg
      .selectAll('.sparkline-path')
      .data(config.model.ratedPoints.length > 1 ? [config.model.ratedPoints] : [])
      .join('path')
      .attr('class', 'sparkline-path')
      .attr('fill', 'none')
      .attr('stroke', config.theme.trendMicro)
      .attr('stroke-width', 1)
      .attr('d', (points) => generator(points))

    svg
      .selectAll('.sparkline-point')
      .data(config.model.ratedPoints, (point) => point.id)
      .join('circle')
      .attr('class', 'sparkline-point')
      .attr('cx', (point) => config.scales.xScale(point.x))
      .attr('cy', (point) => config.scales.yScale(point.rating))
      .attr('r', 1.5)
      .attr('fill', config.theme.text)
      .attr('opacity', (point) =>
        point.x >= config.viewport.start && point.x <= config.viewport.end ? 1 : 0.48
      )

    brush.extent([
      [0, 0],
      [config.dimensions.width, config.dimensions.height]
    ])
    brushLayer.call(brush)

    suppressBrushEvents = true
    brushLayer.call(brush.move, viewportToBrushSelection(config.viewport, config.scales.xScale))
    suppressBrushEvents = false

    brushLayer.selectAll('.overlay').attr('cursor', 'crosshair')
    brushLayer.selectAll('.selection').attr('fill', config.theme.spotColor).attr('fill-opacity', 0.12)
    brushLayer
      .selectAll('.handle')
      .attr('fill', config.theme.spotColor)
      .attr('fill-opacity', 0.34)
  }

  render({
    ...config,
    scales: config.scales ?? createSparklineScales(config.model, config.dimensions)
  })

  return {
    render,
    destroy() {
      svg.selectAll('*').remove()
    }
  }
}
