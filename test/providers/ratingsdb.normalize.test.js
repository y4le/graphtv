import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isTrustedRating } from '../../src/data/stats.js'
import { normalizeRatingsdbBundle } from '../../src/providers/ratingsdb/normalize.js'

const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'ratingsdb')
const fixtureNames = [
  'cold',
  'invalid-ratings',
  'long-run',
  'rt-absent',
  'short-series',
  'specials',
  'split-parts',
  'unnumbered'
]
const fixtures = fixtureNames.map((name) => ({
  name,
  bundle: readBundle(name)
}))

function readBundle(name) {
  return JSON.parse(
    readFileSync(join(fixtureDirectory, `${name}.json`), 'utf8')
  )
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

function findEpisode(result, id) {
  return result.seasons
    .flatMap((season) => season.episodes)
    .find((episode) => episode.id === id)
}

describe('RatingsDB bundle normalization', () => {
  it.each(fixtures)('normalizes $name show fields 1:1', ({ bundle }) => {
    const { show } = normalizeRatingsdbBundle(bundle)

    expect(show).toMatchObject({
      ...bundle.show,
      id: `ratingsdb:${bundle.show.id}`
    })
    expect(show.ratings.map((rating) => rating.source)).toStrictEqual(
      bundle.show.ratings.map((rating) => rating.source)
    )
  })

  it.each(fixtures)(
    'preserves $name season and episode wire order',
    ({ bundle }) => {
      const { seasons } = normalizeRatingsdbBundle(bundle)

      expect(seasons.map((season) => season.number)).toStrictEqual(
        bundle.seasons.map((season) => season.number)
      )
      expect(seasons.map((season) => season.title)).toStrictEqual(
        bundle.seasons.map((season) => season.title)
      )

      for (const [seasonIndex, season] of seasons.entries()) {
        const wireEpisodes = bundle.seasons[seasonIndex].episodes
        expect(season.episodes.map((episode) => episode.id)).toStrictEqual(
          wireEpisodes.map((episode) => episode.id)
        )
        for (const [episodeIndex, episode] of season.episodes.entries()) {
          const wireEpisode = wireEpisodes[episodeIndex]
          expect(episode).toMatchObject({
            id: wireEpisode.id,
            title: wireEpisode.title,
            plot: wireEpisode.plot,
            season: wireEpisode.season,
            episode: wireEpisode.episode,
            date: wireEpisode.date,
            poster: wireEpisode.poster,
            sourceIds: wireEpisode.sourceIds
          })
          expect(episode.ratings.map((rating) => rating.source)).toStrictEqual(
            wireEpisode.ratings.map((rating) => rating.source)
          )
        }
      }
    }
  )

  it('keeps non-contiguous seasons, season zero, and a cold chart intact', () => {
    const longRun = normalizeRatingsdbBundle(readBundle('long-run'))
    const specials = normalizeRatingsdbBundle(readBundle('specials'))
    const cold = normalizeRatingsdbBundle(readBundle('cold'))

    expect(longRun.show).toMatchObject({ endYear: 2026, totalSeasons: 2 })
    expect(longRun.seasons.map((season) => season.number)).toStrictEqual([
      1, 12
    ])
    expect(longRun.seasons[1].title).toBe('Final season')
    expect(specials.show.totalSeasons).toBe(0)
    expect(specials.seasons).toMatchObject([{ number: 0, title: 'Specials' }])
    expect(cold).toMatchObject({
      show: { ratings: [] },
      seasons: [],
      meta: { incomplete: true, stats: { rated: {} } }
    })
  })

  it('preserves null votes, a true zero rating, metrics, and contributors', () => {
    const result = normalizeRatingsdbBundle(readBundle('invalid-ratings'))
    const ratings = findEpisode(result, 'tt9000004').ratings

    expect(ratings).toStrictEqual([
      { source: 'tmdb', rating: 5, votes: null },
      {
        source: 'rtCritics',
        rating: 0,
        votes: 1,
        metric: 'percentagePositive'
      },
      {
        source: 'combined',
        rating: 2.27,
        votes: null,
        contributors: ['tmdb', 'rtCritics']
      }
    ])
  })

  it('maps strong wire alignment onto trusted provenance', () => {
    const result = normalizeRatingsdbBundle(readBundle('split-parts'))
    const rating = findEpisode(result, 'tt9000002').ratings.find(
      (candidate) => candidate.source === 'tmdb'
    )

    expect(rating.provenance).toStrictEqual({
      providerEpisodeId: null,
      strategy: 'part-title-date',
      confidence: 'strong',
      evidence: { title: 'base', part: 'exact', date: 'exact' },
      relation: 'one-to-one'
    })
    expect(isTrustedRating(rating)).toBe(true)
  })

  it('uses a source id for provenance and tolerates omitted evidence', () => {
    const bundle = readBundle('short-series')
    const episode = bundle.seasons[0].episodes[0]
    episode.sourceIds.tmdb = 'tmdb-episode-1'
    episode.ratings[1].alignment = {
      strategy: 'external-id',
      confidence: 'strong'
    }

    const rating = findEpisode(normalizeRatingsdbBundle(bundle), episode.id)
      .ratings[1]

    expect(rating.provenance).toStrictEqual({
      providerEpisodeId: 'tmdb-episode-1',
      strategy: 'external-id',
      confidence: 'strong',
      evidence: null,
      relation: 'one-to-one'
    })
    expect(isTrustedRating(rating)).toBe(true)
  })

  it('does not invent provenance for unaligned ratings', () => {
    const result = normalizeRatingsdbBundle(readBundle('short-series'))

    for (const rating of [
      ...result.show.ratings,
      ...result.seasons.flatMap((season) =>
        season.episodes.flatMap((episode) => episode.ratings)
      )
    ]) {
      expect(Object.hasOwn(rating, 'provenance')).toBe(false)
    }
  })

  it.each([
    ['fresh', 'loaded'],
    ['stale', 'loaded'],
    ['computed', 'loaded'],
    ['failed', 'failed'],
    ['disabled', 'skipped'],
    ['redacted', 'skipped'],
    ['pending', 'pending'],
    ['future-status', 'skipped'],
    ['toString', 'skipped']
  ])('maps %s diagnostics to %s', (serverStatus, status) => {
    const bundle = readBundle('cold')
    bundle.providers = [
      { source: 'tmdb', status: serverStatus, contributed: false }
    ]

    expect(normalizeRatingsdbBundle(bundle).diagnostics).toStrictEqual([
      {
        provider: 'ratingsdb',
        role: 'source',
        source: 'tmdb',
        status,
        serverStatus,
        contributed: false,
        reason: null,
        lastSuccessAt: null,
        expiresAt: null
      }
    ])
  })

  it('preserves diagnostic details and bundle-only metadata', () => {
    const bundle = readBundle('cold')
    const result = normalizeRatingsdbBundle(bundle)

    expect(result.diagnostics[0]).toStrictEqual({
      provider: 'ratingsdb',
      role: 'source',
      source: 'tmdb',
      status: 'pending',
      serverStatus: 'pending',
      contributed: false,
      reason: 'not_attempted',
      lastSuccessAt: null,
      expiresAt: null
    })
    expect(result.meta).toStrictEqual({
      schemaVersion: bundle.schemaVersion,
      contentVersion: bundle.contentVersion,
      generatedAt: bundle.generatedAt,
      scoringProfile: bundle.scoringProfile,
      incomplete: bundle.incomplete,
      stats: bundle.stats
    })

    const invalid = normalizeRatingsdbBundle(readBundle('invalid-ratings'))
    const unnumbered = normalizeRatingsdbBundle(readBundle('unnumbered'))
    expect(invalid.meta).toMatchObject({
      incomplete: true,
      stats: { omittedUnnumbered: 1 }
    })
    expect(unnumbered.meta.stats.omittedUnnumbered).toBe(1)
  })

  it('is deterministic and does not mutate its input', () => {
    const bundle = readBundle('split-parts')
    const pristine = copy(bundle)

    expect(normalizeRatingsdbBundle(bundle)).toStrictEqual(
      normalizeRatingsdbBundle(bundle)
    )
    expect(bundle).toStrictEqual(pristine)
  })
})
