import { describe, expect, it } from 'vitest'

import { createProviderRating } from '../../src/data/schema.js'

describe('provider rating construction', () => {
  it('preserves a genuine zero score and rating metadata', () => {
    const provenance = {
      providerEpisodeId: 'episode-1',
      strategy: 'external-id',
      confidence: 'strong',
      evidence: null,
      relation: 'one-to-one'
    }

    expect(
      createProviderRating('rtCritics', 0, 1, {
        metric: 'percentagePositive',
        contributors: ['rtCritics'],
        provenance
      })
    ).toStrictEqual({
      metric: 'percentagePositive',
      contributors: ['rtCritics'],
      provenance,
      source: 'rtCritics',
      rating: 0,
      votes: 1
    })
  })

  it('normalizes negative zero to positive zero', () => {
    const rating = createProviderRating('rtCritics', -0, 1)

    expect(Object.is(rating.rating, 0)).toBe(true)
    expect(Object.is(rating.rating, -0)).toBe(false)
  })

  it.each([11, -1, Number.NaN, '8', null, undefined])(
    'rejects an out-of-range or non-numeric value: %j',
    (value) => {
      expect(createProviderRating('test', value).rating).toBeNull()
    }
  )
})
