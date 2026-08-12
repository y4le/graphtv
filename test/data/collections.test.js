import { describe, expect, it, vi } from 'vitest'

import {
  canLoadSearchCollections,
  loadSearchCollections
} from '../../src/data/collections.js'

describe('search-page collections', () => {
  it('reports collections as unavailable when TMDB is not configured', async () => {
    const isConfigured = vi.fn(() => false)
    const providerLoader = vi.fn()

    expect(canLoadSearchCollections(isConfigured)).toBe(false)
    await expect(
      loadSearchCollections({ isConfigured, providerLoader })
    ).resolves.toEqual([
      expect.objectContaining({ id: 'trending', status: 'unavailable' }),
      expect.objectContaining({ id: 'popular', status: 'unavailable' })
    ])
    expect(providerLoader).not.toHaveBeenCalled()
  })

  it('keeps collection failures independent', async () => {
    const shows = [{ id: 'tmdb:1', title: 'One' }]
    const providerLoader = vi.fn(async () => ({
      getTrendingShows: vi.fn(async () => shows),
      getPopularShows: vi.fn(async () => {
        throw new Error('Popular failed')
      })
    }))

    const collections = await loadSearchCollections({
      isConfigured: () => true,
      providerLoader
    })

    expect(collections[0]).toMatchObject({
      id: 'trending',
      status: 'ready',
      shows
    })
    expect(collections[1]).toMatchObject({
      id: 'popular',
      status: 'error',
      reason: 'Popular failed'
    })
  })

  it('classifies aborted loads without presenting them as errors', async () => {
    const aborted = new DOMException('Aborted', 'AbortError')
    const providerLoader = vi.fn(async () => ({
      getTrendingShows: vi.fn(async () => {
        throw aborted
      }),
      getPopularShows: vi.fn(async () => {
        throw aborted
      })
    }))

    const collections = await loadSearchCollections({
      isConfigured: () => true,
      providerLoader
    })

    expect(collections.map(({ status }) => status)).toEqual([
      'aborted',
      'aborted'
    ])
  })
})
