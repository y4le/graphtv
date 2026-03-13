import { brushX, line, select } from 'd3'

import { createSparklineScales, viewportToBrushSelection } from './scales.js'

const DOUBLE_TAP_DELAY = 320
const TAP_MOVE_TOLERANCE = 10

export function createSparkline(svgNode, config) {
  const svg = select(svgNode)
  const brushLayer = svg.append('g').attr('class', 'viewport-brush')
  const viewportIndicator = svg.append('rect').attr('class', 'mobile-viewport-indicator').attr('pointer-events', 'none')
  const touchSurface = svg.append('rect').attr('class', 'sparkline-touch-surface')

  let suppressBrushEvents = false
  let lastTapAt = 0
  const activePointers = new Map()
  const pointerGestureMeta = new Map()
  let hadMultiTouch = false

  const brush = brushX()
    .filter((event) => !config.mobileInteraction && !isTouchBrushEvent(event))
    .on('brush end', (event) => {
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
  svgNode.addEventListener('touchstart', handleTouchStart, { passive: false })
  svgNode.addEventListener('pointerdown', handlePointerDown)
  svgNode.addEventListener('pointermove', handlePointerMove)
  svgNode.addEventListener('pointerup', handlePointerEnd)
  svgNode.addEventListener('pointercancel', handlePointerEnd)

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

    touchSurface
      .attr('width', config.dimensions.width)
      .attr('height', config.dimensions.height)
      .attr('fill', 'transparent')
      .attr('pointer-events', config.mobileInteraction ? 'all' : 'none')

    if (config.mobileInteraction) {
      brushLayer.style('display', 'none')
      const [x1, x2] = viewportToBrushSelection(config.viewport, config.scales.xScale)
      viewportIndicator
        .attr('x', x1)
        .attr('y', 0)
        .attr('width', Math.max(0, x2 - x1))
        .attr('height', config.dimensions.height)
        .attr('fill', config.theme.spotColor)
        .attr('fill-opacity', 0.12)
        .attr('stroke', config.theme.spotColor)
        .attr('stroke-opacity', 0.34)
        .attr('stroke-width', 1)
        .style('display', null)
      return
    }

    viewportIndicator.style('display', 'none')
    brushLayer.style('display', null)
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
      svgNode.removeEventListener('touchstart', handleTouchStart)
      svgNode.removeEventListener('pointerdown', handlePointerDown)
      svgNode.removeEventListener('pointermove', handlePointerMove)
      svgNode.removeEventListener('pointerup', handlePointerEnd)
      svgNode.removeEventListener('pointercancel', handlePointerEnd)
      svg.selectAll('*').remove()
    }
  }

  function handleTouchStart(event) {
    if (config.mobileInteraction) {
      event.preventDefault()
    }
  }

  function handlePointerDown(event) {
    if (!config.mobileInteraction || event.pointerType !== 'touch' || !config.dimensions.width) {
      return
    }

    event.preventDefault()
    svgNode.setPointerCapture?.(event.pointerId)
    activePointers.set(event.pointerId, clampX(getLocalX(event)))
    pointerGestureMeta.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY
    })

    if (activePointers.size >= 2) {
      hadMultiTouch = true
      applyMultiTouchBounds()
    }
  }

  function handlePointerMove(event) {
    if (!config.mobileInteraction || event.pointerType !== 'touch' || !activePointers.has(event.pointerId)) {
      return
    }

    event.preventDefault()
    activePointers.set(event.pointerId, clampX(getLocalX(event)))

    if (activePointers.size >= 2) {
      hadMultiTouch = true
      applyMultiTouchBounds()
      return
    }

    centerViewportAt(activePointers.get(event.pointerId))
  }

  function handlePointerEnd(event) {
    if (!config.mobileInteraction || event.pointerType !== 'touch') {
      return
    }

    const pointerMeta = pointerGestureMeta.get(event.pointerId)
    const wasTracked = activePointers.has(event.pointerId)

    activePointers.delete(event.pointerId)
    pointerGestureMeta.delete(event.pointerId)
    svgNode.releasePointerCapture?.(event.pointerId)

    if (activePointers.size >= 2) {
      applyMultiTouchBounds()
      return
    }

    if (activePointers.size === 1) {
      const [, remainingX] = activePointers.entries().next().value
      centerViewportAt(remainingX)
      return
    }

    if (wasTracked && !hadMultiTouch && pointerMeta && isTapLike(pointerMeta, event)) {
      const now = Date.now()
      if (now - lastTapAt <= DOUBLE_TAP_DELAY) {
        handleViewportReset(event)
        lastTapAt = 0
      } else {
        lastTapAt = now
      }
    } else if (activePointers.size === 0) {
      lastTapAt = 0
    }

    hadMultiTouch = false
  }

  function applyMultiTouchBounds() {
    const xs = Array.from(activePointers.values()).sort((left, right) => left - right)
    if (xs.length < 2) {
      return
    }

    config.onViewportChange?.(
      {
        start: config.scales.xScale.invert(xs[0]),
        end: config.scales.xScale.invert(xs[xs.length - 1])
      },
      'touch-bounds'
    )
  }

  function handleViewportReset(event) {
    event.preventDefault()
    config.onViewportReset?.()
  }

  function centerViewportAt(localX) {
    const center = config.scales.xScale.invert(clampX(localX))
    const width = config.viewport.end - config.viewport.start
    config.onViewportChange?.(
      {
        start: center - width / 2,
        end: center + width / 2
      },
      'touch-center'
    )
  }

  function getLocalX(event) {
    const rect = svgNode.getBoundingClientRect()
    return event.clientX - rect.left
  }

  function clampX(value) {
    return Math.max(0, Math.min(config.dimensions.width, value))
  }
}

function isTouchBrushEvent(event) {
  return event.type.startsWith('touch') || event.pointerType === 'touch'
}

function isTapLike(pointerMeta, event) {
  return (
    Math.abs(event.clientX - pointerMeta.startX) <= TAP_MOVE_TOLERANCE &&
    Math.abs(event.clientY - pointerMeta.startY) <= TAP_MOVE_TOLERANCE
  )
}
