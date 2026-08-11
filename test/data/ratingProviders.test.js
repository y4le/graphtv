import { describe, expect, it } from 'vitest'

import {
  getRatingSourceLabel,
  orderVisibleRatings
} from '../../src/data/ratingProviders.js'

describe('rating provider registry', () => {
  it('owns user-facing labels and provider preference order', () => {
    const ratings = [
      { source: 'tmdb', rating: 7.8 },
      { source: 'unknown', rating: 6.4 },
      { source: 'omdb', rating: 8.2 },
      { source: 'tvmaze', rating: 7.5 }
    ]

    expect(getRatingSourceLabel('omdb')).toBe('IMDb')
    expect(orderVisibleRatings(ratings).map((rating) => rating.source)).toEqual([
      'omdb',
      'tvmaze',
      'tmdb',
      'unknown'
    ])
  })
})
