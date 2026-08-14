import { describe, expect, it } from 'vitest'

import {
  getProviderLabel,
  getShowBundle,
  parseShowRef,
  streamShowBundle
} from '../../src/data/provider.js'

function createShow(id, externalIds = {}, overrides = {}) {
  return {
    id,
    title: 'Example',
    year: '2020',
    plot: null,
    poster: null,
    totalSeasons: 2,
    genres: [],
    ratings: [],
    externalIds,
    ...overrides
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

  it('preserves actionable supplemental provider failure diagnostics', async () => {
    const failure = new TypeError('Load failed')
    failure.provider = 'omdb'
    failure.requestContext = {
      provider: 'omdb',
      kind: 'title',
      endpoint: 'https://www.omdbapi.com',
      crossOrigin: true
    }
    const providers = {
      tvmaze: {
        getShow: async () => createShow('tvmaze:1', { imdb: 'tt123' }),
        getSeasons: async () => []
      },
      omdb: {
        resolveShowRef: async () => 'omdb:tt123',
        getShow: async () => {
          throw failure
        }
      }
    }

    const bundle = await getShowBundle('tvmaze:1', {
      compareProviders: ['omdb'],
      providerLoader: async (provider) => providers[provider]
    })

    expect(bundle.providerDiagnostics[0]).toMatchObject({
      provider: 'omdb',
      status: 'failed',
      reason: 'Load failed',
      error: {
        category: 'opaque-network-failure',
        name: 'TypeError',
        message: 'Load failed',
        provider: 'omdb',
        operation: 'load-show',
        request: {
          kind: 'title',
          endpoint: 'https://www.omdbapi.com',
          crossOrigin: true
        },
        environment: {
          online: true
        }
      }
    })
    expect(bundle.providerDiagnostics[0].error.hint).toContain(
      'content blockers'
    )
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

  it('streams show metadata, primary episodes, and supplemental providers as they settle', async () => {
    let resolveSlowSeasons
    const slowSeasons = new Promise((resolve) => {
      resolveSlowSeasons = resolve
    })
    const providers = {
      tvmaze: {
        getShow: async () => createShow('tvmaze:1', { imdb: 'tt123' }),
        getSeasons: async () => []
      },
      slow: {
        resolveShowRef: async () => 'slow:1',
        getShow: async () =>
          createShow(
            'slow:1',
            {},
            { ratings: [{ source: 'slow', rating: 7, votes: null }] }
          ),
        getSeasons: async () => slowSeasons
      },
      fast: {
        resolveShowRef: async () => 'fast:1',
        getShow: async () =>
          createShow(
            'fast:1',
            {},
            { ratings: [{ source: 'fast', rating: 8, votes: null }] }
          ),
        getSeasons: async () => []
      }
    }
    const progress = streamShowBundle('tvmaze:1', {
      compareProviders: ['slow', 'fast'],
      providerLoader: async (provider) => providers[provider]
    })

    const show = await progress.next()
    expect(show.value).toMatchObject({
      phase: 'show',
      show: { id: 'tvmaze:1' }
    })

    const primary = await progress.next()
    expect(primary.value).toMatchObject({
      phase: 'primary',
      complete: false,
      pendingProviders: ['slow', 'fast']
    })

    const fast = await progress.next()
    expect(fast.value).toMatchObject({
      phase: 'supplemental',
      provider: 'fast',
      complete: false,
      pendingProviders: ['slow']
    })
    expect(fast.value.bundle.show.ratings).toEqual([
      { source: 'fast', rating: 8, votes: null }
    ])

    resolveSlowSeasons([])
    const slow = await progress.next()
    expect(slow.value).toMatchObject({
      phase: 'supplemental',
      provider: 'slow',
      complete: true,
      pendingProviders: []
    })
    expect(
      slow.value.bundle.providerDiagnostics.map((item) => item.provider)
    ).toEqual(['slow', 'fast'])
    await expect(progress.next()).resolves.toMatchObject({ done: true })
  })
})
