import { describe, expect, it } from 'vitest'

import {
  getRatingMinimumVotes,
  getRatingSourceLabel,
  getRatingSourceUrl,
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
    expect(getRatingMinimumVotes('tmdb')).toBe(5)
    expect(getRatingMinimumVotes('omdb')).toBe(0)
    expect(orderVisibleRatings(ratings).map((rating) => rating.source)).toEqual([
      'omdb',
      'tvmaze',
      'tmdb',
      'unknown'
    ])
  })

  it('builds provider-owned series links from normalized external ids', () => {
    const show = {
      externalIds: {
        imdb: 'tt0306414',
        tmdb: 1438,
        tvmaze: 179
      }
    }

    expect(getRatingSourceUrl('omdb', { show })).toBe(
      'https://www.imdb.com/title/tt0306414/'
    )
    expect(getRatingSourceUrl('tmdb', { show })).toBe(
      'https://www.themoviedb.org/tv/1438'
    )
    expect(getRatingSourceUrl('tvmaze', { show })).toBe(
      'https://www.tvmaze.com/shows/179'
    )
  })

  it('prefers provider-native episode links when the episode was aligned', () => {
    const show = { externalIds: { tmdb: 1438 } }
    const episode = {
      season: 1,
      episode: 2,
      sourceIds: {
        omdb: 'tt0739785',
        tmdb: '66453',
        tvmaze: '1002'
      }
    }

    expect(getRatingSourceUrl('omdb', { show, episode })).toBe(
      'https://www.imdb.com/title/tt0739785/'
    )
    expect(getRatingSourceUrl('tmdb', { show, episode })).toBe(
      'https://www.themoviedb.org/tv/1438/season/1/episode/2'
    )
    expect(getRatingSourceUrl('tvmaze', { show, episode })).toBe(
      'https://www.tvmaze.com/episodes/1002'
    )
  })

  it('falls back safely when native provider ids are missing or invalid', () => {
    const show = { externalIds: { imdb: 'tt0306414', tmdb: 1438 } }
    const unalignedEpisode = {
      season: 1,
      episode: 2,
      sourceIds: {}
    }

    expect(
      getRatingSourceUrl('tmdb', { show, episode: unalignedEpisode })
    ).toBe('https://www.themoviedb.org/tv/1438')
    expect(
      getRatingSourceUrl('omdb', {
        show: { externalIds: { imdb: 'javascript:alert(1)' } }
      })
    ).toBeNull()
    expect(getRatingSourceUrl('unknown', { show })).toBeNull()
  })
})
