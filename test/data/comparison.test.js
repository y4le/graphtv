import { describe, expect, it } from 'vitest'

import {
  formatComparisonSelection,
  formatComparisonSelections,
  getComparisonEpisodeCount,
  getComparisonRatings,
  parseComparisonSelection,
  parseComparisonSelections,
  selectComparisonRatingSource
} from '../../src/data/comparison.js'

describe('comparison data', () => {
  it('chooses the highest-priority source with adequate coverage in both shows', () => {
    const result = selectComparisonRatingSource({
      a: seasons([
        ratings('omdb', 8),
        ratings('omdb', 9),
        ratings('tvmaze', 7)
      ]),
      b: seasons([ratings('omdb', 8), ratings('omdb', 8), ratings('tvmaze', 9)])
    })

    expect(result.source).toBe('omdb')
    expect(result.availableSources).toEqual(['omdb'])
    expect(result.comparable).toBe(true)
  })

  it('reports independent fallbacks without pretending unlike sources compare', () => {
    const result = selectComparisonRatingSource({
      a: seasons([ratings('omdb', 8), ratings('omdb', 9)]),
      b: seasons([ratings('tvmaze', 7), ratings('tvmaze', 8)])
    })

    expect(result.source).toBeNull()
    expect(result.comparable).toBe(false)
    expect(result.fallbackSources).toEqual({ a: 'omdb', b: 'tvmaze' })
  })

  it('counts canonical episodes and extracts only trusted source ratings', () => {
    const sourceSeasons = seasons([
      ratings('omdb', 8),
      ratings('tvmaze', 7),
      [
        { source: 'omdb', rating: 9, votes: 20 },
        {
          source: 'omdb',
          rating: 6,
          votes: 20,
          provenance: { relation: 'ambiguous', confidence: 'weak' }
        }
      ]
    ])

    expect(getComparisonEpisodeCount(sourceSeasons)).toBe(3)
    expect(getComparisonRatings(sourceSeasons, 'omdb')).toEqual([8, 9])
  })

  it('round-trips slot-qualified selections', () => {
    expect(parseComparisonSelection('b:s04e13')).toEqual({
      slot: 'b',
      selection: 's04e13'
    })
    expect(parseComparisonSelection('s04e13')).toBeNull()
    expect(formatComparisonSelection('a', 'series')).toBe('a:series')
    expect(formatComparisonSelection('c', 'series')).toBeNull()
  })

  it('round-trips one episode selection per comparison lane', () => {
    const selections = [
      { slot: 'a', selection: 's01e02' },
      { slot: 'b', selection: 's03e04' }
    ]

    expect(formatComparisonSelections(selections)).toBe('a:s01e02,b:s03e04')
    expect(parseComparisonSelections('a:s01e02,b:s03e04')).toEqual(selections)
    expect(parseComparisonSelections('invalid,a:s01e01,a:s01e02')).toEqual([
      { slot: 'a', selection: 's01e02' }
    ])
  })
})

function seasons(episodeRatings) {
  return [
    {
      number: 1,
      episodes: episodeRatings.map((episodeRating, index) => ({
        id: `episode-${index + 1}`,
        title: `Episode ${index + 1}`,
        season: 1,
        episode: index + 1,
        ratings: episodeRating
      }))
    }
  ]
}

function ratings(source, rating) {
  return [{ source, rating, votes: 20 }]
}
