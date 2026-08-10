import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'

import {
  createCacheStore,
  createIndexedDbCacheBackend,
  createMemoryCacheBackend
} from '../../src/data/cacheStore.js'

function createEntry(key, overrides = {}) {
  return {
    key,
    provider: 'tvmaze',
    kind: 'show',
    storeVersion: 1,
    payloadVersion: 1,
    createdAt: 100,
    expiresAt: 1_000,
    lastAccess: 100,
    bytes: 10,
    value: { id: key },
    ...overrides
  }
}

describe('API cache storage', () => {
  it('clones memory entries and evicts the least recently used entry', async () => {
    const backend = createMemoryCacheBackend({ maxEntries: 2 })
    const first = createEntry('first', { lastAccess: 1 })
    await backend.put(first)
    await backend.put(createEntry('second', { lastAccess: 2 }))
    await backend.put(createEntry('third', { lastAccess: 3 }))
    first.value.id = 'mutated'

    expect(await backend.get('first')).toBeNull()
    expect((await backend.get('second')).value.id).toBe('second')
    expect((await backend.stats()).entries).toBe(2)
  })

  it('bounds the in-memory working set by serialized payload size', async () => {
    const backend = createMemoryCacheBackend({ maxEntries: 10, maxBytes: 15 })
    await backend.put(createEntry('first', { lastAccess: 1, bytes: 10 }))
    await backend.put(createEntry('second', { lastAccess: 2, bytes: 10 }))

    expect(await backend.get('first')).toBeNull()
    expect(await backend.get('second')).not.toBeNull()
    expect((await backend.stats()).bytes).toBe(10)
  })

  it('persists payloads across IndexedDB backend instances', async () => {
    const indexedDb = new IDBFactory()
    const first = await createIndexedDbCacheBackend({ indexedDb })
    await first.put(createEntry('persisted'))
    first.close()

    const reopened = await createIndexedDbCacheBackend({ indexedDb })
    expect(await reopened.get('persisted')).toEqual(createEntry('persisted'))
    reopened.close()
  })

  it('prunes expired, excess search, and oldest metadata without reading payloads', async () => {
    const indexedDb = new IDBFactory()
    const backend = await createIndexedDbCacheBackend({ indexedDb })
    await backend.put(createEntry('expired', { expiresAt: 99 }))
    await backend.put(
      createEntry('search-old', { kind: 'search', lastAccess: 2 })
    )
    await backend.put(
      createEntry('search-new', { kind: 'search', lastAccess: 3 })
    )
    await backend.put(createEntry('show', { lastAccess: 4 }))

    await backend.prune({ now: 100, maxEntries: 2, maxSearchEntries: 1 })

    expect(await backend.get('expired')).toBeNull()
    expect(await backend.get('search-old')).toBeNull()
    expect(await backend.get('search-new')).not.toBeNull()
    expect(await backend.get('show')).not.toBeNull()
    backend.close()
  })

  it('degrades to memory when persistent storage cannot open', async () => {
    const store = createCacheStore({
      persistent: Promise.reject(new Error('blocked'))
    })
    await store.put(createEntry('memory-only'))

    expect(await store.get('memory-only')).toEqual(createEntry('memory-only'))
    expect(await store.stats()).toMatchObject({ persistentMode: 'unavailable' })
  })

  it('prunes and retries one persistent write after a quota error', async () => {
    const quotaError = Object.assign(new Error('full'), {
      name: 'QuotaExceededError'
    })
    const persistent = {
      get: vi.fn(),
      put: vi.fn().mockRejectedValueOnce(quotaError).mockResolvedValueOnce(),
      prune: vi.fn(),
      stats: vi.fn().mockResolvedValue({ entries: 1, bytes: 10 })
    }
    const store = createCacheStore({ persistent })

    await store.put(createEntry('retry'))

    expect(persistent.prune).toHaveBeenCalledTimes(1)
    expect(persistent.put).toHaveBeenCalledTimes(2)
    expect((await store.stats()).persistentMode).toBe('active')
  })

  it('reads through and updates access metadata across memory and IndexedDB tiers', async () => {
    const indexedDb = new IDBFactory()
    const persistent = await createIndexedDbCacheBackend({ indexedDb })
    const memory = createMemoryCacheBackend()
    const store = createCacheStore({ memory, persistent })
    const entry = createEntry('two-tier', {
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    })
    await store.put(entry)
    await memory.clear()

    expect(await store.get('two-tier')).toEqual(entry)
    await store.touch('two-tier', 777)
    await vi.waitFor(async () => {
      expect((await persistent.get('two-tier')).lastAccess).toBe(777)
    })
    persistent.close()
  })

  it('contains failures from detached persistent access updates', async () => {
    const persistent = {
      touch: vi.fn().mockRejectedValue(new Error('touch failed')),
      close: vi.fn(() => {
        throw new Error('close failed')
      })
    }
    const store = createCacheStore({ persistent })

    await store.touch('missing', 100)
    await vi.waitFor(() => expect(persistent.close).toHaveBeenCalledTimes(1))
  })
})
