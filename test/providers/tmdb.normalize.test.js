import { describe, expect, it } from 'vitest'

import {
  normalizeTmdbExternalIds,
  normalizeTmdbSearch,
  normalizeTmdbSeason,
  normalizeTmdbShow
} from '../../src/providers/tmdb/normalize.js'
import {
  tmdbExternalIdsFixture,
  tmdbSearchFixture,
  tmdbSeasonFixture,
  tmdbShowFixture
} from '../fixtures/tmdb.js'

describe('tmdb normalization', () => {
  it('normalizes search results', () => {
    expect(normalizeTmdbSearch(tmdbSearchFixture)).toEqual([
      {
        id: 'tmdb:1438',
        title: 'The Wire',
        year: '2002',
        plot: 'The Baltimore drug war through detectives and dealers.',
        poster: 'https://image.tmdb.org/t/p/w780/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
        totalSeasons: 0,
        genres: [],
        ratings: [{ source: 'tmdb', rating: 8.6, votes: 2000 }],
        externalIds: {}
      }
    ])
  })

  it('normalizes show details and external ids', () => {
    expect(
      normalizeTmdbShow(tmdbShowFixture, normalizeTmdbExternalIds(tmdbExternalIdsFixture))
    ).toEqual({
      id: 'tmdb:1438',
      title: 'The Wire',
      year: '2002',
      plot: 'The Baltimore drug war through detectives and dealers.',
      poster: 'https://image.tmdb.org/t/p/w780/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
      totalSeasons: 1,
      genres: ['Crime', 'Drama'],
      ratings: [{ source: 'tmdb', rating: 8.6, votes: 2000 }],
      externalIds: { imdb: 'tt0306414', tmdb: 1438 }
    })
  })

  it('normalizes seasons and uses episode still_path instead of the season object', () => {
    expect(normalizeTmdbSeason(tmdbSeasonFixture)).toEqual({
      number: 1,
      title: 'Season 1',
      episodes: [
        {
          id: 'tmdb:episode:66452',
          title: 'The Target',
          plot: 'McNulty gets pulled into a new detail.',
          season: 1,
          episode: 1,
          date: '2002-06-02',
          ratings: [{ source: 'tmdb', rating: 8.4, votes: 120 }],
          poster: 'https://image.tmdb.org/t/p/w780/tmdb-target.jpg',
          sourceIds: { tmdb: '66452' }
        },
        {
          id: 'tmdb:episode:66453',
          title: 'The Detail',
          plot: 'The unit starts to organize its surveillance.',
          season: 1,
          episode: 2,
          date: '2002-06-09',
          ratings: [{ source: 'tmdb', rating: 8.0, votes: 110 }],
          poster: 'https://image.tmdb.org/t/p/w780/tmdb-detail.jpg',
          sourceIds: { tmdb: '66453' }
        },
        {
          id: 'tmdb:episode:66454',
          title: 'The Buys',
          plot: 'The detail starts buying street product.',
          season: 1,
          episode: 3,
          date: '2002-06-16',
          ratings: [{ source: 'tmdb', rating: 8.5, votes: 100 }],
          poster: 'https://image.tmdb.org/t/p/w780/tmdb-buys.jpg',
          sourceIds: { tmdb: '66454' }
        }
      ]
    })
  })
})
