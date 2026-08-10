import { describe, expect, it } from 'vitest'

import { alignSupplementalRecord, normalizeEpisodeTitle } from '../../src/data/align.js'

function episode(provider, id, season, number, title, date, rating = 8) {
  return {
    id: `${provider}:episode:${id}`,
    title,
    plot: null,
    season,
    episode: number,
    date,
    ratings: [{ source: provider, rating, votes: null }],
    poster: null,
    sourceIds: { [provider]: id }
  }
}

function season(number, episodes) {
  return { number, title: `Season ${number}`, episodes }
}

describe('episode title normalization', () => {
  it('normalizes punctuation, accents, ampersands, and whitespace deterministically', () => {
    expect(normalizeEpisodeTitle('  L’Épisode — Rock & Roll! ')).toBe(
      'lepisode rock and roll'
    )
  })
})

describe('cross-provider episode alignment', () => {
  it('realigns shifted episodes by identity evidence without trusting their numbers', () => {
    const primary = [
      season(2, [
        episode('tvmaze', 'p1', 2, 1, 'Everything Is Great! Part 1', '2017-09-20'),
        episode('tvmaze', 'p2', 2, 2, 'Everything Is Great! Part 2', '2017-09-20'),
        episode('tvmaze', 'dance', 2, 3, 'Dance Dance Resolution', '2017-09-28'),
        episode('tvmaze', 'finale', 2, 13, 'Somewhere Else', '2018-02-01')
      ])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [
        season(2, [
          episode('omdb', 'combined', 2, 1, 'Everything Is Great!', '2017-09-20'),
          episode('omdb', 'dance', 2, 2, 'Dance Dance Resolution', '2017-09-28', 8.2),
          episode('omdb', 'duplicate', 2, 2, 'Episode #2.2', null, null),
          episode('omdb', 'finale', 2, 12, 'Somewhere Else', '2018-02-01', 8.8)
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:dance')?.supplementalEpisode.id).toBe(
      'omdb:episode:dance'
    )
    expect(alignment.matches.get('tvmaze:episode:finale')?.supplementalEpisode.id).toBe(
      'omdb:episode:finale'
    )
    expect(alignment.matches.has('tvmaze:episode:p1')).toBe(false)
    expect(alignment.matches.has('tvmaze:episode:p2')).toBe(false)
    expect(alignment.report.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'matched',
          strategy: 'title-date',
          primary: expect.objectContaining({ episode: 3 }),
          supplemental: expect.objectContaining({ episode: 2 })
        }),
        expect.objectContaining({
          type: 'ambiguous',
          primary: expect.objectContaining({ episode: 2, title: 'Everything Is Great! Part 2' })
        }),
        expect.objectContaining({
          type: 'unmatched_supplemental',
          supplemental: expect.objectContaining({ title: 'Episode #2.2' })
        })
      ])
    )
  })

  it('rejects ambiguous evidence instead of choosing by input order', () => {
    const primary = [
      season(1, [episode('tvmaze', 'one', 1, 1, 'Pilot', '2020-01-01')])
    ]
    const candidates = [
      episode('omdb', 'b', 1, 2, 'Pilot', '2020-01-01'),
      episode('omdb', 'a', 1, 1, 'Pilot', '2020-01-01')
    ]

    const first = alignSupplementalRecord(primary, {
      provider: 'omdb',
      seasons: [season(1, candidates)]
    })
    const shuffled = alignSupplementalRecord(primary, {
      provider: 'omdb',
      seasons: [season(1, [...candidates].reverse())]
    })

    expect(first.matches.size).toBe(0)
    expect(first.report.entries).toContainEqual(
      expect.objectContaining({ type: 'ambiguous' })
    )
    expect(shuffled.report).toEqual(first.report)
  })

  it('uses a unique exact date only after stronger title evidence is exhausted', () => {
    const primary = [
      season(1, [episode('tvmaze', 'one', 1, 1, 'Localized title', '2020-01-01')])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [season(1, [episode('omdb', 'one', 1, 9, 'Original title', '2020-01-01')])]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:one')).toMatchObject({
      strategy: 'date',
      confidence: 'moderate'
    })
  })

  it('never aligns episodes across season boundaries', () => {
    const primary = [
      season(1, [episode('tvmaze', 'one', 1, 1, 'A Shared Title', '2020-01-01')])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [season(2, [episode('omdb', 'one', 2, 1, 'A Shared Title', '2020-01-01')])]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.size).toBe(0)
    expect(alignment.report.entries.map((entry) => entry.type)).toEqual([
      'unmatched_primary',
      'unmatched_supplemental'
    ])
  })
})
