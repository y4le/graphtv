import { scaleLinear, select } from 'd3'
import { describe, expect, it } from 'vitest'

import {
  renderCompanionSeriesContext,
  renderCrosshair,
  renderSeasonAxis,
  resolveTrendHit
} from '../../src/viz/marks.js'

describe('companion series context', () => {
  it('renders a non-interactive trend trace and downward season ticks', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    const xScale = scaleLinear().domain([1, 8]).range([6, 234])
    const yScale = scaleLinear().domain([6, 9]).range([120, 0])

    renderCompanionSeriesContext(
      select(svgNode),
      {
        trendline: {
          points: [
            { x: 1, y: 7 },
            { x: 8, y: 8 }
          ]
        },
        seasonSpans: [
          { seasonNumber: 1, start: 1, end: 4 },
          { seasonNumber: 2, start: 5, end: 8 }
        ],
        viewport: { start: 1, end: 8 },
        label: 'Companion Show'
      },
      { xScale, yScale },
      { width: 240, height: 120 },
      { textSecondary: '#737373' }
    )

    const layer = svgNode.querySelector('.companion-series-layer')
    const trace = layer.querySelector('.companion-series-trace')
    const ticks = Array.from(layer.querySelectorAll('.companion-season-tick'))

    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer.getAttribute('pointer-events')).toBe('none')
    expect(layer.dataset.companionLabel).toBe('Companion Show')
    expect(trace.getAttribute('stroke-dasharray')).toBe('2 5')
    expect(ticks.map((tick) => tick.__data__)).toEqual([1, 4.5, 8])
    expect(
      ticks.every(
        (tick) =>
          Number(tick.getAttribute('y2')) > Number(tick.getAttribute('y1'))
      )
    ).toBe(true)

    renderCompanionSeriesContext(
      select(svgNode),
      { viewport: { start: 1, end: 8 } },
      { xScale, yScale },
      { width: 240, height: 120 },
      { textSecondary: '#737373' }
    )

    expect(svgNode.querySelector('.companion-series-trace')).toBeNull()
    expect(svgNode.querySelectorAll('.companion-season-tick')).toHaveLength(0)
  })
})

describe('crosshair', () => {
  it('can follow a pointer x between episode points', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    const xScale = scaleLinear().domain([1, 5]).range([0, 100])

    renderCrosshair(
      select(svgNode),
      { id: 'episode-2', x: 2 },
      { xScale },
      { width: 100, height: 80 },
      { textSecondary: '#737373' },
      false,
      2.5
    )

    expect(Number(svgNode.querySelector('.crosshair').getAttribute('x1'))).toBe(
      xScale(2.5)
    )
  })
})

describe('season axis', () => {
  it('uses one bottom row, draws boundary ticks, and shortens labels when space is tight', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    document.body.appendChild(svgNode)
    const svg = select(svgNode)
    const spans = [
      { seasonNumber: 1, seasonIndex: 0, start: 1, end: 4, midpoint: 2.5 },
      { seasonNumber: 2, seasonIndex: 1, start: 5, end: 8, midpoint: 6.5 }
    ]
    const viewport = { start: 1, end: 8 }
    const dimensions = { width: 240, height: 124 }
    const theme = { textSecondary: '#737373' }

    renderSeasonAxis(
      svg,
      spans,
      viewport,
      { xScale: scaleLinear().domain([1, 8]).range([6, 234]) },
      dimensions,
      theme
    )

    expect(getSeasonAxisLabels(svgNode)).toEqual(['Season 1', 'Season 2'])
    expect(svgNode.querySelectorAll('.season-axis-tick')).toHaveLength(3)
    expect(svgNode.querySelector('.season-axis-line').getAttribute('x1')).toBe(
      '-15'
    )
    expect(
      new Set(
        Array.from(svgNode.querySelectorAll('.season-axis-label'), (label) =>
          label.getAttribute('y')
        )
      )
    ).toEqual(new Set(['115']))
    const firstTick = svgNode.querySelector('.season-axis-tick')
    expect(Number(firstTick.getAttribute('y2'))).toBeLessThan(
      Number(firstTick.getAttribute('y1'))
    )
    expect(
      Array.from(svgNode.querySelectorAll('.season-axis-label')).every(
        (label) => label.getAttribute('aria-hidden') === 'true'
      )
    ).toBe(true)

    renderSeasonAxis(
      svg,
      spans,
      viewport,
      { xScale: scaleLinear().domain([1, 8]).range([6, 74]) },
      { ...dimensions, width: 80 },
      theme
    )

    expect(getSeasonAxisLabels(svgNode)).toEqual(['1', '2'])
    svgNode.remove()
  })

  it('uses the available row for a single-episode season', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )

    renderSeasonAxis(
      select(svgNode),
      [{ seasonNumber: 1, seasonIndex: 0, start: 1, end: 1, midpoint: 1 }],
      { start: 1, end: 1 },
      { xScale: scaleLinear().domain([1, 1]).range([6, 234]) },
      { width: 240, height: 124 },
      { textSecondary: '#737373' }
    )

    expect(getSeasonAxisLabels(svgNode)).toEqual(['Season 1'])
    expect(svgNode.querySelector('.season-axis-line').getAttribute('x1')).toBe(
      '-15'
    )
    expect(svgNode.querySelector('.season-axis-line').getAttribute('x2')).toBe(
      '234'
    )
  })

  it('highlights the selected season axis segment and its boundary ticks', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    const spans = [
      { seasonNumber: 1, seasonIndex: 0, start: 1, end: 4, midpoint: 2.5 },
      { seasonNumber: 2, seasonIndex: 1, start: 5, end: 8, midpoint: 6.5 }
    ]
    const xScale = scaleLinear().domain([1, 8]).range([6, 234])

    renderSeasonAxis(
      select(svgNode),
      spans,
      { start: 1, end: 8 },
      { xScale },
      { width: 240, height: 124 },
      { textSecondary: '#737373', spotColor: '#d9480f' },
      { activeSeasonNumber: 2 }
    )

    const selection = svgNode.querySelector('.season-axis-selection')
    const activeTicks = Array.from(
      svgNode.querySelectorAll('.season-axis-tick.is-active')
    )

    expect(Number(selection.getAttribute('x1'))).toBe(xScale(4.5))
    expect(Number(selection.getAttribute('x2'))).toBe(xScale(8))
    expect(selection.getAttribute('stroke')).toBe('#d9480f')
    expect(activeTicks.map((tick) => tick.__data__)).toEqual([4.5, 8])
    expect(
      activeTicks.every(
        (tick) =>
          tick.getAttribute('stroke') === '#d9480f' &&
          tick.getAttribute('stroke-width') === '2'
      )
    ).toBe(true)
  })

  it('draws a clipped comparison range on the season axis', () => {
    const svgNode = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    const xScale = scaleLinear().domain([3, 7]).range([6, 234])

    renderSeasonAxis(
      select(svgNode),
      [
        { seasonNumber: 1, seasonIndex: 0, start: 1, end: 4, midpoint: 2.5 },
        { seasonNumber: 2, seasonIndex: 1, start: 5, end: 8, midpoint: 6.5 }
      ],
      { start: 3, end: 7 },
      { xScale },
      { width: 240, height: 124 },
      { textSecondary: '#737373', spotColor: '#d9480f' },
      { comparisonRange: { start: 2, end: 6 } }
    )

    const comparison = svgNode.querySelector('.season-axis-comparison')
    expect(Number(comparison.getAttribute('x1'))).toBe(xScale(3))
    expect(Number(comparison.getAttribute('x2'))).toBe(xScale(6))
    expect(comparison.getAttribute('stroke')).toBe('#d9480f')
    expect(comparison.getAttribute('stroke-width')).toBe('3')
  })
})

describe('trendline hit testing', () => {
  const scales = {
    xScale: scaleLinear().domain([0, 10]).range([0, 100]),
    yScale: scaleLinear().domain([0, 10]).range([100, 0])
  }

  it('selects the nearest visible line and breaks exact ties by scope', () => {
    const series = createSegment('series', 'series', 0.5, 2.5)
    const season = createSegment('season:1', 'season', 0.5, 2.5)

    expect(resolveTrendHit([50, 50], [series, season], scales, 7)?.id).toBe(
      'season:1'
    )
    expect(resolveTrendHit([50, 70], [series, season], scales, 7)).toBeNull()
  })

  it('ignores a line outside its visible x extent', () => {
    const segment = {
      ...createSegment('season:1', 'season', 0.5, 2.5),
      visibleStartX: 2,
      visibleEndX: 4
    }

    expect(resolveTrendHit([50, 50], [segment], scales, 7)).toBeNull()
  })
})

function createSegment(id, kind, slope, intercept) {
  return {
    id,
    kind,
    visibleStartX: 0,
    visibleEndX: 10,
    regression: { slope, intercept }
  }
}

function getSeasonAxisLabels(svg) {
  return Array.from(
    svg.querySelectorAll('.season-axis-label'),
    (label) => label.textContent
  )
}
