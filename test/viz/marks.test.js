import { scaleLinear, select } from 'd3'
import { describe, expect, it } from 'vitest'

import { renderSeasonAxis, resolveTrendHit } from '../../src/viz/marks.js'

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
})

describe('trendline hit testing', () => {
  const scales = {
    xScale: scaleLinear().domain([0, 10]).range([0, 100]),
    yScale: scaleLinear().domain([0, 10]).range([100, 0])
  }

  it('selects the nearest visible line and breaks exact ties by scope', () => {
    const series = createSegment('series', 'series', 0.5, 2.5)
    const season = createSegment('season:1', 'season', 0.5, 2.5)

    expect(
      resolveTrendHit([50, 50], [series, season], scales, 7)?.id
    ).toBe('season:1')
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
