import { brushX, line, select } from 'd3'

import { createSparklineScales, viewportToBrushSelection } from './scales.js'

export function createSparkline(svgNode, config) {
  const svg = select(svgNode)
  const brushLayer = svg.append('g').attr('class', 'viewport-brush')
  let suppressBrushEvents = false
  let lastTouchEndAt = 0

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
  svgNode.addEventListener('dblclick', handleViewportReset)
  svgNode.addEventListener('touchstart', handleTouchGesture, { passive: false })
  svgNode.addEventListener('touchmove', handleTouchGesture, { passive: false })
  svgNode.addEventListener('touchend', handleTouchEnd, { passive: false })

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
      svgNode.removeEventListener('dblclick', handleViewportReset)
      svgNode.removeEventListener('touchstart', handleTouchGesture)
      svgNode.removeEventListener('touchmove', handleTouchGesture)
      svgNode.removeEventListener('touchend', handleTouchEnd)
      svg.selectAll('*').remove()
    }
  }

  function handleTouchGesture(event) {
    if (event.touches.length === 0 || !config.dimensions.width) {
      return
    }

    event.preventDefault()

    if (event.touches.length === 1) {
      const touchX = getTouchX(event.touches[0])
      centerViewportAt(touchX)
      return
    }

    const touchPoints = Array.from(event.touches)
      .slice(0, 2)
      .map((touch) => clampX(getTouchX(touch)))
      .sort((left, right) => left - right)

    setViewportBounds(touchPoints[0], touchPoints[1])
  }

  function handleViewportReset(event) {
    event.preventDefault()
    config.onViewportReset?.()
  }

  function handleTouchEnd(event) {
    if (event.touches.length > 0) {
      return
    }

    const now = Date.now()
    if (now - lastTouchEndAt <= 320) {
      handleViewportReset(event)
      lastTouchEndAt = 0
      return
    }

    lastTouchEndAt = now
  }

  function centerViewportAt(touchX) {
    const center = config.scales.xScale.invert(clampX(touchX))
    const width = config.viewport.end - config.viewport.start
    config.onViewportChange?.(
      {
        start: center - width / 2,
        end: center + width / 2
      },
      'touch-center'
    )
  }

  function setViewportBounds(leftX, rightX) {
    config.onViewportChange?.(
      {
        start: config.scales.xScale.invert(leftX),
        end: config.scales.xScale.invert(rightX)
      },
      'touch-bounds'
    )
  }

  function getTouchX(touch) {
    const rect = svgNode.getBoundingClientRect()
    return touch.clientX - rect.left
  }

  function clampX(value) {
    return Math.max(0, Math.min(config.dimensions.width, value))
  }
}
