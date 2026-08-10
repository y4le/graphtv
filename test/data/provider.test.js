import { describe, expect, it } from 'vitest'

import { getProviderLabel, getShowBundle, parseShowRef } from '../../src/data/provider.js'

function createShow(id, externalIds = {}) {
  return {
    id,
    title: 'Example',
    year: '2020',
    plot: null,
    poster: null,
    totalSeasons: 2,
    genres: [],
    ratings: [],
    externalIds
  }
}

describe('data/provider', () => {
  it('parses show refs into provider and id parts', () => {
    expect(parseShowRef('tvmaze:179')).toEqual({
      provider: 'tvmaze',
      id: '179'
    })
  })

  it('throws on invalid refs', () => {
    expect(() => parseShowRef('not-valid')).toThrow('Invalid show reference')
  })

  it('returns friendly provider labels', () => {
    expect(getProviderLabel('tvmaze')).toBe('TVmaze')
    expect(getProviderLabel('unknown')).toBe('unknown')
  })

  it('threads supplemental partial-season diagnostics into the show bundle', async () => {
    const providers = {
      tvmaze: {
        getShow: async () => createShow('tvmaze:1', { imdb: 'tt123' }),
        getSeasons: async () => []
      },
      omdb: {
        resolveShowRef: async () => 'omdb:tt123',
        getShow: async () => createShow('omdb:tt123', { imdb: 'tt123' }),
        getSeasons: async () => ({
          seasons: [{ number: 1, title: 'Season 1', episodes: [] }],
          diagnostics: {
            requested: 2,
            loaded: 1,
            failures: [{ season: 2, reason: 'network failure' }]
          }
        })
      }
    }
    const bundle = await getShowBundle('tvmaze:1', {
      compareProviders: ['omdb'],
      providerLoader: async (provider) => providers[provider]
    })

    expect(bundle.providerDiagnostics[0]).toMatchObject({
      provider: 'omdb',
      role: 'supplemental',
      status: 'loaded',
      seasonDiagnostics: {
        failures: [{ season: 2, reason: 'network failure' }]
      }
    })
  })

  it('threads structured season diagnostics for the primary provider', async () => {
    const diagnostics = { requested: 2, loaded: 1, failures: [] }
    const bundle = await getShowBundle('omdb:tt123', {
      compareProviders: [],
      providerLoader: async () => ({
        getShow: async () => createShow('omdb:tt123', { imdb: 'tt123' }),
        getSeasons: async () => ({
          seasons: [{ number: 1, title: 'Season 1', episodes: [] }],
          diagnostics
        })
      })
    })

    expect(bundle.providerDiagnostics).toEqual([
      {
        provider: 'omdb',
        role: 'primary',
        status: 'loaded',
        seasonDiagnostics: diagnostics
      }
    ])
  })

  it('rejects malformed season transport results at the provider boundary', async () => {
    await expect(
      getShowBundle('tvmaze:1', {
        compareProviders: [],
        providerLoader: async () => ({
          getShow: async () => createShow('tvmaze:1'),
          getSeasons: async () => undefined
        })
      })
    ).rejects.toThrow('invalid season data')
  })
})
