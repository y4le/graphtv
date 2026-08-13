import { scaleLinear } from 'd3'
import { describe, expect, it } from 'vitest'

import { resolveTrendHit } from '../../src/viz/marks.js'

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
