import { clearApiCache } from './apiCache.js'

export const APP_STORAGE_PREFIXES = Object.freeze(['graphtv-', 'graphtv:'])

function getBrowserStorage(name) {
  try {
    return globalThis[name] ?? null
  } catch {
    return null
  }
}

function isAppStorageKey(key) {
  return APP_STORAGE_PREFIXES.some((prefix) => key?.startsWith(prefix))
}

export function clearAppStorage(storage) {
  if (!storage) {
    return 0
  }

  const keys = Array.from({ length: storage.length ?? 0 }, (_, index) =>
    storage.key(index)
  ).filter(isAppStorageKey)

  keys.forEach((key) => storage.removeItem(key))
  return keys.length
}

export async function resetAllAppData(options = {}) {
  const clearCaches = options.clearCaches ?? clearApiCache
  const localStorage = options.localStorage ?? getBrowserStorage('localStorage')
  const sessionStorage =
    options.sessionStorage ?? getBrowserStorage('sessionStorage')

  await clearCaches()

  return {
    localStorage: clearAppStorage(localStorage),
    sessionStorage: clearAppStorage(sessionStorage)
  }
}
