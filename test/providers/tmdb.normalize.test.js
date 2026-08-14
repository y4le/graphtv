import { describe, expect, it } from 'vitest'

import {
  normalizeTmdbCollection,
  normalizeTmdbExternalIds,
  normalizeTmdbSearch,
  normalizeTmdbSeason,
  normalizeTmdbShow
} from '../../src/providers/tmdb/normalize.js'
import {
  tmdbCollectionFixture,
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
        poster:
          'https://image.tmdb.org/t/p/w780/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
        totalSeasons: 0,
        genres: [],
        ratings: [{ source: 'tmdb', rating: 8.6, votes: 2000 }],
        externalIds: {}
      }
    ])
  })

  it('normalizes collection cards with compact artwork and content filters', () => {
    expect(normalizeTmdbCollection(tmdbCollectionFixture)).toEqual([
      expect.objectContaining({
        id: 'tmdb:108978',
        title: 'Reacher',
        year: '2022',
        poster: 'https://image.tmdb.org/t/p/w342/reacher.jpg'
      }),
      expect.objectContaining({
        id: 'tmdb:222',
        title: 'New Show',
        poster: 'https://image.tmdb.org/t/p/w342/new-show.jpg'
      })
    ])
  })

  it('applies the popular vote threshold before limiting results', () => {
    const results = Array.from({ length: 23 }, (_, index) => ({
      id: index,
      name: `Show ${index}`,
      first_air_date: '2020-01-01',
      poster_path: `/show-${index}.jpg`,
      vote_average: 7,
      vote_count: index < 3 ? 1 : 100,
      adult: false
    }))

    const normalized = normalizeTmdbCollection(
      { results },
      { minVotes: 50, limit: 20 }
    )

    expect(normalized).toHaveLength(20)
    expect(normalized[0].id).toBe('tmdb:3')
    expect(normalized.at(-1).id).toBe('tmdb:22')
  })

  it('normalizes show details and external ids', () => {
    expect(
      normalizeTmdbShow(
        tmdbShowFixture,
        normalizeTmdbExternalIds(tmdbExternalIdsFixture)
      )
    ).toEqual({
      id: 'tmdb:1438',
      title: 'The Wire',
      year: '2002',
      plot: 'The Baltimore drug war through detectives and dealers.',
      poster: 'https://image.tmdb.org/t/p/w780/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
      totalSeasons: 1,
      genres: ['Crime', 'Drama'],
      ratings: [{ source: 'tmdb', rating: 8.6, votes: 2000 }],
      externalIds: { imdb: 'tt0306414', tmdb: 1438, tvdb: 79126 }
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

  it('normalizes TMDB zero-rating sentinels as missing ratings', () => {
    const season = normalizeTmdbSeason({
      season_number: 1,
      episodes: [
        {
          id: 99,
          name: 'Unrated episode',
          season_number: 1,
          episode_number: 1,
          vote_average: 0,
          vote_count: 0
        }
      ]
    })

    expect(season.episodes[0].ratings).toEqual([
      { source: 'tmdb', rating: null, votes: 0 }
    ])
  })
})
