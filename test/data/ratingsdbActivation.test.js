import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deployment = vi.hoisted(() => ({
  apiBase: 'https://ratings.example/base'
}))

vi.mock('../../src/config/ratingsdb.js', () => ({
  getRatingsdbApiBase: () => deployment.apiBase,
  isConfigured: () => deployment.apiBase !== null
}))

vi.mock('../../src/config/clientSecrets.js', () => ({
  CLIENT_SECRET_KEYS: {
    omdb: 'omdbApiKey',
    tmdb: 'tmdbBearerToken'
  },
  getClientSecret: () => 'test-key',
  hasClientSecret: () => true
}))

import { clearApiCache } from '../../src/data/apiCache.js'
import {
  getComparisonProviders,
  getProviderCatalog,
  getShowBundle,
  isProviderConfigured,
  loadProvider,
  searchShows
} from '../../src/data/provider.js'
import { SHOW_INDEX } from '../../src/data/showIndexData.js'
import { parseShowRef, resolveActiveShowRef } from '../../src/data/showRef.js'
import { buildShowLink } from '../../src/pages/search.js'
import {
  clearBundleMemo,
  getBundleMemoSize
} from '../../src/providers/ratingsdb/bundleMemo.js'

const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'ratingsdb')

function readBundle(name = 'short-series') {
  return JSON.parse(
    readFileSync(join(fixtureDirectory, `${name}.json`), 'utf8')
  )
}

function searchBody() {
  return {
    results: [
      {
        id: 'tt9000001',
        title: 'Contract Show',
        year: '2026',
        poster: null,
        genres: ['Drama'],
        externalIds: { imdb: 'tt9000001' }
      }
    ]
  }
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

let originalPath

beforeEach(async () => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  deployment.apiBase = 'https://ratings.example/base'
  clearBundleMemo()
  await clearApiCache()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', originalPath)
  clearBundleMemo()
  await clearApiCache()
})

describe('RatingsDB provider activation', () => {
  it('loads the registered provider with its complete transport surface', async () => {
    const provider = await loadProvider('ratingsdb')

    expect(provider).toEqual(
      expect.objectContaining({
        search: expect.any(Function),
        getShow: expect.any(Function),
        getSeasons: expect.any(Function),
        resolveShowRef: expect.any(Function)
      })
    )
  })

  it('gates configuration on the deployment API base', () => {
    expect(isProviderConfigured('ratingsdb')).toBe(true)

    deployment.apiBase = null
    expect(isProviderConfigured('ratingsdb')).toBe(false)
  })

  it('describes RatingsDB as a self-hosted provider', () => {
    expect(
      getProviderCatalog().find(({ provider }) => provider === 'ratingsdb')
    ).toStrictEqual({
      provider: 'ratingsdb',
      label: 'RatingsDB',
      configured: true,
      access: 'self-hosted',
      requirement: 'VITE_RATINGSDB_API_BASE'
    })
  })

  it('preserves legacy provider catalog metadata', () => {
    const catalog = getProviderCatalog()

    expect(catalog.find(({ provider }) => provider === 'tvmaze')).toStrictEqual(
      {
        provider: 'tvmaze',
        label: 'TVmaze',
        configured: true,
        access: 'public',
        requirement: 'none'
      }
    )
    expect(catalog.find(({ provider }) => provider === 'tmdb')).toStrictEqual({
      provider: 'tmdb',
      label: 'TMDB',
      configured: true,
      access: 'client-keyed',
      requirement: 'tmdbBearerToken'
    })
  })

  it('keeps standalone RatingsDB out of both comparison directions', () => {
    expect(getComparisonProviders('ratingsdb')).toStrictEqual([])
    expect(getComparisonProviders('tvmaze')).toStrictEqual(['omdb', 'tmdb'])
    expect(getComparisonProviders('omdb')).toStrictEqual(['tmdb', 'tvmaze'])

    deployment.apiBase = null
    expect(getComparisonProviders('tvmaze')).toStrictEqual(['omdb', 'tmdb'])
  })

  it('loads a whole series with one RatingsDB request and no legacy hosts', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(readBundle())))
    vi.stubGlobal('fetch', fetchMock)

    const bundle = await getShowBundle('ratingsdb:tt9000001')
    const urls = fetchMock.mock.calls.map(([url]) => String(url))

    expect(bundle).toMatchObject({
      primarySource: 'ratingsdb',
      show: { id: 'ratingsdb:tt9000001' }
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urls).toStrictEqual([
      'https://ratings.example/base/api/v1/series/tt9000001/chart'
    ])
    expect(
      urls.filter((url) =>
        /api\.tvmaze\.com|api\.themoviedb\.org|omdbapi\.com/u.test(url)
      )
    ).toStrictEqual([])
    expect(getBundleMemoSize()).toBe(1)
  })

  it('searches only the configured RatingsDB deployment', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(searchBody())))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchShows('the wire', 'ratingsdb')).resolves.toMatchObject([
      { id: 'ratingsdb:tt9000001', ratings: [] }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ratings.example/base/api/v1/search?q=the%20wire'
    )
  })

  it('fails closed without configuration and never falls back or fetches', async () => {
    deployment.apiBase = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getShowBundle('ratingsdb:tt9000001')).rejects.toThrow(
      'RatingsDB is not configured. Set VITE_RATINGSDB_API_BASE to enable it.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('RatingsDB show reference adoption', () => {
  it.each([
    ['omdb:tt0903747', 'ratingsdb:tt0903747'],
    ['imdb:tt0903747', 'ratingsdb:imdb:tt0903747'],
    ['tvmaze:169', 'ratingsdb:tvmaze:169'],
    ['tmdb:1396', 'ratingsdb:tmdb:1396'],
    ['ratingsdb:tt0903747', 'ratingsdb:tt0903747']
  ])('adopts %s under the RatingsDB flag', (input, expected) => {
    expect(resolveActiveShowRef(input, 'ratingsdb')).toBe(expected)
  })

  it('preserves references for the legacy active provider', () => {
    expect(resolveActiveShowRef('tvmaze:169', 'tvmaze')).toBe('tvmaze:169')
    expect(resolveActiveShowRef('omdb:tt0903747', 'tvmaze')).toBe(
      'omdb:tt0903747'
    )
  })

  it.each(['not-valid', 'trakt:the-wire', 'tvmaze:169/x'])(
    'leaves unusable reference %j alone',
    (showRef) => {
      expect(resolveActiveShowRef(showRef, 'ratingsdb')).toBe(showRef)
    }
  )

  it('round-trips an adopted alias through the shared show parser', () => {
    expect(
      parseShowRef(resolveActiveShowRef('tvmaze:169', 'ratingsdb'))
    ).toEqual({
      provider: 'ratingsdb',
      id: 'tvmaze:169'
    })
  })
})

describe('RatingsDB show links', () => {
  it('pins every landing-index row to the expected legacy source family', () => {
    const ids = SHOW_INDEX.sections.flatMap(({ rows }) =>
      rows.map(({ id }) => id)
    )

    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((id) => id.startsWith('tvmaze:'))).toBe(true)
  })

  it('adopts a landing ref and preserves the active provider and query', () => {
    window.history.replaceState({}, '', '/?api=ratingsdb&q=wire')

    const url = new URL(buildShowLink('tvmaze:169'))

    expect(url.searchParams.get('show')).toBe('ratingsdb:tvmaze:169')
    expect(url.searchParams.get('api')).toBe('ratingsdb')
    expect(url.searchParams.get('q')).toBe('wire')
  })

  it('keeps the legacy landing ref unchanged without the flag', () => {
    window.history.replaceState({}, '', '/?q=wire')

    const url = new URL(buildShowLink('tvmaze:169'))

    expect(url.searchParams.get('show')).toBe('tvmaze:169')
    expect(url.searchParams.has('api')).toBe(false)
    expect(url.searchParams.get('q')).toBe('wire')
  })

  it('adopts a ref while omitting a landing-only query', () => {
    window.history.replaceState({}, '', '/?api=ratingsdb&q=wire')

    const url = new URL(buildShowLink('tvmaze:169', { includeQuery: false }))

    expect(url.searchParams.get('show')).toBe('ratingsdb:tvmaze:169')
    expect(url.searchParams.get('api')).toBe('ratingsdb')
    expect(url.searchParams.has('q')).toBe(false)
  })
})
