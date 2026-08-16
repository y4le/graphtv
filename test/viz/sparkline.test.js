import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSparklineScales,
  viewportToBrushSelection
} from '../../src/viz/scales.js'
import { MARK_DENSITY_CONFIG } from '../../src/viz/pointSize.js'
import { createSparkline } from '../../src/viz/sparkline.js'

const DIMENSIONS = { width: 200, height: 40 }
const MODEL = {
  xMax: 8,
  ratedPoints: Array.from({ length: 8 }, (_, index) => ({
    id: `episode-${index + 1}`,
    x: index + 1,
    rating: 6 + (index % 4)
  }))
}
const THEME = {
  text: '#1A1A1A'
}
const ACTIVE_POINT_RADIUS_FOR_TEST = 1.7
const INACTIVE_POINT_RADIUS_FOR_TEST = 1.2

let sparkline

afterEach(() => {
  sparkline?.destroy()
  sparkline = undefined
  document.body.replaceChildren()
})

describe('createSparkline', () => {
  it('clips the stronger series to the same bounds as the viewport', () => {
    const { svg, scales, viewport } = renderSparkline()
    const [windowX1, windowX2] = viewportToBrushSelection(
      viewport,
      scales.xScale
    )
    const clipPath = svg.querySelector('clipPath')
    const clipRect = clipPath.querySelector('rect')
    const activePath = svg.querySelector('.sparkline-path-active')

    expect(Number(clipRect.getAttribute('x'))).toBeCloseTo(windowX1)
    expect(Number(clipRect.getAttribute('width'))).toBeCloseTo(
      windowX2 - windowX1
    )
    expect(activePath.getAttribute('clip-path')).toBe(`url(#${clipPath.id})`)
  })

  it('renders in-window marks more strongly than the surrounding series', () => {
    const { svg } = renderSparkline()
    const basePath = svg.querySelector('.sparkline-path')
    const activePath = svg.querySelector('.sparkline-path-active')
    const points = Array.from(svg.querySelectorAll('.sparkline-point'))
    const inactivePoint = points.find((point) => point.__data__.x === 1)
    const activePoint = points.find((point) => point.__data__.x === 2)

    expect(Number(activePath.getAttribute('stroke-opacity'))).toBeGreaterThan(
      Number(basePath.getAttribute('stroke-opacity'))
    )
    expect(
      Number(activePath.getAttribute('stroke-width'))
    ).toBeGreaterThanOrEqual(Number(basePath.getAttribute('stroke-width')))
    expect(Number(activePoint.getAttribute('r'))).toBeGreaterThan(
      Number(inactivePoint.getAttribute('r'))
    )
    expect(Number(activePoint.getAttribute('opacity'))).toBeGreaterThan(
      Number(inactivePoint.getAttribute('opacity'))
    )
    expect(Number(inactivePoint.getAttribute('opacity'))).toBeLessThanOrEqual(
      0.35
    )
  })

  it('proportionally enlarges sparse points and line widths', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    const model = {
      xMax: 5,
      ratedPoints: MODEL.ratedPoints.slice(0, 5)
    }
    const dimensions = { width: 600, height: 40 }
    const scales = createSparklineScales(model, dimensions)
    sparkline = createSparkline(svg, {
      ...createConfig(scales, { start: 2, end: 4 }),
      model,
      dimensions
    })
    const points = Array.from(svg.querySelectorAll('.sparkline-point'))
    const inactiveRadius = Number(points[0].getAttribute('r'))
    const activeRadius = Number(points[1].getAttribute('r'))
    const inactiveLineWidth = Number(
      svg.querySelector('.sparkline-path').getAttribute('stroke-width')
    )
    const activeLineWidth = Number(
      svg.querySelector('.sparkline-path-active').getAttribute('stroke-width')
    )

    expect(inactiveRadius).toBe(
      roundMarkSize(
        INACTIVE_POINT_RADIUS_FOR_TEST *
          MARK_DENSITY_CONFIG.pointRadius.maxScale
      )
    )
    expect(activeRadius).toBe(
      roundMarkSize(
        ACTIVE_POINT_RADIUS_FOR_TEST * MARK_DENSITY_CONFIG.pointRadius.maxScale
      )
    )
    expect(activeRadius / inactiveRadius).toBeCloseTo(
      ACTIVE_POINT_RADIUS_FOR_TEST / INACTIVE_POINT_RADIUS_FOR_TEST,
      2
    )
    expect(inactiveLineWidth).toBe(
      roundMarkSize(2.2 * MARK_DENSITY_CONFIG.lineWidth.maxScale)
    )
    expect(activeLineWidth).toBe(
      roundMarkSize(3.3 * MARK_DENSITY_CONFIG.lineWidth.maxScale)
    )
  })

  it('keeps data marks out of the brush hit path and enlarges desktop handles', () => {
    const { svg } = renderSparkline()
    const marks = svg.querySelector('.sparkline-marks')
    const brush = svg.querySelector('.viewport-brush')

    expect(marks.getAttribute('pointer-events')).toBe('none')
    expect(
      marks.querySelectorAll(
        '.sparkline-path, .sparkline-path-active, .sparkline-point'
      )
    ).toHaveLength(MODEL.ratedPoints.length + 2)
    expect(
      brush.querySelector(
        '.sparkline-path, .sparkline-path-active, .sparkline-point'
      )
    ).toBeNull()
    expect(brush.querySelector('.handle--w').getAttribute('width')).toBe('8')
  })

  it('marks the brush throughout a handle drag and clears it on release', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    const scales = createSparklineScales(MODEL, DIMENSIONS)
    let viewport = { start: 2, end: 5 }
    const buildConfig = () => ({
      ...createConfig(scales, viewport),
      onViewportChange(nextViewport) {
        viewport = {
          start: Math.round(nextViewport.start),
          end: Math.round(nextViewport.end)
        }
        sparkline.render(buildConfig())
      }
    })
    sparkline = createSparkline(svg, buildConfig())
    const brush = svg.querySelector('.viewport-brush')

    svg.querySelector('.handle--e').dispatchEvent(mouseEvent('mousedown', 120))
    expect(brush.classList.contains('is-brushing')).toBe(true)

    document.defaultView.dispatchEvent(mouseEvent('mousemove', 160))
    expect(brush.classList.contains('is-brushing')).toBe(true)

    document.defaultView.dispatchEvent(mouseEvent('mouseup', 160))
    expect(brush.classList.contains('is-brushing')).toBe(false)
  })

  it('leaves the handles at rest while the window body is dragged', () => {
    const { svg } = renderSparkline({ start: 2, end: 5 })
    const brush = svg.querySelector('.viewport-brush')

    svg.querySelector('.selection').dispatchEvent(mouseEvent('mousedown', 80))
    expect(brush.classList.contains('is-brushing')).toBe(false)

    document.defaultView.dispatchEvent(mouseEvent('mouseup', 80))
  })

  it('supports touch and cursor input through the same brush', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    const scales = createSparklineScales(MODEL, DIMENSIONS)
    const onViewportChange = vi.fn()
    sparkline = createSparkline(svg, {
      ...createConfig(scales, { start: 2, end: 5 }),
      onViewportChange
    })

    const selection = svg.querySelector('.selection')
    selection.dispatchEvent(pointerEvent('pointerdown', 80, 1))
    selection.dispatchEvent(pointerEvent('pointermove', 100, 1))
    selection.dispatchEvent(pointerEvent('pointerup', 100, 1))

    selection.dispatchEvent(mouseEvent('mousedown', 100))
    document.defaultView.dispatchEvent(mouseEvent('mousemove', 120))
    document.defaultView.dispatchEvent(mouseEvent('mouseup', 120))

    expect(
      onViewportChange.mock.calls.some(
        ([, source]) => source === 'touch-center'
      )
    ).toBe(true)
    expect(
      onViewportChange.mock.calls.some(([, source]) => source === 'brush')
    ).toBe(true)
    expect(svg.querySelector('.viewport-brush').style.display).not.toBe('none')
  })

  it('maps touch coordinates through the rendered SVG width', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 20, width: 400 })
    })
    document.body.appendChild(svg)
    const scales = createSparklineScales(MODEL, DIMENSIONS)
    const onViewportChange = vi.fn()
    sparkline = createSparkline(svg, {
      ...createConfig(scales, { start: 2, end: 4 }),
      onViewportChange
    })

    svg
      .querySelector('.selection')
      .dispatchEvent(pointerEvent('pointerdown', 220, 1))

    const [viewport] = onViewportChange.mock.calls.at(-1)
    const center = (viewport.start + viewport.end) / 2
    expect(center).toBeCloseTo(scales.xScale.invert(100))
  })
})

function renderSparkline(viewport = { start: 2, end: 3 }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  document.body.appendChild(svg)
  const scales = createSparklineScales(MODEL, DIMENSIONS)
  sparkline = createSparkline(svg, createConfig(scales, viewport))

  return { svg, scales, viewport }
}

function createConfig(scales, viewport) {
  return {
    model: MODEL,
    viewport,
    theme: THEME,
    dimensions: DIMENSIONS,
    scales,
    onViewportChange() {},
    onViewportReset() {}
  }
}

function mouseEvent(type, clientX) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    clientX,
    clientY: DIMENSIONS.height / 2
  })
  Object.defineProperty(event, 'view', { value: document.defaultView })
  return event
}

function pointerEvent(type, clientX, pointerId) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: DIMENSIONS.height / 2 }
  })
  return event
}

function roundMarkSize(size) {
  return Math.round(size * 100) / 100
}
