import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  RATING_PROVIDER_REGISTRY,
  RATING_SOURCE_PRIORITY,
  getDisplayedRatingSources,
  getRatingMinimumVotes,
  getRatingProvider,
  getRatingSourceLabel,
  getRatingSourceUrl,
  getShowHiddenRatings,
  isRatingSourceVisible,
  orderVisibleRatings,
  setShowHiddenRatings
} from '../../src/data/ratingProviders.js'

describe('rating provider registry', () => {
  beforeEach(() => {
    setShowHiddenRatings(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setShowHiddenRatings(false)
  })

  it('pins the S05 source table and visible priority', () => {
    expect(
      RATING_PROVIDER_REGISTRY.map(
        ({ source, label, order, showInRatings, minimumVotes }) => ({
          source,
          label,
          order,
          showInRatings,
          minimumVotes
        })
      )
    ).toStrictEqual([
      {
        source: 'combined',
        label: 'Combined',
        order: 0,
        showInRatings: true,
        minimumVotes: 0
      },
      {
        source: 'imdb',
        label: 'IMDb',
        order: 1,
        showInRatings: true,
        minimumVotes: 0
      },
      {
        source: 'tvmaze',
        label: 'TVmaze',
        order: 2,
        showInRatings: true,
        minimumVotes: 0
      },
      {
        source: 'tmdb',
        label: 'TMDB',
        order: 3,
        showInRatings: true,
        minimumVotes: 5
      },
      {
        source: 'trakt',
        label: 'Trakt',
        order: 4,
        showInRatings: true,
        minimumVotes: 0
      },
      {
        source: 'rtCritics',
        label: 'RT Critics',
        order: 5,
        showInRatings: false,
        minimumVotes: 0
      },
      {
        source: 'rtAudience',
        label: 'RT Audience',
        order: 6,
        showInRatings: false,
        minimumVotes: 0
      },
      {
        source: 'mcCritics',
        label: 'Metacritic',
        order: 7,
        showInRatings: false,
        minimumVotes: 0
      },
      {
        source: 'mcAudience',
        label: 'Metacritic Users',
        order: 8,
        showInRatings: false,
        minimumVotes: 0
      },
      {
        source: 'omdb',
        label: 'IMDb (OMDb)',
        order: 9,
        showInRatings: true,
        minimumVotes: 0
      }
    ])
    expect(RATING_SOURCE_PRIORITY).toStrictEqual([
      'combined',
      'imdb',
      'tvmaze',
      'tmdb',
      'trakt',
      'omdb'
    ])
  })

  it('keeps registry sources and orders unique and immutable', () => {
    const sources = RATING_PROVIDER_REGISTRY.map((provider) => provider.source)
    const orders = RATING_PROVIDER_REGISTRY.map((provider) => provider.order)

    expect(new Set(sources).size).toBe(sources.length)
    expect(new Set(orders).size).toBe(orders.length)
    expect(Object.isFrozen(RATING_PROVIDER_REGISTRY)).toBe(true)
    expect(
      RATING_PROVIDER_REGISTRY.every((provider) => Object.isFrozen(provider))
    ).toBe(true)
  })

  it('orders visible sources and reveals hidden sources only on request', () => {
    const ratings = [
      { source: 'omdb', rating: 8.2 },
      { source: 'unknown', rating: 6.4 },
      { source: 'rtAudience', rating: 7.2 },
      { source: 'tmdb', rating: 7.8 },
      { source: 'combined', rating: 8 },
      { source: 'mcCritics', rating: 7.5 },
      { source: 'tvmaze', rating: 7.5 },
      { source: 'imdb', rating: 8.1 },
      { source: 'trakt', rating: 7.9 },
      { source: 'rtCritics', rating: 8.4 },
      { source: 'mcAudience', rating: 7.3 }
    ]

    expect(orderVisibleRatings(ratings).map((rating) => rating.source)).toEqual(
      ['combined', 'imdb', 'tvmaze', 'tmdb', 'trakt', 'omdb', 'unknown']
    )
    expect(
      orderVisibleRatings(ratings, { includeHidden: true }).map(
        (rating) => rating.source
      )
    ).toEqual([
      'combined',
      'imdb',
      'tvmaze',
      'tmdb',
      'trakt',
      'rtCritics',
      'rtAudience',
      'mcCritics',
      'mcAudience',
      'omdb',
      'unknown'
    ])
    expect(isRatingSourceVisible('rtCritics', false)).toBe(false)
    expect(isRatingSourceVisible('rtCritics', true)).toBe(true)
    expect(getRatingProvider('unknown')).toMatchObject({
      label: 'UNKNOWN',
      order: Number.MAX_SAFE_INTEGER,
      showInRatings: true
    })
  })

  it('derives credited sources from visible show and episode ratings', () => {
    const first = {
      show: {
        ratings: [
          { source: 'tmdb', rating: 7.8 },
          { source: 'combined', rating: 8.1 }
        ]
      },
      seasons: [
        {
          episodes: [
            {
              ratings: [
                { source: 'imdb', rating: 8.2 },
                { source: 'rtCritics', rating: 8.4 }
              ]
            }
          ]
        }
      ]
    }
    const second = {
      show: { ratings: [{ source: 'tvmaze', rating: 8 }] },
      seasons: []
    }

    expect(getDisplayedRatingSources(first)).toStrictEqual([
      'combined',
      'imdb',
      'tmdb'
    ])
    expect(
      getDisplayedRatingSources([first, second], { includeHidden: true })
    ).toStrictEqual(['combined', 'imdb', 'tvmaze', 'tmdb', 'rtCritics'])
  })

  it('builds source-owned series links from validated external ids', () => {
    const show = {
      externalIds: {
        imdb: 'tt0306414',
        tmdb: 1438,
        tvmaze: 179,
        trakt: 'the-wire',
        rt_url: 'https://www.rottentomatoes.com/tv/the_wire',
        mc_url: 'https://www.metacritic.com/tv/the-wire/'
      }
    }

    expect(getRatingSourceUrl('imdb', { show })).toBe(
      'https://www.imdb.com/title/tt0306414/'
    )
    expect(getRatingSourceUrl('omdb', { show })).toBe(
      'https://www.imdb.com/title/tt0306414/'
    )
    expect(getRatingSourceUrl('tmdb', { show })).toBe(
      'https://www.themoviedb.org/tv/1438'
    )
    expect(getRatingSourceUrl('tvmaze', { show })).toBe(
      'https://www.tvmaze.com/shows/179'
    )
    expect(getRatingSourceUrl('trakt', { show })).toBe(
      'https://trakt.tv/shows/the-wire'
    )
    expect(getRatingSourceUrl('rtCritics', { show })).toBe(
      'https://www.rottentomatoes.com/tv/the_wire'
    )
    expect(getRatingSourceUrl('mcAudience', { show })).toBe(
      'https://www.metacritic.com/tv/the-wire/'
    )
    expect(getRatingSourceUrl('combined', { show })).toBeNull()
  })

  it('uses distinct IMDb episode ids for direct and legacy sources', () => {
    const show = { externalIds: { tmdb: 1438 } }
    const episode = {
      season: 1,
      episode: 2,
      sourceIds: {
        imdb: 'tt9000002',
        omdb: 'tt0739785',
        tmdb: '66453',
        tvmaze: '1002'
      }
    }

    expect(getRatingSourceUrl('imdb', { show, episode })).toBe(
      'https://www.imdb.com/title/tt9000002/'
    )
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

  it.each([
    ['rtCritics', { rt_url: 'javascript:alert(1)' }],
    ['rtAudience', { rt_url: 'data:text/html,unsafe' }],
    ['mcCritics', { mc_url: '//evil.example/path' }],
    ['trakt', { trakt: '../evil' }],
    ['trakt', { trakt: 'a/b' }],
    ['trakt', { trakt: '' }],
    ['trakt', { trakt: 123 }],
    ['imdb', { imdb: 'javascript:alert(1)' }]
  ])('rejects an unsafe %s external id', (source, externalIds) => {
    expect(getRatingSourceUrl(source, { show: { externalIds } })).toBeNull()
  })

  it('falls back to a safe series URL when an episode id is unavailable', () => {
    const show = { externalIds: { imdb: 'tt0306414', tmdb: 1438 } }
    const episode = { season: 1, episode: 2, sourceIds: {} }

    expect(getRatingSourceUrl('tmdb', { show, episode })).toBe(
      'https://www.themoviedb.org/tv/1438'
    )
    expect(getRatingSourceUrl('unknown', { show })).toBeNull()
  })

  it('persists the hidden-source preference under the app storage prefix', () => {
    setShowHiddenRatings(true)

    expect(getShowHiddenRatings()).toBe(true)
    expect(window.localStorage.getItem('graphtv:show-hidden-ratings')).toBe(
      'true'
    )
    expect(
      orderVisibleRatings([{ source: 'rtCritics', rating: 8 }])
    ).toHaveLength(1)

    setShowHiddenRatings(false)
    expect(getShowHiddenRatings()).toBe(false)
    expect(
      window.localStorage.getItem('graphtv:show-hidden-ratings')
    ).toBeNull()
  })

  it('keeps a session preference when browser storage rejects writes', () => {
    vi.spyOn(
      Object.getPrototypeOf(window.localStorage),
      'setItem'
    ).mockImplementation(() => {
      throw new Error('Storage blocked')
    })

    expect(() => setShowHiddenRatings(true)).not.toThrow()
    expect(getShowHiddenRatings()).toBe(true)
  })

  it('owns user-facing labels and minimum-vote policy', () => {
    expect(getRatingSourceLabel('omdb')).toBe('IMDb (OMDb)')
    expect(getRatingMinimumVotes('tmdb')).toBe(5)
    expect(getRatingMinimumVotes('omdb')).toBe(0)
  })
})
