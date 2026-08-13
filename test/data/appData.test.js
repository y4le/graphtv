import { describe, expect, it, vi } from 'vitest'

import { clearAppStorage, resetAllAppData } from '../../src/data/appData.js'

function createStorage(entries = {}) {
  const values = new Map(Object.entries(entries))

  return {
    get length() {
      return values.size
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    removeItem(key) {
      values.delete(key)
    }
  }
}

describe('app data reset', () => {
  it('removes graphtv-owned values without touching shared-origin data', () => {
    const storage = createStorage({
      'graphtv-ui-settings': 'settings',
      'graphtv:v1:omdb:request-ledger': 'ledger',
      graphtvish: 'not ours',
      'another-app:settings': 'keep'
    })

    expect(clearAppStorage(storage)).toBe(2)
    expect(storage.getItem('graphtv-ui-settings')).toBeNull()
    expect(storage.getItem('graphtv:v1:omdb:request-ledger')).toBeNull()
    expect(storage.getItem('graphtvish')).toBe('not ours')
    expect(storage.getItem('another-app:settings')).toBe('keep')
  })

  it('clears provider caches plus local and session app data', async () => {
    const clearCaches = vi.fn().mockResolvedValue()
    const localStorage = createStorage({
      'graphtv-ui-settings': 'settings',
      unrelated: 'keep'
    })
    const sessionStorage = createStorage({
      'graphtv-focus-search': '1',
      unrelated: 'keep'
    })

    await expect(
      resetAllAppData({ clearCaches, localStorage, sessionStorage })
    ).resolves.toEqual({ localStorage: 1, sessionStorage: 1 })

    expect(clearCaches).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('graphtv-ui-settings')).toBeNull()
    expect(sessionStorage.getItem('graphtv-focus-search')).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
    expect(sessionStorage.getItem('unrelated')).toBe('keep')
  })
})
