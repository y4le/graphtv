import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearApiCache } from '../../src/data/apiCache.js'

vi.mock('../../src/config/ratingsdb.js', () => ({
  getRatingsdbApiBase: () => 'https://ratings.example'
}))

import {
  clearBundleMemo,
  getBundleMemoSize
} from '../../src/providers/ratingsdb/bundleMemo.js'
import {
  MAX_RETRY_AFTER_MS,
  getShow,
  parseRetryAfterMs,
  search
} from '../../src/providers/ratingsdb/transport.js'

const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'ratingsdb')
const fixedNow = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')

function readBundle() {
  return JSON.parse(
    readFileSync(join(fixtureDirectory, 'short-series.json'), 'utf8')
  )
}

function pendingBody() {
  return {
    error: 'Hydration is pending',
    code: 'hydration_pending',
    degradation: {
      capability: 'hydration',
      reason: 'request_budget_exhausted'
    }
  }
}

function pendingResponse({
  body = JSON.stringify(pendingBody()),
  retryAfter
} = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (retryAfter !== undefined) {
    headers['Retry-After'] = retryAfter
  }

  return new Response(body, { status: 202, headers })
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
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

describe('RatingsDB Retry-After parsing', () => {
  it.each([
    ['1', 1_000],
    ['5', 5_000],
    ['0', 0],
    ['86400', MAX_RETRY_AFTER_MS]
  ])('parses delta-seconds %j as %i ms', (header, expected) => {
    expect(parseRetryAfterMs(header, fixedNow)).toBe(expected)
  })

  it('parses HTTP dates relative to now and clamps their range', () => {
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:03 GMT', fixedNow)).toBe(
      3_000
    )
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:27:59 GMT', fixedNow)).toBe(0)
    expect(parseRetryAfterMs('Thu, 22 Oct 2015 07:28:00 GMT', fixedNow)).toBe(
      MAX_RETRY_AFTER_MS
    )
  })

  it.each([undefined, null, '', '   ', 'soon', '-5', '1.5', 12])(
    'rejects malformed Retry-After value %j',
    (header) => {
      expect(parseRetryAfterMs(header, fixedNow)).toBeNull()
    }
  )
})

describe('RatingsDB pending response decoding', () => {
  it('raises a typed pending error carrying the server delay', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pendingResponse({ retryAfter: '5' }))
    )

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      name: 'RatingsdbPendingError',
      provider: 'ratingsdb',
      code: 'hydration_pending',
      capability: 'hydration',
      reason: 'request_budget_exhausted',
      retryAfterMs: 5_000,
      pending: true,
      requestContext: {
        provider: 'ratingsdb',
        kind: 'bundle',
        endpoint: 'https://ratings.example'
      }
    })
    expect(getBundleMemoSize()).toBe(0)
  })

  it('reports no invented delay when Retry-After is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(pendingResponse()))

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      retryAfterMs: null,
      pending: true
    })
  })

  it('keeps an unparseable pending body typed and retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(pendingResponse({ body: '{', retryAfter: '5' }))
    )

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      name: 'RatingsdbPendingError',
      message: 'RatingsDB request is pending.',
      retryAfterMs: 5_000,
      pending: true
    })
  })

  it('refetches through two pending responses and then loads the bundle', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pendingResponse({ retryAfter: '1' }))
      .mockResolvedValueOnce(pendingResponse({ retryAfter: '5' }))
      .mockResolvedValueOnce(jsonResponse(readBundle()))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getShow('tt9000001')).rejects.toMatchObject({
      retryAfterMs: 1_000
    })
    await expect(getShow('tt9000001')).rejects.toMatchObject({
      retryAfterMs: 5_000
    })
    await expect(getShow('tt9000001')).resolves.toMatchObject({
      id: 'ratingsdb:tt9000001'
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('decodes a pending search but leaves retries to the caller', async () => {
    const searchResponse = {
      results: [
        {
          id: 'tt9000001',
          title: 'Contract Show',
          year: '2026',
          poster: null,
          genres: [],
          externalIds: { imdb: 'tt9000001' }
        }
      ]
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pendingResponse({ retryAfter: '1' }))
      .mockResolvedValueOnce(jsonResponse(searchResponse))
    vi.stubGlobal('fetch', fetchMock)

    await expect(search('contract')).rejects.toMatchObject({
      retryAfterMs: 1_000,
      pending: true
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(search('contract')).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('still cools down a genuine HTTP failure', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: 'Unavailable' }, 500))
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getShow('tt9000001')).rejects.toMatchObject({ status: 500 })
    await expect(getShow('tt9000001')).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
