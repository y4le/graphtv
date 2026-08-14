import { describe, expect, it } from 'vitest'

import {
  detectSeriesBreakpoint,
  getRatingSpread,
  linearRegression,
  linearRegressionFromPoints,
  resolveEpisodeRating,
  selectPrimaryRatingSource,
  summarizeTrendScope,
  trendline,
  trendlineFromPoints
} from '../../src/data/stats.js'

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

  it('summarizes the exact primary-source points used by a trendline', () => {
    const summary = summarizeTrendScope(
      [
        createTrendPoint('one', 1, 6),
        createTrendPoint('two', 2, 7),
        createTrendPoint('fallback', 3, 10, true),
        createTrendPoint('three', 4, 8),
        createTrendPoint('four', 5, 9),
        createTrendPoint('five', 6, 10)
      ],
      { totalEpisodes: 7, source: 'omdb' }
    )

    expect(summary).toMatchObject({
      n: 5,
      totalEpisodes: 7,
      excludedFallback: 1,
      source: 'omdb',
      mean: 8,
      direction: 'up',
      firstRatedX: 1,
      lastRatedX: 6
    })
    expect(summary.delta).toBeCloseTo(3.779)
    expect(summary.high.point.id).toBe('five')
    expect(summary.low.point.id).toBe('one')
    expect(summary.top.map((extreme) => extreme.point.id)).toEqual([
      'five',
      'four'
    ])
    expect(summary.bottom.map((extreme) => extreme.point.id)).toEqual([
      'one',
      'two'
    ])
    expect(
      summary.top.some((top) =>
        summary.bottom.some((bottom) => bottom.point.id === top.point.id)
      )
    ).toBe(false)
    expect(summary.trendCriteria).toMatchObject({
      ratedEpisodes: 5,
      minimumRatedEpisodes: 5,
      enoughRatedEpisodes: true,
      minimumSignalRatio: 2,
      consistentSlope: true,
      minimumDelta: 0.1,
      meaningfulDelta: true
    })
  })

  it('does not claim a direction for sparse or noisy fits', () => {
    const sparse = summarizeTrendScope([
      createTrendPoint('one', 1, 6),
      createTrendPoint('two', 2, 7),
      createTrendPoint('three', 3, 8),
      createTrendPoint('four', 4, 9)
    ])
    const flat = summarizeTrendScope(
      Array.from({ length: 6 }, (_, index) =>
        createTrendPoint(String(index), index + 1, 8)
      )
    )
    const noisy = summarizeTrendScope(
      [6, 10, 6, 10, 6, 10].map((rating, index) =>
        createTrendPoint(String(index), index + 1, rating)
      )
    )

    expect(sparse.direction).toBe('unclear')
    expect(sparse.trendCriteria.enoughRatedEpisodes).toBe(false)
    expect(flat.direction).toBe('unclear')
    expect(flat.trendCriteria.meaningfulDelta).toBe(false)
    expect(noisy.direction).toBe('unclear')
    expect(noisy.trendCriteria.consistentSlope).toBe(false)
  })

  it('describes rating spread, residual fit, and trend uncertainty', () => {
    const summary = summarizeTrendScope(
      [6, 7, 8, 9, 10].map((rating, index) =>
        createTrendPoint(String(index + 1), index + 1, rating)
      )
    )

    expect(summary.ratingStandardDeviation).toBeCloseTo(Math.sqrt(2))
    expect(summary.residualMeanAbsoluteError).toBeCloseTo(0)
    expect(summary.rSquared).toBeCloseTo(1)
    expect(summary.deltaStandardError).toBeCloseTo(0)
  })

  it('leaves trend fit undefined when every rating is identical', () => {
    const summary = summarizeTrendScope(
      Array.from({ length: 5 }, (_, index) =>
        createTrendPoint(String(index + 1), index + 1, 8)
      )
    )

    expect(summary.ratingStandardDeviation).toBe(0)
    expect(summary.rSquared).toBeNull()
  })

  it('detects only a sustained, high-confidence series breakpoint', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints([...Array(16).fill(8.8), ...Array(16).fill(6.4)])
    )

    expect(breakpoint).toMatchObject({
      highConfidence: true,
      confidence: 'high',
      splitIndex: 16,
      separation: 1,
      sustain: 1
    })
    expect(breakpoint.beforeMedian).toBeCloseTo(8.825)
    expect(breakpoint.afterMedian).toBeCloseTo(6.425)
    expect(breakpoint.pValue).toBeLessThanOrEqual(0.01)
    expect(breakpoint.score).toBeGreaterThanOrEqual(70)
  })

  it('retains a formable candidate below the automatic episode threshold', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints([...Array(6).fill(8.8), ...Array(6).fill(6.4)])
    )

    expect(breakpoint).toMatchObject({
      highConfidence: false,
      confidence: 'below threshold',
      splitIndex: 6,
      criteria: {
        enoughRatedEpisodes: { passed: false }
      }
    })
  })

  it('does not call a temporary bad stretch a high-confidence breakpoint', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints([
        ...Array(8).fill(8.8),
        ...Array(8).fill(6.4),
        ...Array(16).fill(8.8)
      ])
    )

    expect(breakpoint.highConfidence).toBe(false)
    expect(
      breakpoint.criteria.persistence.passed &&
        breakpoint.criteria.noRecovery.passed
    ).toBe(false)
  })

  it('does not turn a smooth decline into an abrupt breakpoint', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints(
        Array.from({ length: 64 }, (_, index) => 8.8 - index * 0.015)
      )
    )

    expect(breakpoint.highConfidence).toBe(false)
    expect(breakpoint.criteria.significant.passed).toBe(false)
  })

  it('detects a short terminal collapse after several stable eras', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints([...Array(64).fill(8.9), ...Array(6).fill(6.7)], {
        seasonLength: 10
      })
    )

    expect(breakpoint).toMatchObject({
      highConfidence: true,
      splitIndex: 64,
      blockLength: 4,
      driftSlope: 0
    })
    expect(breakpoint.drop).toBeGreaterThan(2)
    expect(breakpoint.pValue).toBeLessThanOrEqual(0.01)
  })

  it('preserves a strong breakpoint in a long-running series', () => {
    const breakpoint = detectSeriesBreakpoint(
      createBreakpointPoints([...Array(248).fill(8), ...Array(442).fill(6.7)], {
        seasonLength: 20
      })
    )

    expect(breakpoint).toMatchObject({
      highConfidence: true,
      splitIndex: 248,
      blockLength: 9
    })
    expect(breakpoint.pValue).toBeLessThanOrEqual(0.01)
  })

  it('keeps top and bottom rankings disjoint for short seasons', () => {
    const summary = summarizeTrendScope([
      createTrendPoint('one', 1, 7),
      createTrendPoint('two', 2, 8),
      createTrendPoint('three', 3, 9)
    ])

    expect(summary.top.map((extreme) => extreme.point.id)).toEqual(['three'])
    expect(summary.bottom.map((extreme) => extreme.point.id)).toEqual(['one'])
  })

  it('keeps tied ratings out of both ranking columns', () => {
    const summary = summarizeTrendScope(
      [8, 8, 8, 8, 7, 9].map((rating, index) =>
        createTrendPoint(String(index + 1), index + 1, rating)
      )
    )
    const topIds = summary.top.map((extreme) => extreme.point.id)
    const bottomIds = summary.bottom.map((extreme) => extreme.point.id)

    expect(topIds).toEqual(['6', '1', '2'])
    expect(bottomIds).toEqual(['5', '4', '3'])
    expect(topIds.some((id) => bottomIds.includes(id))).toBe(false)
  })

  it('selects IMDb when it covers at least 60% of rateable episodes', () => {
    const episodes = Array.from({ length: 5 }, (_, index) => ({
      ratings: [
        { source: 'tmdb', rating: 8 + index / 10 },
        ...(index < 3 ? [{ source: 'omdb', rating: 8.5 + index / 10 }] : [])
      ]
    }))

    expect(selectPrimaryRatingSource(episodes)).toMatchObject({
      source: 'omdb',
      eligibleEpisodes: 5
    })
  })

  it('prefers TVmaze to TMDB when IMDb coverage is too sparse', () => {
    const episodes = Array.from({ length: 5 }, (_, index) => ({
      ratings: [
        { source: 'tvmaze', rating: 7.5 + index / 10 },
        { source: 'tmdb', rating: 8 + index / 10 },
        ...(index < 2 ? [{ source: 'omdb', rating: 8.5 + index / 10 }] : [])
      ]
    }))

    expect(selectPrimaryRatingSource(episodes).source).toBe('tvmaze')
  })

  it('does not count episodes with no provider rating against source coverage', () => {
    const episodes = [
      { ratings: [{ source: 'omdb', rating: 8.1 }] },
      { ratings: [{ source: 'omdb', rating: 8.2 }] },
      { ratings: [{ source: 'tmdb', rating: 8.3 }] },
      { ratings: [{ source: 'omdb', rating: null }] },
      { ratings: [] }
    ]

    expect(selectPrimaryRatingSource(episodes)).toMatchObject({
      source: 'omdb',
      eligibleEpisodes: 3
    })
  })

  it('resolves missing primary ratings by priority without averaging', () => {
    expect(
      resolveEpisodeRating(
        [
          { source: 'tvmaze', rating: 8.1 },
          { source: 'tmdb', rating: 8.4 },
          { source: 'omdb', rating: null }
        ],
        'omdb'
      )
    ).toEqual({
      rating: 8.1,
      ratingSource: 'tvmaze',
      isFallbackRating: true
    })
  })

  it('excludes weak episode alignments from source selection and spread', () => {
    const weakOmdbRating = {
      source: 'omdb',
      rating: 9.8,
      provenance: {
        relation: 'one-to-one',
        confidence: 'moderate'
      }
    }
    const tmdbRating = { source: 'tmdb', rating: 8.2 }

    expect(
      selectPrimaryRatingSource([{ ratings: [weakOmdbRating, tmdbRating] }])
        .source
    ).toBe('tmdb')
    expect(getRatingSpread([weakOmdbRating, tmdbRating])).toBeNull()
  })

  it('summarizes trustworthy provider disagreement as a range', () => {
    expect(
      getRatingSpread([
        { source: 'tvmaze', rating: 8.1 },
        { source: 'tmdb', rating: 8.4 },
        { source: 'omdb', rating: 8.7 }
      ])
    ).toEqual({
      min: 8.1,
      max: 8.7,
      sources: ['tvmaze', 'tmdb', 'omdb']
    })
  })
})

function createTrendPoint(id, x, rating, isFallbackRating = false) {
  return {
    id,
    x,
    rating,
    isFallbackRating,
    season: 1,
    episode: x
  }
}

function createBreakpointPoints(ratings, { seasonLength = 8 } = {}) {
  return ratings.map((rating, index) => ({
    id: `episode-${index + 1}`,
    x: index + 1,
    rating: rating + [0, 0.1, -0.1, 0.05][index % 4],
    ratingSource: 'test',
    isFallbackRating: false,
    season: Math.floor(index / seasonLength) + 1,
    episode: (index % seasonLength) + 1,
    ratings: [{ source: 'test', rating }]
  }))
}
