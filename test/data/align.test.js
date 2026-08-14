import { describe, expect, it } from 'vitest'

import {
  alignSupplementalRecord,
  normalizeEpisodeTitle,
  parseEpisodeTitle
} from '../../src/data/align.js'

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

  it.each([
    ['Bargaining (1)', 'bargaining', 1],
    ['Bargaining - Part 1', 'bargaining', 1],
    ['Bargaining: Part I', 'bargaining', 1],
    ['Bargaining, Part Two', 'bargaining', 2],
    ['Bargaining Pt. 3', 'bargaining', 3]
  ])('parses explicit part markers in %s', (title, base, part) => {
    expect(parseEpisodeTitle(title)).toMatchObject({ base, part, titled: true })
  })

  it.each([
    'The One with Two Parts',
    'Episode #2.2',
    'Live Free or Die Hard 4',
    'Class of 1999 (2019)',
    'Chapter Two: The Weirdo on Maple Street'
  ])('does not treat ordinary title text as a part marker in %s', (title) => {
    expect(parseEpisodeTitle(title).part).toBeNull()
  })

  it('does not expose an empty base for titles made entirely from a part marker', () => {
    expect(parseEpisodeTitle('Part Two')).toMatchObject({
      base: 'part two',
      part: 2,
      titled: false
    })
  })
})

describe('cross-provider episode alignment', () => {
  it('realigns shifted episodes by identity evidence without trusting their numbers', () => {
    const primary = [
      season(2, [
        episode(
          'tvmaze',
          'p1',
          2,
          1,
          'Everything Is Great! Part 1',
          '2017-09-20'
        ),
        episode(
          'tvmaze',
          'p2',
          2,
          2,
          'Everything Is Great! Part 2',
          '2017-09-20'
        ),
        episode(
          'tvmaze',
          'dance',
          2,
          3,
          'Dance Dance Resolution',
          '2017-09-28'
        ),
        episode('tvmaze', 'finale', 2, 13, 'Somewhere Else', '2018-02-01')
      ])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [
        season(2, [
          episode(
            'omdb',
            'combined',
            2,
            1,
            'Everything Is Great!',
            '2017-09-20'
          ),
          episode(
            'omdb',
            'dance',
            2,
            2,
            'Dance Dance Resolution',
            '2017-09-28',
            8.2
          ),
          episode('omdb', 'duplicate', 2, 2, 'Episode #2.2', null, null),
          episode('omdb', 'finale', 2, 12, 'Somewhere Else', '2018-02-01', 8.8)
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(
      alignment.matches.get('tvmaze:episode:dance')?.supplementalEpisode.id
    ).toBe('omdb:episode:dance')
    expect(
      alignment.matches.get('tvmaze:episode:finale')?.supplementalEpisode.id
    ).toBe('omdb:episode:finale')
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
          primary: expect.objectContaining({
            episode: 2,
            title: 'Everything Is Great! Part 2'
          })
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
      season(1, [
        episode('tvmaze', 'one', 1, 1, 'Localized title', '2020-01-01')
      ])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [
        season(1, [
          episode('omdb', 'one', 1, 9, 'Original title', '2020-01-01')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:one')).toMatchObject({
      strategy: 'date',
      confidence: 'moderate',
      evidence: { title: 'none', part: 'absent', date: 'exact' }
    })
  })

  it('matches unique base titles when one provider decorates a same-date premiere with parts', () => {
    const primary = [
      season(1, [
        episode(
          'tvmaze',
          'hellmouth',
          1,
          1,
          'Welcome to the Hellmouth',
          '1997-03-10'
        ),
        episode('tvmaze', 'harvest', 1, 2, 'The Harvest', '1997-03-10')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(1, [
          episode(
            'tmdb',
            'hellmouth',
            1,
            1,
            'Welcome to the Hellmouth (1)',
            '1997-03-10'
          ),
          episode('tmdb', 'harvest', 1, 2, 'The Harvest (2)', '1997-03-10')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:hellmouth')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:hellmouth' },
      strategy: 'base-title-date',
      confidence: 'strong',
      evidence: { title: 'base', part: 'ignored', date: 'exact' }
    })
    expect(alignment.matches.get('tvmaze:episode:harvest')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:harvest' },
      strategy: 'base-title-date',
      confidence: 'strong'
    })
    expect(
      alignment.report.entries.some((entry) => entry.type === 'ambiguous')
    ).toBe(false)
  })

  it('matches same-date multipart titles by their explicit part markers', () => {
    const primary = [
      season(6, [
        episode('tvmaze', 'one', 6, 1, 'Bargaining - Part 1', '2001-10-02'),
        episode('tvmaze', 'two', 6, 2, 'Bargaining - Part 2', '2001-10-02')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(6, [
          episode('tmdb', 'one', 6, 1, 'Bargaining (1)', '2001-10-02'),
          episode('tmdb', 'two', 6, 2, 'Bargaining (2)', '2001-10-02')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:one')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:one' },
      strategy: 'part-title-date',
      confidence: 'strong',
      evidence: { title: 'base', part: 'exact', date: 'exact' }
    })
    expect(alignment.matches.get('tvmaze:episode:two')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:two' },
      strategy: 'part-title-date',
      confidence: 'strong'
    })
  })

  it('matches multipart titles by base and part when provider air dates disagree', () => {
    const primary = [
      season(1, [
        episode('tvmaze', 'one', 1, 1, 'Story - Part 1', '2020-01-01'),
        episode('tvmaze', 'two', 1, 2, 'Story - Part 2', '2020-01-08')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(1, [
          episode('tmdb', 'one', 1, 1, 'Story (1)', '2019-12-01'),
          episode('tmdb', 'two', 1, 2, 'Story (2)', '2019-12-08')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:one')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:one' },
      strategy: 'part-title',
      confidence: 'strong',
      evidence: { title: 'base', part: 'exact', date: 'none' }
    })
    expect(alignment.matches.get('tvmaze:episode:two')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:two' },
      strategy: 'part-title',
      confidence: 'strong'
    })
  })

  it('never matches explicitly conflicting part numbers through a weaker strategy', () => {
    const primary = [
      season(1, [
        episode('tvmaze', 'conflict', 1, 1, 'Story - Part 1', '2020-01-01'),
        episode('tvmaze', 'clean', 1, 2, 'Clean Match', '2020-01-02')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(1, [
          episode('tmdb', 'conflict', 1, 1, 'Story (2)', '2020-01-01'),
          episode('tmdb', 'clean', 1, 2, 'Clean Match', '2020-01-02')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.has('tvmaze:episode:conflict')).toBe(false)
    expect(
      alignment.matches.get('tvmaze:episode:clean')?.supplementalEpisode.id
    ).toBe('tmdb:episode:clean')
    expect(alignment.report.entries).toContainEqual(
      expect.objectContaining({
        type: 'ambiguous',
        primary: expect.objectContaining({ id: 'tvmaze:episode:conflict' })
      })
    )
  })

  it('keeps split-versus-combined episodes unmatched', () => {
    const primary = [
      season(1, [
        episode('tvmaze', 'one', 1, 1, 'Fun Run (1)', '2020-01-01'),
        episode('tvmaze', 'two', 1, 2, 'Fun Run (2)', '2020-01-01')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(1, [episode('tmdb', 'combined', 1, 1, 'Fun Run', '2020-01-01')])
      ]
    }

    expect(alignSupplementalRecord(primary, supplemental).matches.size).toBe(0)
  })

  it('consumes an exact title before a broader base-title group can claim it', () => {
    const primary = [
      season(1, [
        episode('tvmaze', 'exact', 1, 1, 'The Test', '2020-01-01'),
        episode('tvmaze', 'part', 1, 2, 'The Test (2)', '2020-01-01')
      ])
    ]
    const supplemental = {
      provider: 'tmdb',
      seasons: [
        season(1, [episode('tmdb', 'exact', 1, 1, 'The Test', '2020-01-01')])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.get('tvmaze:episode:exact')).toMatchObject({
      supplementalEpisode: { id: 'tmdb:episode:exact' },
      strategy: 'title-date'
    })
    expect(alignment.matches.has('tvmaze:episode:part')).toBe(false)
  })

  it('never aligns episodes across season boundaries', () => {
    const primary = [
      season(1, [
        episode('tvmaze', 'one', 1, 1, 'A Shared Title', '2020-01-01')
      ])
    ]
    const supplemental = {
      provider: 'omdb',
      seasons: [
        season(2, [
          episode('omdb', 'one', 2, 1, 'A Shared Title', '2020-01-01')
        ])
      ]
    }

    const alignment = alignSupplementalRecord(primary, supplemental)

    expect(alignment.matches.size).toBe(0)
    expect(alignment.report.entries.map((entry) => entry.type)).toEqual([
      'unmatched_primary',
      'unmatched_supplemental'
    ])
  })
})
