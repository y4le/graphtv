import { afterEach, describe, expect, it } from 'vitest'

import {
  createSparklineScales,
  viewportToBrushSelection
} from '../../src/viz/scales.js'
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
  text: '#1A1A1A',
  spotColor: '#C1432E'
}

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
    mobileInteraction: false,
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
