import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import Ajv2020Import from 'ajv/dist/2020.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clearApiCache } from '../../src/data/apiCache.js'

vi.mock('../../src/config/ratingsdb.js', () => ({
  getRatingsdbApiBase: () => 'https://ratings.example'
}))

import {
  normalizeRatingsdbCard,
  normalizeRatingsdbSearch
} from '../../src/providers/ratingsdb/normalize.js'
import {
  assertSeriesRef,
  isSeriesRef
} from '../../src/providers/ratingsdb/seriesRef.js'
import { search } from '../../src/providers/ratingsdb/transport.js'

const Ajv2020 = Ajv2020Import.default ?? Ajv2020Import
const searchSchema = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      'test',
      'fixtures',
      'ratingsdb',
      'schemas',
      'chart-search.v1.schema.json'
    ),
    'utf8'
  )
)
const validateSearchResponse = new Ajv2020({ strict: true }).compile(
  searchSchema
)

function card(overrides = {}) {
  return {
    id: 'tt9000001',
    title: 'Contract Show',
    year: '2026',
    poster: 'https://image.example/poster.jpg',
    genres: ['Drama', 'Mystery'],
    externalIds: { imdb: 'tt9000001', tmdb: '9001', tvmaze: '901' },
    ...overrides
  }
}

function validResponse(results, overrides = {}) {
  const body = { results, ...overrides }
  expect(validateSearchResponse(body), validateSearchResponse.errors).toBe(true)
  return body
}

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

beforeEach(async () => {
  await clearApiCache()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await clearApiCache()
})

describe('RatingsDB search normalization', () => {
  it('normalizes a contract card into a rating-free show', () => {
    const input = card()

    expect(normalizeRatingsdbCard(input)).toStrictEqual({
      id: 'ratingsdb:tt9000001',
      title: 'Contract Show',
      year: '2026',
      endYear: null,
      plot: null,
      poster: 'https://image.example/poster.jpg',
      totalSeasons: 0,
      genres: ['Drama', 'Mystery'],
      ratings: [],
      externalIds: { imdb: 'tt9000001', tmdb: '9001', tvmaze: '901' }
    })
  })

  it('preserves a provisional alias reference through the model id', () => {
    expect(
      normalizeRatingsdbCard(
        card({ id: 'tmdb:1396', externalIds: { tmdb: '1396' } })
      )
    ).toMatchObject({
      id: 'ratingsdb:tmdb:1396',
      externalIds: { tmdb: '1396' }
    })
  })

  it('drops a schema-valid card with an unusable reference', () => {
    const body = validResponse([card({ id: 'not a reference' }), card()])

    expect(normalizeRatingsdbSearch(body).map(({ id }) => id)).toStrictEqual([
      'ratingsdb:tt9000001'
    ])
  })

  it('drops a non-conformant card with an empty title', () => {
    const invalid = { results: [card({ title: '' })] }
    expect(validateSearchResponse(invalid)).toBe(false)

    expect(normalizeRatingsdbSearch(invalid)).toStrictEqual([])
  })

  it('defensively defaults optional model shapes', () => {
    expect(
      normalizeRatingsdbCard({
        id: 'tt9000001',
        title: 'Contract Show',
        year: null,
        poster: false,
        genres: null,
        externalIds: null
      })
    ).toMatchObject({
      year: '',
      poster: null,
      genres: [],
      externalIds: {},
      ratings: []
    })
  })
})

describe('RatingsDB search transport', () => {
  it('encodes the trimmed query and caches repeated results', async () => {
    const body = validResponse([card()])
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(body)))
    vi.stubGlobal('fetch', fetchMock)

    const first = await search('  the wire & more  ')
    const second = await search('the wire & more')

    expect(first).toStrictEqual(second)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ratings.example/api/v1/search?q=the%20wire%20%26%20more'
    )
  })

  it.each(['', '   '])(
    'returns no results for blank query %j without fetching',
    async (query) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await expect(search(query)).resolves.toStrictEqual([])
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('returns results when the response reports degradation', async () => {
    const body = validResponse([card()], {
      degradation: [
        {
          provider: 'tmdb',
          capability: 'search',
          reason: 'unavailable'
        }
      ]
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    await expect(search('contract')).resolves.toMatchObject([
      { id: 'ratingsdb:tt9000001' }
    ])
  })

  it('does not cache or suppress a pending response', async () => {
    const pending = {
      error: 'Search is pending',
      code: 'hydration_pending',
      degradation: {
        capability: 'hydration',
        reason: 'request_budget_exhausted'
      }
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(pending, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse(validResponse([card()])))
    vi.stubGlobal('fetch', fetchMock)

    await expect(search('contract')).rejects.toMatchObject({
      name: 'RatingsdbPendingError',
      code: 'hydration_pending',
      capability: 'hydration',
      reason: 'request_budget_exhausted',
      retryAfterMs: null
    })
    await expect(search('contract')).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a non-search success body without caching it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ items: [] })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(search('contract')).rejects.toMatchObject({
      name: 'RatingsdbResponseError',
      provider: 'ratingsdb'
    })
    await expect(search('contract')).rejects.toMatchObject({
      name: 'RatingsdbResponseError'
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
            { error: 'Missing query', code: 'invalid_query' },
            { status: 400 }
          )
        )
    )

    await expect(search('contract')).rejects.toMatchObject({
      status: 400,
      provider: 'ratingsdb'
    })
  })

  it('rejects an already-aborted request before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    controller.abort()

    await expect(
      search('contract', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('RatingsDB series references', () => {
  it.each(['tt0903747', 'imdb:tt0903747', 'tvmaze:169', 'tmdb:1396'])(
    'accepts supported reference %j',
    (ref) => {
      expect(isSeriesRef(ref)).toBe(true)
      expect(assertSeriesRef(ref)).toBe(ref)
    }
  )

  it.each(['', 'tt', 'trakt:the-wire', '../evil', 'tvmaze:169/x', 169, null])(
    'rejects unsupported reference %j',
    (ref) => {
      expect(isSeriesRef(ref)).toBe(false)
      expect(() => assertSeriesRef(ref)).toThrow(
        `Invalid RatingsDB series reference: ${String(ref)}`
      )
    }
  )
})
