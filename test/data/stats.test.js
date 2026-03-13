import { describe, expect, it } from 'vitest'

import { getAverageRating, linearRegression, linearRegressionFromPoints, trendline, trendlineFromPoints } from '../../src/data/stats.js'

describe('data/stats', () => {
  it('computes a standard linear regression', () => {
    expect(linearRegression([7, 8, 9])).toEqual({
      slope: 1,
      intercept: 7
    })
  })

  it('returns a flat line for a single point', () => {
    expect(linearRegression([8.4])).toEqual({
      slope: 0,
      intercept: 8.4
    })
  })

  it('returns null for empty input', () => {
    expect(linearRegression([])).toBeNull()
  })

  it('filters null ratings before regression', () => {
    expect(linearRegression([8, null, 10])).toEqual({
      slope: 1,
      intercept: 8
    })
  })

  it('keeps trendline endpoints on the same x-domain as the points', () => {
    expect(trendline([8.3, 8.1, 8.5], 4)).toEqual([
      { x: 4, y: 8.199999999999996 },
      { x: 6, y: 8.400000000000004 }
    ])
  })

  it('supports regression over explicit x/y points without collapsing gaps', () => {
    expect(
      linearRegressionFromPoints([
        { x: 3, y: 8 },
        { x: 5, y: null },
        { x: 7, y: 10 }
      ])
    ).toEqual({
      slope: 0.5,
      intercept: 6.5
    })
  })

  it('keeps explicit-point trendlines aligned to the first and last rated x values', () => {
    expect(
      trendlineFromPoints([
        { x: 3, y: 8 },
        { x: 5, y: null },
        { x: 7, y: 10 }
      ])
    ).toEqual([
      { x: 3, y: 8 },
      { x: 7, y: 10 }
    ])
  })

  it('averages provider ratings while ignoring nulls', () => {
    expect(
      getAverageRating([
        { source: 'tvmaze', rating: 8.1, votes: null },
        { source: 'tmdb', rating: null, votes: 120 },
        { source: 'omdb', rating: 8.7, votes: 6200 }
      ])
    ).toBeCloseTo(8.4, 6)
  })
})
