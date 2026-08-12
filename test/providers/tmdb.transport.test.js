import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/config/clientSecrets.js', () => ({
  getClientSecret: vi.fn(() => 'test-tmdb-token')
}))

import { clearApiCache } from '../../src/data/apiCache.js'
import {
  getPopularShows,
  getTrendingShows
} from '../../src/providers/tmdb/transport.js'
import { tmdbCollectionFixture } from '../fixtures/tmdb.js'

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(async () => {
  await clearApiCache()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await clearApiCache()
})

describe('tmdb collection transport', () => {
  it('loads and locally caches the weekly trending collection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(tmdbCollectionFixture))
    vi.stubGlobal('fetch', fetchMock)

    const first = await getTrendingShows()
    const second = await getTrendingShows()

    expect(first).toEqual(second)
    expect(first.map((show) => show.title)).toEqual(['Reacher', 'New Show'])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.themoviedb.org/3/trending/tv/week'
    )
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer test-tmdb-token'
    )
  })

  it('uses a vote-qualified discover query for the popular collection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(tmdbCollectionFixture))
    vi.stubGlobal('fetch', fetchMock)

    const shows = await getPopularShows()
    await getPopularShows()
    const requestUrl = new URL(fetchMock.mock.calls[0][0])

    expect(requestUrl.pathname).toBe('/3/discover/tv')
    expect(requestUrl.searchParams.get('sort_by')).toBe('popularity.desc')
    expect(requestUrl.searchParams.get('vote_count.gte')).toBe('50')
    expect(requestUrl.searchParams.get('include_adult')).toBe('false')
    expect(shows.map((show) => show.title)).toEqual(['Reacher'])
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
