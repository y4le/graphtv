import { describe, expect, it } from 'vitest'

import {
  normalizeOmdbSearch,
  normalizeOmdbSeason,
  normalizeOmdbShow,
  parseOmdbReleased
} from '../../src/providers/omdb/normalize.js'
import {
  omdbSearchFixture,
  omdbSeasonFixture,
  omdbShowFixture
} from '../fixtures/omdb.js'

describe('omdb normalization', () => {
  it('normalizes search results', () => {
    expect(normalizeOmdbSearch(omdbSearchFixture)).toEqual([
      {
        id: 'omdb:tt0306414',
        title: 'The Wire',
        year: '2002',
        plot: null,
        poster: 'https://m.media-amazon.com/images/M/the-wire.jpg',
        totalSeasons: 0,
        genres: [],
        ratings: [],
        externalIds: { imdb: 'tt0306414' }
      }
    ])
  })

  it('normalizes show details', () => {
    expect(normalizeOmdbShow(omdbShowFixture)).toEqual({
      id: 'omdb:tt0306414',
      title: 'The Wire',
      year: '2002',
      plot: 'The Baltimore drug war through detectives and dealers.',
      poster: 'https://m.media-amazon.com/images/M/the-wire.jpg',
      totalSeasons: 1,
      genres: ['Crime', 'Drama'],
      ratings: [{ source: 'omdb', rating: 9.3, votes: 382122 }],
      externalIds: { imdb: 'tt0306414' }
    })
  })

  it('normalizes season episodes', () => {
    expect(normalizeOmdbSeason(omdbSeasonFixture)).toEqual({
      number: 1,
      title: 'Season 1',
      episodes: [
        {
          id: 'omdb:episode:tt0739792',
          title: 'The Target',
          plot: null,
          season: 1,
          episode: 1,
          date: '2002-06-02',
          ratings: [
            {
              source: 'omdb',
              rating: 8.7,
              votes: 6512,
              votesStatus: 'loaded'
            }
          ],
          poster: null,
          sourceIds: { omdb: 'tt0739792' }
        },
        {
          id: 'omdb:episode:tt0739785',
          title: 'The Detail',
          plot: null,
          season: 1,
          episode: 2,
          date: '2002-06-09',
          ratings: [
            {
              source: 'omdb',
              rating: 8.5,
              votes: 6101,
              votesStatus: 'loaded'
            }
          ],
          poster: null,
          sourceIds: { omdb: 'tt0739785' }
        },
        {
          id: 'omdb:episode:tt0739781',
          title: 'The Buys',
          plot: null,
          season: 1,
          episode: 3,
          date: '2002-06-16',
          ratings: [
            {
              source: 'omdb',
              rating: 8.8,
              votes: 6031,
              votesStatus: 'loaded'
            }
          ],
          poster: null,
          sourceIds: { omdb: 'tt0739781' }
        }
      ]
    })
  })

  it('parses release dates without timezone-sensitive Date conversion', () => {
    expect(parseOmdbReleased('02 Jun 2002')).toBe('2002-06-02')
    expect(parseOmdbReleased('N/A')).toBeNull()
    expect(parseOmdbReleased('not a date')).toBeNull()
    expect(parseOmdbReleased(undefined)).toBeNull()
  })

  it('marks missing batch votes and N/A ratings explicitly', () => {
    const season = normalizeOmdbSeason({
      Season: '1',
      Episodes: [
        {
          Title: 'Mindy St. Claire',
          Released: '19 Jan 2017',
          Episode: '12',
          imdbRating: 'N/A',
          imdbVotes: 'N/A',
          imdbID: 'tt5884092'
        }
      ]
    })

    expect(season.episodes[0].ratings).toEqual([
      {
        source: 'omdb',
        rating: null,
        votes: null,
        votesStatus: 'unavailable'
      }
    ])
  })

  it('does not expose the OMDb N/A sentinel as a provider-native episode ID', () => {
    const season = normalizeOmdbSeason({
      Season: '1',
      Episodes: [
        {
          Title: 'Unknown episode',
          Released: 'N/A',
          Episode: '1',
          imdbRating: 'N/A',
          imdbVotes: 'N/A',
          imdbID: 'N/A'
        }
      ]
    })

    expect(season.episodes[0].sourceIds).toEqual({})
  })
})
