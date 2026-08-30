import { describe, expect, it } from 'vitest'

import {
  normalizeTvmazeEpisodes,
  normalizeTvmazeSearch,
  normalizeTvmazeShow
} from '../../src/providers/tvmaze/normalize.js'
import {
  tvmazeEpisodesFixture,
  tvmazeSearchFixture,
  tvmazeShowFixture
} from '../fixtures/tvmaze.js'

describe('tvmaze normalization', () => {
  it('normalizes search results into provider-aware shows', () => {
    expect(normalizeTvmazeSearch(tvmazeSearchFixture)).toEqual([
      {
        id: 'tvmaze:179',
        title: 'The Wire',
        year: '2002',
        endYear: null,
        plot: null,
        poster:
          'https://static.tvmaze.com/uploads/images/original_untouched/8/20216.jpg',
        totalSeasons: 0,
        genres: ['Crime', 'Drama'],
        ratings: [],
        externalIds: {}
      }
    ])
  })

  it('normalizes show details and season count', () => {
    expect(normalizeTvmazeShow(tvmazeShowFixture)).toEqual({
      id: 'tvmaze:179',
      title: 'The Wire',
      year: '2002',
      endYear: null,
      plot: 'Told from the points of view of both the Baltimore homicide and narcotics detectives and their targets.',
      poster:
        'https://static.tvmaze.com/uploads/images/original_untouched/8/20216.jpg',
      totalSeasons: 1,
      genres: ['Crime', 'Drama'],
      ratings: [{ source: 'tvmaze', rating: 8.9, votes: null }],
      externalIds: { imdb: 'tt0306414', tvdb: 79126, tvmaze: 179 }
    })
  })

  it('normalizes episode payloads and keeps null posters null', () => {
    expect(normalizeTvmazeEpisodes(tvmazeEpisodesFixture)).toEqual([
      {
        number: 1,
        title: 'Season 1',
        episodes: [
          {
            id: 'tvmaze:episode:1001',
            title: 'The Target',
            plot: 'McNulty gets pulled into a new detail.',
            season: 1,
            episode: 1,
            date: '2002-06-02',
            ratings: [{ source: 'tvmaze', rating: 8.3, votes: null }],
            poster:
              'https://static.tvmaze.com/uploads/images/original_untouched/1/1111.jpg',
            sourceIds: { tvmaze: '1001' }
          },
          {
            id: 'tvmaze:episode:1002',
            title: 'The Detail',
            plot: 'The unit starts to organize its surveillance.',
            season: 1,
            episode: 2,
            date: '2002-06-09',
            ratings: [{ source: 'tvmaze', rating: 8.1, votes: null }],
            poster:
              'https://static.tvmaze.com/uploads/images/original_untouched/1/1112.jpg',
            sourceIds: { tvmaze: '1002' }
          },
          {
            id: 'tvmaze:episode:1003',
            title: 'The Buys',
            plot: 'The detail starts buying street product.',
            season: 1,
            episode: 3,
            date: '2002-06-16',
            ratings: [{ source: 'tvmaze', rating: null, votes: null }],
            poster: null,
            sourceIds: { tvmaze: '1003' }
          }
        ]
      }
    ])
  })
})
