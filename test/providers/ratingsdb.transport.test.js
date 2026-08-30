import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearApiCache } from '../../src/data/apiCache.js'

vi.mock('../../src/config/ratingsdb.js', () => ({
  getRatingsdbApiBase: () => 'https://ratings.example'
}))

import {
  clearBundleMemo,
  getBundleMemoSize,
  memoizeBundle,
  readMemoizedBundle
} from '../../src/providers/ratingsdb/bundleMemo.js'
import {
  getSeasons,
  getShow,
  loadRatingsdbBundle,
  resolveShowRef
} from '../../src/providers/ratingsdb/transport.js'

const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'ratingsdb')

function readBundle(name = 'short-series') {
  return JSON.parse(
    readFileSync(join(fixtureDirectory, `${name}.json`), 'utf8')
  )
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

function oversizedBundle() {
  const bundle = readBundle()
  const template = bundle.seasons[0].episodes[0]
  bundle.seasons[0].episodes = Array.from({ length: 600 }, (_, index) => ({
    ...template,
    id: `tt${String(9_100_000 + index)}`,
    title: `Episode ${index + 1}`,
    plot: `${index}:`.padEnd(4_096, 'x')
  }))
  bundle.stats.episodes = bundle.seasons[0].episodes.length
  return bundle
}

beforeEach(async () => {
  clearBundleMemo()
  await clearApiCache()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  clearBundleMemo()
  await clearApiCache()
})

describe('RatingsDB bundle transport', () => {
  it('loads a show and its seasons through one chart request', async () => {
    const bundle = readBundle()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(bundle))
    vi.stubGlobal('fetch', fetchMock)

    const show = await getShow('tt9000001')
    const result = await getSeasons('tt9000001', show.totalSeasons)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ratings.example/api/v1/series/tt9000001/chart'
    )
    expect(show.id).toBe('ratingsdb:tt9000001')
    expect(result.seasons).toHaveLength(1)
    expect(result).not.toHaveProperty('diagnostics')
    expect(result.meta).toMatchObject({
      provider: 'ratingsdb',
      incomplete: false,
      sources: expect.arrayContaining([
        expect.objectContaining({ provider: 'ratingsdb', source: 'imdb' })
      ])
    })
  })

  it('memoizes an oversized bundle that the API cache declines', async () => {
    const bundle = oversizedBundle()
    expect(
      new TextEncoder().encode(JSON.stringify(bundle)).byteLength
    ).toBeGreaterThan(2 * 1024 * 1024)
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(bundle)))
    vi.stubGlobal('fetch', fetchMock)

    const show = await getShow('tt9000001')
    const result = await getSeasons('tt9000001', show.totalSeasons)

    expect(result.seasons[0].episodes).toHaveLength(600)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clearBundleMemo()
    await getShow('tt9000001')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('shares a concurrent show and seasons request through the API cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readBundle()))
    vi.stubGlobal('fetch', fetchMock)

    await Promise.all([getShow('tt9000001'), getSeasons('tt9000001', 1)])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores the legacy totalSeasons argument', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(readBundle()))
    )

    const expected = await getSeasons('tt9000001')
    const actual = await getSeasons('tt9000001', 42)

    expect(actual).toStrictEqual(expected)
  })

  it('does not cache or suppress a pending response', async () => {
    const pending = {
      error: 'Hydration is pending',
      code: 'hydration_pending',
      degradation: {
        capability: 'hydration',
        reason: 'request_budget_exhausted'
      }
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pending, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(readBundle()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      name: 'RatingsdbPendingError',
      provider: 'ratingsdb',
      code: 'hydration_pending',
      capability: 'hydration',
      reason: 'request_budget_exhausted',
      retryAfterMs: null
    })
    await expect(getShow('tt9000001')).resolves.toMatchObject({
      id: 'ratingsdb:tt9000001'
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves an HTTP failure status', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { error: 'Not found', code: 'not_found' },
            { status: 404 }
          )
        )
    )

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      status: 404,
      provider: 'ratingsdb'
    })
  })

  it.each(['', 'nope', 'tt', '../evil', 'imdb:tt1/../x', 'trakt:the-wire'])(
    'rejects invalid series reference %j before fetching',
    async (ref) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await expect(getShow(ref)).rejects.toThrow(
        `Invalid RatingsDB series reference: ${ref}`
      )
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('encodes a supported alias reference as one path segment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readBundle()))
    vi.stubGlobal('fetch', fetchMock)

    await getShow('tvmaze:169')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ratings.example/api/v1/series/tvmaze%3A169/chart'
    )
  })

  it('does not memoize an aborted load', async () => {
    const fetchMock = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          )
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    const load = getShow('tt9000001', { signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(load).rejects.toMatchObject({ name: 'AbortError' })
    expect(getBundleMemoSize()).toBe(0)
  })

  it('does not serve a warm memo to an already-aborted caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readBundle()))
    vi.stubGlobal('fetch', fetchMock)
    await getShow('tt9000001')
    const controller = new AbortController()
    controller.abort()

    await expect(
      getShow('tt9000001', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolves only a bare IMDb tconst without making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveShowRef({ externalIds: { imdb: 'tt9000001' } })
    ).resolves.toBe('ratingsdb:tt9000001')
    await expect(resolveShowRef({ externalIds: {} })).resolves.toBeNull()
    await expect(
      resolveShowRef({ externalIds: { imdb: 'javascript:alert(1)' } })
    ).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes bundle-only metadata to orchestration', async () => {
    const bundle = readBundle('cold')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(bundle)))

    await expect(loadRatingsdbBundle('tt9000001')).resolves.toMatchObject({
      meta: {
        contentVersion: bundle.contentVersion,
        generatedAt: bundle.generatedAt,
        scoringProfile: bundle.scoringProfile,
        incomplete: true,
        stats: bundle.stats
      }
    })
  })
})

describe('RatingsDB bundle memo', () => {
  it('keeps eight raw bundles and refreshes recency on read', () => {
    for (let index = 1; index <= 8; index += 1) {
      memoizeBundle(`tt${index}`, { index })
    }

    expect(readMemoizedBundle('tt1')).toStrictEqual({ index: 1 })
    memoizeBundle('tt9', { index: 9 })

    expect(getBundleMemoSize()).toBe(8)
    expect(readMemoizedBundle('tt1')).toStrictEqual({ index: 1 })
    expect(readMemoizedBundle('tt2')).toBeUndefined()
    expect(readMemoizedBundle('tt9')).toStrictEqual({ index: 9 })
  })
})
