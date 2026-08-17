import { brushX, line, select } from 'd3'

import { createSparklineScales, viewportToBrushSelection } from './scales.js'
import {
  INDIVIDUAL_POINT_MARK_LIMIT,
  scaleLineWidthForDensity,
  scalePointRadiusForDensity
} from './pointSize.js'
import { createCirclePath } from './svgPath.js'

const DOUBLE_TAP_DELAY = 320
const TAP_MOVE_TOLERANCE = 10
const INACTIVE_INK_OPACITY = 0.3
const ACTIVE_POINT_RADIUS = 1.7
const INACTIVE_POINT_RADIUS = 1.2

let sparklineInstances = 0

export function createSparkline(svgNode, config) {
  const svg = select(svgNode)
  const clipId = `sparkline-window-${++sparklineInstances}`
  const windowClipRect = svg
    .append('defs')
    .append('clipPath')
    .attr('id', clipId)
    .append('rect')
  const brushLayer = svg.append('g').attr('class', 'viewport-brush')
  const marks = svg
    .append('g')
    .attr('class', 'sparkline-marks')
    .attr('pointer-events', 'none')

  let suppressBrushEvents = false
  let lastTapAt = 0
  const activePointers = new Map()
  const pointerGestureMeta = new Map()
  let hadMultiTouch = false

  const brush = brushX()
    .handleSize(8)
    .filter((event) => !isTouchBrushEvent(event))
    .on('start', (event) => {
      // D3 uses handle mode for both edge drags and drawing a new selection.
      if (event.mode === 'handle') {
        brushLayer.classed('is-brushing', true)
      }
    })
    .on('brush end', (event) => {
      if (event.type === 'end') {
        brushLayer.classed('is-brushing', false)
      }

      if (suppressBrushEvents || !config.dimensions.width) {
        return
      }

      // A click outside the window starts, then clears, a new selection.
      // The viewport did not change, so put the handles back where they were.
      if (!event.selection) {
        if (event.type === 'end') {
          suppressBrushEvents = true
          brushLayer.call(
            brush.move,
            viewportToBrushSelection(config.viewport, config.scales.xScale)
          )
          suppressBrushEvents = false
        }
        return
      }

      const [start, end] = event.selection.map(config.scales.xScale.invert)
      config.onViewportChange(
        { start, end },
        event.type === 'end' ? 'brush-end' : 'brush'
      )
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

    svg.attr(
      'viewBox',
      `0 0 ${config.dimensions.width} ${config.dimensions.height}`
    )
    const [windowX1, windowX2] = viewportToBrushSelection(
      config.viewport,
      config.scales.xScale
    )
    const isInWindow = (point) =>
      point.x >= config.viewport.start && point.x <= config.viewport.end
    const pathData =
      config.model.ratedPoints.length > 1
        ? generator(config.model.ratedPoints)
        : null
    const activePointRadius = scalePointRadiusForDensity(
      ACTIVE_POINT_RADIUS,
      config.model.ratedPoints.length,
      config.scales.xScale,
      config.theme.markDensity
    )
    const inactivePointRadius = scalePointRadiusForDensity(
      INACTIVE_POINT_RADIUS,
      config.model.ratedPoints.length,
      config.scales.xScale,
      config.theme.markDensity
    )
    const inactiveLineWidth = scaleLineWidthForDensity(
      1.65,
      config.model.ratedPoints.length,
      config.scales.xScale,
      config.theme.markDensity
    )
    const activeLineWidth = scaleLineWidthForDensity(
      2.475,
      config.model.ratedPoints.length,
      config.scales.xScale,
      config.theme.markDensity
    )

    windowClipRect
      .attr('x', windowX1)
      .attr('y', -2)
      .attr('width', Math.max(0, windowX2 - windowX1))
      .attr('height', config.dimensions.height + 4)

    marks
      .selectAll('.sparkline-path')
      .data(pathData ? [pathData] : [])
      .join('path')
      .attr('class', 'sparkline-path')
      .attr('fill', 'none')
      .attr('stroke', config.theme.text)
      .attr('stroke-opacity', INACTIVE_INK_OPACITY)
      .attr('stroke-width', inactiveLineWidth)
      .attr('stroke-linejoin', 'round')
      .attr('d', (path) => path)

    marks
      .selectAll('.sparkline-path-active')
      .data(pathData ? [pathData] : [])
      .join('path')
      .attr('class', 'sparkline-path-active')
      .attr('fill', 'none')
      .attr('stroke', config.theme.text)
      .attr('stroke-opacity', 1)
      .attr('stroke-width', activeLineWidth)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('clip-path', `url(#${clipId})`)
      .attr('d', (path) => path)

    const shouldBatchPoints =
      config.model.ratedPoints.length > INDIVIDUAL_POINT_MARK_LIMIT
    const individualPoints = shouldBatchPoints ? [] : config.model.ratedPoints

    marks
      .selectAll('.sparkline-point')
      .data(individualPoints, (point) => point.id)
      .join('circle')
      .attr('class', 'sparkline-point')
      .attr('cx', (point) => config.scales.xScale(point.x))
      .attr('cy', (point) => config.scales.yScale(point.rating))
      .attr('r', (point) =>
        isInWindow(point) ? activePointRadius : inactivePointRadius
      )
      .attr('fill', config.theme.text)
      .attr('opacity', (point) =>
        isInWindow(point) ? 1 : INACTIVE_INK_OPACITY
      )

    const pointBatches = shouldBatchPoints
      ? [
          {
            id: 'inactive',
            points: config.model.ratedPoints.filter(
              (point) => !isInWindow(point)
            ),
            radius: inactivePointRadius,
            opacity: INACTIVE_INK_OPACITY
          },
          {
            id: 'active',
            points: config.model.ratedPoints.filter(isInWindow),
            radius: activePointRadius,
            opacity: 1
          }
        ].filter((batch) => batch.points.length > 0)
      : []

    marks
      .selectAll('.sparkline-point-batch')
      .data(pointBatches, (batch) => batch.id)
      .join('path')
      .attr('class', (batch) => `sparkline-point-batch is-${batch.id}`)
      .attr('fill', config.theme.text)
      .attr('opacity', (batch) => batch.opacity)
      .attr('d', (batch) =>
        createCirclePath(
          batch.points,
          (point) => config.scales.xScale(point.x),
          (point) => config.scales.yScale(point.rating),
          batch.radius
        )
      )

    brushLayer.style('display', null)
    brush.extent([
      [0, 0],
      [config.dimensions.width, config.dimensions.height]
    ])
    brushLayer.call(brush)

    suppressBrushEvents = true
    brushLayer.call(brush.move, [windowX1, windowX2])
    suppressBrushEvents = false
  }

  render({
    ...config,
    scales:
      config.scales ?? createSparklineScales(config.model, config.dimensions)
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
    if (config.dimensions.width) {
      event.preventDefault()
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType !== 'touch' || !config.dimensions.width) {
      return
    }

    event.preventDefault()
    svgNode.setPointerCapture?.(event.pointerId)
    activePointers.set(event.pointerId, clampX(getLocalX(event)))
    pointerGestureMeta.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY
    })

    if (activePointers.size === 1) {
      centerViewportAt(activePointers.get(event.pointerId))
    } else {
      hadMultiTouch = true
      applyMultiTouchBounds()
    }
  }

  function handlePointerMove(event) {
    if (event.pointerType !== 'touch' || !activePointers.has(event.pointerId)) {
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
    if (event.pointerType !== 'touch') {
      return
    }

    const pointerMeta = pointerGestureMeta.get(event.pointerId)
    const wasTracked = activePointers.has(event.pointerId)

    activePointers.delete(event.pointerId)
    pointerGestureMeta.delete(event.pointerId)
    if (svgNode.hasPointerCapture?.(event.pointerId)) {
      svgNode.releasePointerCapture(event.pointerId)
    }

    if (activePointers.size >= 2) {
      applyMultiTouchBounds()
      return
    }

    if (activePointers.size === 1) {
      const [, remainingX] = activePointers.entries().next().value
      centerViewportAt(remainingX)
      return
    }

    if (
      wasTracked &&
      !hadMultiTouch &&
      pointerMeta &&
      isTapLike(pointerMeta, event)
    ) {
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
    const xs = Array.from(activePointers.values()).sort(
      (left, right) => left - right
    )
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
    const renderedWidth = rect.width || config.dimensions.width
    return (
      ((event.clientX - rect.left) / renderedWidth) * config.dimensions.width
    )
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
