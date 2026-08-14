import { createCacheStore } from './cacheStore.js'
import { attachRequestContext } from './errorDiagnostics.js'

export const DAY_MS = 24 * 60 * 60 * 1000
export const API_CACHE_TTL = Object.freeze({
  search: DAY_MS,
  collection: DAY_MS,
  popularCollection: 3 * DAY_MS,
  show: DAY_MS,
  episodes: DAY_MS,
  season: DAY_MS,
  lookup: 30 * DAY_MS,
  externalIds: 30 * DAY_MS,
  omdbTitle: 14 * DAY_MS,
  negative: DAY_MS
})

const STORE_VERSION = 1
const PAYLOAD_VERSION = 1
const MAX_TTL_MS = 365 * DAY_MS
const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const FAILURE_RETRY_DELAY_MS = 60 * 1000
const MAX_RECENT_FAILURES = 200
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

function abortError() {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function stableParams(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join('&')
}

export function getFetchInit(options = {}) {
  const init = { ...options }
  delete init.signal
  delete init.beforeNetwork
  delete init.onCacheHit
  return init
}

export function createApiCacheKey({ provider, kind, id, params }) {
  if (!provider || !kind || id === undefined || id === null) {
    throw new Error('API cache descriptors require provider, kind, and id.')
  }

  const segments = [
    'gtv',
    STORE_VERSION,
    PAYLOAD_VERSION,
    provider,
    kind,
    id,
    stableParams(params)
  ]
  return segments
    .filter((segment) => segment !== '')
    .map(encodeURIComponent)
    .join('/')
}

function serializedBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function normalizeTtl(ttlMs) {
  return Math.min(MAX_TTL_MS, Math.max(DAY_MS, ttlMs ?? DAY_MS))
}

function isValidEntry(entry, key, timestamp) {
  return (
    entry?.key === key &&
    entry.storeVersion === STORE_VERSION &&
    entry.payloadVersion === PAYLOAD_VERSION &&
    typeof entry.provider === 'string' &&
    typeof entry.kind === 'string' &&
    Number.isFinite(entry.bytes) &&
    entry.bytes >= 0 &&
    Object.hasOwn(entry, 'value') &&
    Number.isFinite(entry.createdAt) &&
    Number.isFinite(entry.expiresAt) &&
    entry.createdAt <= timestamp + MAX_CLOCK_SKEW_MS &&
    entry.expiresAt > timestamp &&
    entry.expiresAt - entry.createdAt >= DAY_MS &&
    entry.expiresAt - entry.createdAt <= MAX_TTL_MS
  )
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}`)
    error.status = response.status
    throw error
  }

  return response.json()
}

export function createApiRequestCache({
  store = createCacheStore(),
  now = () => Date.now()
} = {}) {
  const inFlight = new Map()
  const recentFailures = new Map()
  const stats = { hits: 0, misses: 0, writes: 0, deduplicated: 0 }

  async function read(key) {
    const timestamp = now()
    const entry = await store.get(key)
    if (!entry) {
      return undefined
    }
    if (!isValidEntry(entry, key, timestamp)) {
      await store.delete(key)
      return undefined
    }

    await store.touch(entry.key, timestamp)
    stats.hits += 1
    return entry.value
  }

  function startRequest(key, descriptor, requestFactory, options) {
    const controller = new AbortController()
    const request = {
      controller,
      subscribers: 0,
      settled: false,
      abandoned: false,
      key,
      promise: null
    }

    request.promise = (async () => {
      const cached = await read(key)
      if (cached !== undefined) {
        return { value: cached, cacheHit: true }
      }

      const failure = recentFailures.get(key)
      if (failure?.expiresAt > now()) {
        throw failure.error
      }
      recentFailures.delete(key)

      stats.misses += 1
      let networkStarted = false
      let requestUrl = null
      try {
        controller.signal.throwIfAborted()
        const { url, init = {} } = await requestFactory(controller.signal)
        requestUrl = url
        controller.signal.throwIfAborted()
        await options.beforeNetwork?.()
        controller.signal.throwIfAborted()
        networkStarted = true
        const value = await fetchJson(url, {
          ...init,
          signal: controller.signal
        })
        controller.signal.throwIfAborted()
        const policy = descriptor.classify?.(value) ?? { cache: true }
        if (policy.cache !== false) {
          const timestamp = now()
          const ttlMs = normalizeTtl(policy.ttlMs ?? descriptor.ttlMs)
          const bytes = serializedBytes(value)
          if (bytes <= MAX_ENTRY_BYTES) {
            await store.put({
              key,
              provider: descriptor.provider,
              kind: descriptor.kind,
              storeVersion: STORE_VERSION,
              payloadVersion: PAYLOAD_VERSION,
              createdAt: timestamp,
              expiresAt: timestamp + ttlMs,
              lastAccess: timestamp,
              bytes,
              value
            })
            stats.writes += 1
          }
        }
        return { value, cacheHit: false }
      } catch (error) {
        const diagnosedError = requestUrl
          ? attachRequestContext(error, descriptor, requestUrl)
          : error
        if (
          networkStarted &&
          !request.abandoned &&
          diagnosedError?.name !== 'AbortError'
        ) {
          recentFailures.delete(key)
          recentFailures.set(key, {
            error: diagnosedError,
            expiresAt: now() + FAILURE_RETRY_DELAY_MS
          })
          if (recentFailures.size > MAX_RECENT_FAILURES) {
            recentFailures.delete(recentFailures.keys().next().value)
          }
        }
        throw diagnosedError
      }
    })().finally(() => {
      request.settled = true
      if (inFlight.get(key) === request) {
        inFlight.delete(key)
      }
    })

    inFlight.set(key, request)
    return request
  }

  function subscribe(request, signal, onCacheHit) {
    if (signal?.aborted) {
      return Promise.reject(abortError())
    }

    request.subscribers += 1
    return new Promise((resolve, reject) => {
      let finished = false

      function release() {
        if (finished) {
          return false
        }
        finished = true
        signal?.removeEventListener('abort', onAbort)
        request.subscribers -= 1
        if (request.subscribers === 0 && !request.settled) {
          request.abandoned = true
          if (inFlight.get(request.key) === request) {
            inFlight.delete(request.key)
          }
          request.controller.abort()
        }
        return true
      }

      function onAbort() {
        if (release()) {
          reject(abortError())
        }
      }

      signal?.addEventListener('abort', onAbort, { once: true })
      request.promise.then(
        (result) => {
          if (!release()) {
            return
          }
          if (result.cacheHit) {
            onCacheHit?.()
          }
          resolve(result.value)
        },
        (error) => {
          if (release()) {
            reject(error)
          }
        }
      )
    })
  }

  async function requestJson(descriptor, requestFactory, options = {}) {
    if (options.signal?.aborted) {
      throw abortError()
    }

    const key = createApiCacheKey(descriptor)
    let request = inFlight.get(key)
    if (request?.abandoned || request?.controller.signal.aborted) {
      inFlight.delete(key)
      request = null
    }
    if (request) {
      stats.deduplicated += 1
    } else {
      request = startRequest(key, descriptor, requestFactory, options)
    }

    return subscribe(request, options.signal, options.onCacheHit)
  }

  return {
    requestJson,
    async clear() {
      recentFailures.clear()
      await store.clear()
    },
    async getDebugState() {
      return {
        ...stats,
        inFlight: inFlight.size,
        recentFailures: recentFailures.size,
        store: await store.stats()
      }
    }
  }
}

const defaultCache = createApiRequestCache()

export function requestJson(descriptor, requestFactory, options) {
  return defaultCache.requestJson(descriptor, requestFactory, options)
}

export function clearApiCache() {
  return defaultCache.clear()
}

export function getApiCacheDebugState() {
  return defaultCache.getDebugState()
}
