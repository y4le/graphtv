import { describe, expect, it } from 'vitest'

import { mergeShowRecords } from '../../src/data/merge.js'

const primaryRecord = {
  provider: 'tvmaze',
  show: {
    id: 'tvmaze:179',
    title: 'The Wire',
    year: '2002',
    plot: 'TVmaze plot',
    poster: 'tvmaze-poster.jpg',
    totalSeasons: 1,
    genres: ['Crime', 'Drama'],
    ratings: [{ source: 'tvmaze', rating: 8.9, votes: null }],
    externalIds: { imdb: 'tt0306414' }
  },
  seasons: [
    {
      number: 1,
      title: 'Season 1',
      episodes: [
        {
          id: 'tvmaze:episode:1',
          title: 'The Target',
          plot: 'Episode one',
          season: 1,
          episode: 1,
          date: '2002-06-02',
          ratings: [{ source: 'tvmaze', rating: 8.3, votes: null }],
          poster: 'tvmaze-1.jpg'
        },
        {
          id: 'tvmaze:episode:2',
          title: 'The Detail',
          plot: 'Episode two',
          season: 1,
          episode: 2,
          date: '2002-06-09',
          ratings: [{ source: 'tvmaze', rating: 8.1, votes: null }],
          poster: 'tvmaze-2.jpg'
        },
        {
          id: 'tvmaze:episode:3',
          title: 'The Buys',
          plot: 'Episode three',
          season: 1,
          episode: 3,
          date: '2002-06-16',
          ratings: [{ source: 'tvmaze', rating: null, votes: null }],
          poster: null
        }
      ]
    }
  ]
}

const supplementalRecord = {
  provider: 'tmdb',
  show: {
    id: 'tmdb:1438',
    title: 'The Wire',
    year: '2002',
    plot: 'TMDB plot',
    poster: 'tmdb-poster.jpg',
    totalSeasons: 1,
    genres: ['Crime', 'Drama'],
    ratings: [{ source: 'tmdb', rating: 8.6, votes: 2000 }],
    externalIds: { imdb: 'tt0306414', tmdb: 1438 }
  },
  seasons: [
    {
      number: 1,
      title: 'Season 1',
      episodes: [
        {
          id: 'tmdb:episode:66452',
          title: 'The Target',
          plot: 'Episode one',
          season: 1,
          episode: 1,
          date: '2002-06-02',
          ratings: [{ source: 'tmdb', rating: 8.4, votes: 120 }],
          poster: 'tmdb-1.jpg'
        },
        {
          id: 'tmdb:episode:66453',
          title: 'The Detail',
          plot: 'Episode two',
          season: 1,
          episode: 2,
          date: '2002-06-09',
          ratings: [{ source: 'tmdb', rating: 8.0, votes: 110 }],
          poster: 'tmdb-2.jpg'
        },
        {
          id: 'tmdb:episode:66454',
          title: 'The Buys',
          plot: 'Episode three',
          season: 1,
          episode: 3,
          date: '2002-06-16',
          ratings: [{ source: 'tmdb', rating: 8.5, votes: 100 }],
          poster: 'tmdb-3.jpg'
        },
        {
          id: 'tmdb:episode:66455',
          title: 'Old Cases',
          plot: 'Extra special',
          season: 1,
          episode: 4,
          date: '2002-06-23',
          ratings: [{ source: 'tmdb', rating: 7.9, votes: 90 }],
          poster: 'tmdb-4.jpg'
        }
      ]
    }
  ]
}

describe('data/merge', () => {
  it('merges ratings arrays and fills missing metadata from supplemental providers', () => {
    const merged = mergeShowRecords(primaryRecord, [supplementalRecord])

    expect(merged.show.ratings).toEqual([
      { source: 'tvmaze', rating: 8.9, votes: null },
      { source: 'tmdb', rating: 8.6, votes: 2000 }
    ])
    expect(merged.seasons[0].episodes[2].ratings).toEqual([
      { source: 'tvmaze', rating: null, votes: null },
      { source: 'tmdb', rating: 8.5, votes: 100 }
    ])
    expect(merged.seasons[0].episodes[2].poster).toBe('tmdb-3.jpg')
  })

  it('captures episode mismatches for debug mode', () => {
    const merged = mergeShowRecords(primaryRecord, [supplementalRecord])

    expect(merged.mismatches).toEqual([
      {
        source: 'tmdb',
        type: 'extra_episode',
        season: 1,
        episode: 4,
        title: 'Old Cases'
      }
    ])
  })
})
