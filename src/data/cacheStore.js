const DATABASE_NAME = 'graphtv-api-cache'
const DATABASE_VERSION = 1
const METADATA_STORE = 'entries'
const PAYLOAD_STORE = 'payloads'

const DEFAULT_MAX_ENTRIES = 200
const DEFAULT_MAX_BYTES = 24 * 1024 * 1024
const DEFAULT_MAX_SEARCH_ENTRIES = 64
const DEFAULT_OPEN_TIMEOUT_MS = 2_000

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true
    })
    request.addEventListener('error', () => reject(request.error), {
      once: true
    })
  })
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error), {
      once: true
    })
    transaction.addEventListener('error', () => reject(transaction.error), {
      once: true
    })
  })
}

function deleteEntry(transaction, key) {
  transaction.objectStore(METADATA_STORE).delete(key)
  transaction.objectStore(PAYLOAD_STORE).delete(key)
}

export function createMemoryCacheBackend({
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxBytes = DEFAULT_MAX_BYTES,
  maxSearchEntries = DEFAULT_MAX_SEARCH_ENTRIES
} = {}) {
  const entries = new Map()

  function trim() {
    const searches = Array.from(entries.values())
      .filter((entry) => entry.kind === 'search')
      .sort((a, b) => b.lastAccess - a.lastAccess)
    searches
      .slice(maxSearchEntries)
      .forEach((entry) => entries.delete(entry.key))

    const oldest = Array.from(entries.values()).sort(
      (a, b) => a.lastAccess - b.lastAccess
    )
    let bytes = oldest.reduce((total, entry) => total + entry.bytes, 0)
    while (oldest.length > maxEntries || bytes > maxBytes) {
      const entry = oldest.shift()
      entries.delete(entry.key)
      bytes -= entry.bytes
    }
  }

  return {
    async get(key) {
      const entry = entries.get(key)
      return entry ? clone(entry) : null
    },
    async put(entry) {
      entries.set(entry.key, clone(entry))
      trim()
    },
    async touch(key, lastAccess) {
      const entry = entries.get(key)
      if (entry) {
        entry.lastAccess = lastAccess
      }
    },
    async delete(key) {
      entries.delete(key)
    },
    async clear() {
      entries.clear()
    },
    async prune({ now = Date.now() } = {}) {
      for (const entry of entries.values()) {
        if (entry.expiresAt <= now) {
          entries.delete(entry.key)
        }
      }
      trim()
    },
    async stats() {
      const values = Array.from(entries.values())
      return {
        entries: values.length,
        bytes: values.reduce((total, entry) => total + entry.bytes, 0)
      }
    }
  }
}

async function openDatabase(indexedDb, timeoutMs) {
  if (!indexedDb) {
    return null
  }

  const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION)
  request.addEventListener('upgradeneeded', () => {
    const database = request.result
    const metadata = database.objectStoreNames.contains(METADATA_STORE)
      ? request.transaction.objectStore(METADATA_STORE)
      : database.createObjectStore(METADATA_STORE, { keyPath: 'key' })

    if (!metadata.indexNames.contains('expiresAt')) {
      metadata.createIndex('expiresAt', 'expiresAt')
    }
    if (!metadata.indexNames.contains('lastAccess')) {
      metadata.createIndex('lastAccess', 'lastAccess')
    }
    if (!metadata.indexNames.contains('kind')) {
      metadata.createIndex('kind', 'kind')
    }
    if (!database.objectStoreNames.contains(PAYLOAD_STORE)) {
      database.createObjectStore(PAYLOAD_STORE, { keyPath: 'key' })
    }
  })

  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error('IndexedDB cache open timed out.'))
    }, timeoutMs)

    request.addEventListener(
      'success',
      () => {
        clearTimeout(timeout)
        if (settled) {
          request.result.close()
          return
        }
        settled = true
        resolve(request.result)
      },
      { once: true }
    )
    request.addEventListener(
      'error',
      () => {
        clearTimeout(timeout)
        if (!settled) {
          settled = true
          reject(request.error)
        }
      },
      { once: true }
    )
  })
}

export async function createIndexedDbCacheBackend({
  indexedDb = globalThis.indexedDB,
  timeoutMs = DEFAULT_OPEN_TIMEOUT_MS
} = {}) {
  const database = await openDatabase(indexedDb, timeoutMs)
  if (!database) {
    return null
  }
  database.addEventListener('versionchange', () => database.close())

  return {
    async get(key) {
      const transaction = database.transaction(
        [METADATA_STORE, PAYLOAD_STORE],
        'readonly'
      )
      const metadataRequest = transaction.objectStore(METADATA_STORE).get(key)
      const payloadRequest = transaction.objectStore(PAYLOAD_STORE).get(key)
      const [metadata, payload] = await Promise.all([
        requestResult(metadataRequest),
        requestResult(payloadRequest),
        transactionDone(transaction)
      ])

      return metadata && payload ? { ...metadata, value: payload.value } : null
    },
    async put(entry) {
      const transaction = database.transaction(
        [METADATA_STORE, PAYLOAD_STORE],
        'readwrite'
      )
      const { value, ...metadata } = entry
      transaction.objectStore(METADATA_STORE).put(metadata)
      transaction.objectStore(PAYLOAD_STORE).put({ key: entry.key, value })
      await transactionDone(transaction)
    },
    async touch(key, lastAccess) {
      const transaction = database.transaction(METADATA_STORE, 'readwrite')
      const done = transactionDone(transaction)
      const metadataStore = transaction.objectStore(METADATA_STORE)
      const metadata = await requestResult(metadataStore.get(key))
      if (metadata) {
        metadata.lastAccess = lastAccess
        metadataStore.put(metadata)
      }
      await done
    },
    async delete(key) {
      const transaction = database.transaction(
        [METADATA_STORE, PAYLOAD_STORE],
        'readwrite'
      )
      deleteEntry(transaction, key)
      await transactionDone(transaction)
    },
    async clear() {
      const transaction = database.transaction(
        [METADATA_STORE, PAYLOAD_STORE],
        'readwrite'
      )
      transaction.objectStore(METADATA_STORE).clear()
      transaction.objectStore(PAYLOAD_STORE).clear()
      await transactionDone(transaction)
    },
    async prune({
      now = Date.now(),
      maxEntries = DEFAULT_MAX_ENTRIES,
      maxBytes = DEFAULT_MAX_BYTES,
      maxSearchEntries = DEFAULT_MAX_SEARCH_ENTRIES
    } = {}) {
      const transaction = database.transaction(
        [METADATA_STORE, PAYLOAD_STORE],
        'readwrite'
      )
      const done = transactionDone(transaction)
      const metadataStore = transaction.objectStore(METADATA_STORE)
      const metadata = await requestResult(metadataStore.getAll())
      const expiredKeys = new Set(
        metadata
          .filter((entry) => entry.expiresAt <= now)
          .map((entry) => entry.key)
      )
      let retained = metadata.filter((entry) => !expiredKeys.has(entry.key))

      const searches = retained
        .filter((entry) => entry.kind === 'search')
        .sort((a, b) => b.lastAccess - a.lastAccess)
      searches
        .slice(maxSearchEntries)
        .forEach((entry) => expiredKeys.add(entry.key))
      retained = retained.filter((entry) => !expiredKeys.has(entry.key))

      let bytes = retained.reduce((total, entry) => total + entry.bytes, 0)
      const oldest = retained.sort((a, b) => a.lastAccess - b.lastAccess)
      while (oldest.length > maxEntries || bytes > maxBytes) {
        const entry = oldest.shift()
        expiredKeys.add(entry.key)
        bytes -= entry.bytes
      }

      expiredKeys.forEach((key) => deleteEntry(transaction, key))
      await done
    },
    async stats() {
      const transaction = database.transaction(METADATA_STORE, 'readonly')
      const done = transactionDone(transaction)
      const metadata = await requestResult(
        transaction.objectStore(METADATA_STORE).getAll()
      )
      await done
      return {
        entries: metadata.length,
        bytes: metadata.reduce((total, entry) => total + entry.bytes, 0)
      }
    },
    close() {
      database.close()
    }
  }
}

export function createCacheStore(options = {}) {
  const {
    maxEntries = DEFAULT_MAX_ENTRIES,
    maxBytes = DEFAULT_MAX_BYTES,
    maxSearchEntries = DEFAULT_MAX_SEARCH_ENTRIES
  } = options
  const memory =
    options.memory ??
    createMemoryCacheBackend({ maxEntries, maxBytes, maxSearchEntries })
  const persistent = Object.hasOwn(options, 'persistent')
    ? options.persistent
    : createIndexedDbCacheBackend()
  let persistentMode = 'pending'
  let persistentBackend = null
  const persistentBackendPromise = Promise.resolve(persistent)
    .then((backend) => {
      persistentBackend = backend
      persistentMode = backend ? 'active' : 'unavailable'
      return backend
    })
    .catch(() => {
      persistentMode = 'unavailable'
      return null
    })

  async function getPersistent() {
    return persistentBackend ?? persistentBackendPromise
  }

  async function disablePersistent(mode = 'unavailable') {
    persistentMode = mode
    persistentBackend?.close?.()
    persistentBackend = null
  }

  return {
    async get(key) {
      const memoryEntry = await memory.get(key)
      if (memoryEntry) {
        return memoryEntry
      }

      const backend = await getPersistent()
      if (!backend || persistentMode === 'unavailable') {
        return null
      }

      try {
        const entry = await backend.get(key)
        if (entry) {
          await memory.put(entry)
        }
        return entry
      } catch {
        await disablePersistent()
        return null
      }
    },
    async put(entry) {
      await memory.put(entry)
      const backend = await getPersistent()
      if (!backend || persistentMode !== 'active') {
        return
      }

      try {
        await backend.put(entry)
        await backend.prune({ maxEntries, maxBytes, maxSearchEntries })
      } catch (error) {
        if (error?.name !== 'QuotaExceededError') {
          await disablePersistent()
          return
        }

        try {
          await backend.prune({
            maxEntries: Math.floor(maxEntries * 0.8),
            maxBytes: Math.floor(maxBytes * 0.8),
            maxSearchEntries
          })
          await backend.put(entry)
        } catch {
          persistentMode = 'read-only'
        }
      }
    },
    async touch(key, lastAccess) {
      await memory.touch(key, lastAccess)
      void getPersistent()
        .then(async (backend) => {
          if (backend && persistentMode === 'active') {
            try {
              await backend.touch(key, lastAccess)
            } catch {
              await disablePersistent()
            }
          }
        })
        .catch(() => {})
    },
    async delete(key) {
      await memory.delete(key)
      const backend = await getPersistent()
      if (backend && persistentMode === 'active') {
        try {
          await backend.delete(key)
        } catch {
          await disablePersistent()
        }
      }
    },
    async clear() {
      await memory.clear()
      const backend = await getPersistent()
      if (backend && persistentMode !== 'unavailable') {
        try {
          await backend.clear()
          persistentMode = 'active'
        } catch {
          await disablePersistent()
        }
      }
    },
    async prune(options) {
      await memory.prune(options)
      const backend = await getPersistent()
      if (backend && persistentMode === 'active') {
        try {
          await backend.prune({
            maxEntries,
            maxBytes,
            maxSearchEntries,
            ...options
          })
        } catch {
          await disablePersistent()
        }
      }
    },
    async stats() {
      const memoryStats = await memory.stats()
      const backend = await getPersistent()
      let persistentStats = null
      if (backend && persistentMode !== 'unavailable') {
        try {
          persistentStats = await backend.stats()
        } catch {
          await disablePersistent()
        }
      }
      return {
        memory: memoryStats,
        persistent: persistentStats,
        persistentMode
      }
    }
  }
}

export const CACHE_STORE_LIMITS = Object.freeze({
  maxEntries: DEFAULT_MAX_ENTRIES,
  maxBytes: DEFAULT_MAX_BYTES,
  maxSearchEntries: DEFAULT_MAX_SEARCH_ENTRIES
})
