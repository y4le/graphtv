import { describe, expect, it } from 'vitest'

import {
  ATTRIBUTION_BY_SOURCE,
  ATTRIBUTION_REVIEWED,
  ATTRIBUTION_SUBJECTS
} from '../../src/data/attribution.js'
import { RATING_PROVIDER_REGISTRY } from '../../src/data/ratingProviders.js'

describe('provider attribution registry', () => {
  it('maps every upstream rating source without inventing a computed source', () => {
    const upstreamSources = RATING_PROVIDER_REGISTRY.map(
      (provider) => provider.source
    ).filter((source) => source !== 'combined')

    expect(Object.keys(ATTRIBUTION_BY_SOURCE).sort()).toStrictEqual(
      upstreamSources.sort()
    )
    expect(ATTRIBUTION_BY_SOURCE).not.toHaveProperty('combined')
    expect(
      Object.values(ATTRIBUTION_BY_SOURCE).every(
        (subject) => ATTRIBUTION_SUBJECTS[subject]
      )
    ).toBe(true)
  })

  it('pins the reviewed notice boundary and keeps unresolved IMDb link-only', () => {
    expect(ATTRIBUTION_REVIEWED).toBe('2026-08-28')
    expect(
      Object.entries(ATTRIBUTION_SUBJECTS)
        .filter(([, descriptor]) => descriptor.notices.length > 0)
        .map(([subject]) => subject)
    ).toStrictEqual(['ratingsdb', 'tvmaze', 'tmdb', 'omdb'])
    expect(ATTRIBUTION_SUBJECTS.imdb.notices).toStrictEqual([])
    expect(ATTRIBUTION_SUBJECTS.trakt.notices).toStrictEqual([])
    expect(ATTRIBUTION_SUBJECTS.rottentomatoes.notices).toStrictEqual([])
    expect(ATTRIBUTION_SUBJECTS.metacritic.notices).toStrictEqual([])
  })

  it('keeps every descriptor immutable and displayable', () => {
    expect(Object.isFrozen(ATTRIBUTION_SUBJECTS)).toBe(true)
    expect(
      Object.values(ATTRIBUTION_SUBJECTS).every(
        (descriptor) =>
          Object.isFrozen(descriptor) && descriptor.name.length > 0
      )
    ).toBe(true)
  })
})
