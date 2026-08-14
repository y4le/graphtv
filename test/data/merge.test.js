import { describe, expect, it } from 'vitest'

import { mergeShowRecords } from '../../src/data/merge.js'
import { isUsableProviderRating } from '../../src/data/stats.js'

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
          poster: 'tmdb-1.jpg',
          sourceIds: { tmdb: '66452' }
        },
        {
          id: 'tmdb:episode:66453',
          title: 'The Detail',
          plot: 'Episode two',
          season: 1,
          episode: 2,
          date: '2002-06-09',
          ratings: [{ source: 'tmdb', rating: 8.0, votes: 110 }],
          poster: 'tmdb-2.jpg',
          sourceIds: { tmdb: '66453' }
        },
        {
          id: 'tmdb:episode:66454',
          title: 'The Buys',
          plot: 'Episode three',
          season: 1,
          episode: 3,
          date: '2002-06-16',
          ratings: [{ source: 'tmdb', rating: 8.5, votes: 100 }],
          poster: 'tmdb-3.jpg',
          sourceIds: { tmdb: '66454' }
        },
        {
          id: 'tmdb:episode:66455',
          title: 'Old Cases',
          plot: 'Extra special',
          season: 1,
          episode: 4,
          date: '2002-06-23',
          ratings: [{ source: 'tmdb', rating: 7.9, votes: 90 }],
          poster: 'tmdb-4.jpg',
          sourceIds: { tmdb: '66455' }
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
      {
        source: 'tmdb',
        rating: 8.5,
        votes: 100,
        provenance: {
          providerEpisodeId: 'tmdb:episode:66454',
          strategy: 'title-date',
          confidence: 'strong',
          evidence: {
            title: 'exact',
            part: 'absent',
            date: 'exact'
          },
          relation: 'one-to-one'
        }
      }
    ])
    expect(merged.seasons[0].episodes[2].poster).toBe('tmdb-3.jpg')
    expect(merged.seasons[0].episodes[2].sourceIds).toEqual({
      tmdb: '66454'
    })
  })

  it('merges shifted provider numbering by episode identity evidence', () => {
    const shiftedRecord = {
      ...supplementalRecord,
      seasons: [
        {
          ...supplementalRecord.seasons[0],
          episodes: supplementalRecord.seasons[0].episodes
            .slice(0, 3)
            .map((episode) => ({
              ...episode,
              episode: episode.episode + 1
            }))
        }
      ]
    }

    const merged = mergeShowRecords(primaryRecord, [shiftedRecord])

    expect(
      merged.seasons[0].episodes.map(
        (episode) =>
          episode.ratings.find((rating) => rating.source === 'tmdb')?.provenance
            .providerEpisodeId
      )
    ).toEqual([
      'tmdb:episode:66452',
      'tmdb:episode:66453',
      'tmdb:episode:66454'
    ])
    expect(merged.alignment[0].entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'matched',
          primary: expect.objectContaining({ episode: 1 }),
          supplemental: expect.objectContaining({ episode: 2 })
        })
      ])
    )
  })

  it('trusts a unique same-date base-title match and preserves its evidence', () => {
    const decoratedRecord = structuredClone(supplementalRecord)
    decoratedRecord.seasons[0].episodes[0].title = 'The Target (1)'

    const merged = mergeShowRecords(primaryRecord, [decoratedRecord])
    const rating = merged.seasons[0].episodes[0].ratings.find(
      (item) => item.source === 'tmdb'
    )

    expect(rating.provenance).toEqual({
      providerEpisodeId: 'tmdb:episode:66452',
      strategy: 'base-title-date',
      confidence: 'strong',
      evidence: {
        title: 'base',
        part: 'ignored',
        date: 'exact'
      },
      relation: 'one-to-one'
    })
    expect(isUsableProviderRating(rating)).toBe(true)
  })

  it('captures episode mismatches for debug mode', () => {
    const merged = mergeShowRecords(primaryRecord, [supplementalRecord])

    expect(merged.mismatches).toEqual([
      {
        source: 'tmdb',
        type: 'unmatched_supplemental',
        supplemental: {
          id: 'tmdb:episode:66455',
          season: 1,
          episode: 4,
          title: 'Old Cases',
          date: '2002-06-23'
        }
      }
    ])
    expect(merged.alignmentIssues).toEqual([])
  })

  it('does not present ordinary provider coverage gaps as ambiguous alignment issues', () => {
    const missingSeasonRecord = {
      ...supplementalRecord,
      seasons: []
    }

    const merged = mergeShowRecords(primaryRecord, [missingSeasonRecord])

    expect(merged.mismatches).toHaveLength(3)
    expect(
      merged.mismatches.every((entry) => entry.type === 'unmatched_primary')
    ).toBe(true)
    expect(merged.alignmentIssues).toEqual([])
  })

  it('omits a supplemental source ID when no provider-native ID is available', () => {
    const recordWithoutNativeId = structuredClone(supplementalRecord)
    delete recordWithoutNativeId.seasons[0].episodes[0].sourceIds

    const merged = mergeShowRecords(primaryRecord, [recordWithoutNativeId])

    expect(merged.seasons[0].episodes[0].sourceIds).toEqual({})
  })
})
