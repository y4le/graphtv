import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  API_CACHE_TTL,
  DAY_MS,
  createApiCacheKey,
  createApiRequestCache
} from '../../src/data/apiCache.js'
import { createMemoryCacheBackend } from '../../src/data/cacheStore.js'

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' }
  })
}

function createCache(options = {}) {
  return createApiRequestCache({
    store: createMemoryCacheBackend(),
    ...options
  })
}

const descriptor = {
  provider: 'tvmaze',
  kind: 'show',
  id: '2790',
  ttlMs: API_CACHE_TTL.show
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API request cache', () => {
  it('builds stable semantic keys without credentials', () => {
    const first = createApiCacheKey({
      provider: 'tmdb',
      kind: 'season',
      id: 7,
      params: { season: 2, language: 'en-US' }
    })
    const reordered = createApiCacheKey({
      provider: 'tmdb',
      kind: 'season',
      id: 7,
      params: { language: 'en-US', season: 2 }
    })

    expect(first).toBe(reordered)
    expect(first).not.toContain('token')
    expect(first).not.toContain('apikey')
  })

  it('never stores an authenticated URL or authorization header', async () => {
    const store = createMemoryCacheBackend()
    const cache = createApiRequestCache({ store })
    const authenticatedDescriptor = {
      provider: 'omdb',
      kind: 'title',
      id: 'tt123'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ imdbID: 'tt123' }))
    )

    await cache.requestJson(authenticatedDescriptor, () => ({
      url: 'https://example.test/?i=tt123&apikey=super-secret',
      init: { headers: { Authorization: 'Bearer super-secret' } }
    }))

    const key = createApiCacheKey(authenticatedDescriptor)
    const serializedEntry = JSON.stringify(await store.get(key))
    expect(key).not.toContain('super-secret')
    expect(serializedEntry).not.toContain('super-secret')
    expect(serializedEntry).not.toContain('Authorization')
  })

  it('uses a cache hit without rebuilding the authenticated request or charging budget', async () => {
    const cache = createCache()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 2790 }))
    const requestFactory = vi.fn(() => ({
      url: 'https://example.test/show/2790',
      init: { headers: { Authorization: 'Bearer secret' } }
    }))
    const beforeNetwork = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await cache.requestJson(descriptor, requestFactory, { beforeNetwork })
    const cached = await cache.requestJson(descriptor, requestFactory, {
      beforeNetwork
    })

    expect(cached).toEqual({ id: 2790 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestFactory).toHaveBeenCalledTimes(1)
    expect(beforeNetwork).toHaveBeenCalledTimes(1)
  })

  it('enforces a one-day minimum TTL', async () => {
    let timestamp = 10_000
    const cache = createCache({ now: () => timestamp })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ version: 1 }))
      .mockResolvedValueOnce(jsonResponse({ version: 2 }))
    vi.stubGlobal('fetch', fetchMock)
    const shortDescriptor = { ...descriptor, ttlMs: 1 }
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })

    await cache.requestJson(shortDescriptor, requestFactory)
    timestamp += DAY_MS - 1
    await expect(
      cache.requestJson(shortDescriptor, requestFactory)
    ).resolves.toEqual({ version: 1 })
    timestamp += 2
    await expect(
      cache.requestJson(shortDescriptor, requestFactory)
    ).resolves.toEqual({ version: 2 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('deletes malformed envelopes instead of serving stale data', async () => {
    const store = createMemoryCacheBackend()
    const cache = createApiRequestCache({ store, now: () => 10_000 })
    const key = createApiCacheKey(descriptor)
    await store.put({
      key,
      provider: 'tvmaze',
      kind: 'show',
      storeVersion: 999,
      payloadVersion: 1,
      createdAt: 1,
      expiresAt: DAY_MS + 1,
      lastAccess: 1,
      bytes: 10,
      value: { stale: true }
    })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ fresh: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      cache.requestJson(descriptor, () => ({
        url: 'https://example.test/show/2790'
      }))
    ).resolves.toEqual({ fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects cache entries created implausibly far in the future', async () => {
    const timestamp = 10_000
    const store = createMemoryCacheBackend()
    const cache = createApiRequestCache({ store, now: () => timestamp })
    const key = createApiCacheKey(descriptor)
    const createdAt = timestamp + 5 * 60 * 1000 + 1
    await store.put({
      key,
      provider: 'tvmaze',
      kind: 'show',
      storeVersion: 1,
      payloadVersion: 1,
      createdAt,
      expiresAt: createdAt + DAY_MS,
      lastAccess: createdAt,
      bytes: 10,
      value: { stale: true }
    })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ fresh: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      cache.requestJson(descriptor, () => ({
        url: 'https://example.test/show/2790'
      }))
    ).resolves.toEqual({ fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('deduplicates concurrent misses', async () => {
    const cache = createCache()
    let resolveFetch
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })

    const first = cache.requestJson(descriptor, requestFactory)
    const second = cache.requestJson(descriptor, requestFactory)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveFetch(jsonResponse({ id: 2790 }))

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 2790 },
      { id: 2790 }
    ])
    expect((await cache.getDebugState()).deduplicated).toBe(1)
  })

  it('lets one subscriber abort without cancelling the shared request', async () => {
    const cache = createCache()
    let resolveFetch
    let upstreamSignal
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init) => {
        upstreamSignal = init.signal
        return new Promise((resolve) => {
          resolveFetch = resolve
        })
      })
    )
    const firstController = new AbortController()
    const secondController = new AbortController()
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })

    const first = cache.requestJson(descriptor, requestFactory, {
      signal: firstController.signal
    })
    const second = cache.requestJson(descriptor, requestFactory, {
      signal: secondController.signal
    })
    await vi.waitFor(() => expect(resolveFetch).toBeTypeOf('function'))
    firstController.abort()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(upstreamSignal.aborted).toBe(false)
    resolveFetch(jsonResponse({ id: 2790 }))
    await expect(second).resolves.toEqual({ id: 2790 })
  })

  it('aborts the upstream request when every subscriber detaches', async () => {
    const cache = createCache()
    const fetchMock = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const request = cache.requestJson(
      descriptor,
      () => ({ url: 'https://example.test/show/2790' }),
      { signal: controller.signal }
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(async () =>
      expect((await cache.getDebugState()).inFlight).toBe(0)
    )
  })

  it('starts a fresh request before an abandoned request has settled', async () => {
    const cache = createCache()
    let rejectAbandonedFetch
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectAbandonedFetch = reject
          })
      )
      .mockResolvedValueOnce(jsonResponse({ fresh: true }))
    vi.stubGlobal('fetch', fetchMock)
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })
    const controller = new AbortController()
    const abandoned = cache.requestJson(descriptor, requestFactory, {
      signal: controller.signal
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    controller.abort()
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })
    const repeated = cache.requestJson(descriptor, requestFactory)

    await expect(repeated).resolves.toEqual({ fresh: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    rejectAbandonedFetch(new DOMException('Aborted', 'AbortError'))
    await vi.waitFor(async () =>
      expect((await cache.getDebugState()).inFlight).toBe(0)
    )
  })

  it('does not cache payloads larger than the per-entry safety limit', async () => {
    const cache = createCache()
    const oversized = { value: 'x'.repeat(2 * 1024 * 1024) }
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(oversized)))
    vi.stubGlobal('fetch', fetchMock)
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })

    await cache.requestJson(descriptor, requestFactory)
    await cache.requestJson(descriptor, requestFactory)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await cache.getDebugState()).writes).toBe(0)
  })

  it('briefly cools down a failed network request without persisting it', async () => {
    let timestamp = 1_000
    const cache = createCache({ now: () => timestamp })
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse({ recovered: true }))
    vi.stubGlobal('fetch', fetchMock)
    const requestFactory = () => ({ url: 'https://example.test/show/2790' })

    await expect(cache.requestJson(descriptor, requestFactory)).rejects.toThrow(
      'network down'
    )
    await expect(cache.requestJson(descriptor, requestFactory)).rejects.toThrow(
      'network down'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    timestamp += 60_001
    await expect(
      cache.requestJson(descriptor, requestFactory)
    ).resolves.toEqual({ recovered: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('attaches credential-safe request context to opaque fetch failures', async () => {
    const cache = createCache()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Load failed'))
    )

    const error = await cache
      .requestJson({ provider: 'omdb', kind: 'title', id: 'tt123' }, () => ({
        url: 'https://www.omdbapi.com/?i=tt123&apikey=super-secret'
      }))
      .catch((caught) => caught)

    expect(error).toMatchObject({
      name: 'TypeError',
      message: 'Load failed',
      provider: 'omdb',
      requestContext: {
        provider: 'omdb',
        kind: 'title',
        endpoint: 'https://www.omdbapi.com',
        crossOrigin: true
      }
    })
    expect(JSON.stringify(error.requestContext)).not.toContain('super-secret')
    expect(JSON.stringify(error.requestContext)).not.toContain('apikey')
  })
})
