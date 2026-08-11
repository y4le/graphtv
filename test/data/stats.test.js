import { describe, expect, it } from 'vitest'

import {
  getRatingSpread,
  linearRegression,
  linearRegressionFromPoints,
  resolveEpisodeRating,
  selectPrimaryRatingSource,
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

  it('uses the next preferred provider when IMDb coverage is too sparse', () => {
    const episodes = Array.from({ length: 5 }, (_, index) => ({
      ratings: [
        { source: 'tmdb', rating: 8 + index / 10 },
        ...(index < 2 ? [{ source: 'omdb', rating: 8.5 + index / 10 }] : [])
      ]
    }))

    expect(selectPrimaryRatingSource(episodes).source).toBe('tmdb')
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
      rating: 8.4,
      ratingSource: 'tmdb',
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

    expect(selectPrimaryRatingSource([{ ratings: [weakOmdbRating, tmdbRating] }]).source).toBe('tmdb')
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
