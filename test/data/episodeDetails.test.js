import { describe, expect, it, vi } from 'vitest'

import { createEpisodeDetailLoader } from '../../src/data/episodeDetails.js'

function createStorage({ throws = false } = {}) {
  const values = new Map()
  return {
    get length() {
      return values.size
    },
    key: vi.fn((index) => Array.from(values.keys())[index] ?? null),
    getItem: vi.fn((key) => {
      if (throws) throw new Error('storage unavailable')
      return values.get(key) ?? null
    }),
    setItem: vi.fn((key, value) => {
      if (throws) throw new Error('storage unavailable')
      values.set(key, value)
    }),
    removeItem: vi.fn((key) => values.delete(key))
  }
}

function createCachedVoteGetter(votes) {
  let cached = false
  return vi.fn(async (_imdbId, options) => {
    if (cached) {
      options.onCacheHit?.()
    } else {
      await options.beforeNetwork?.()
      cached = true
    }
    return votes
  })
}

function createNetworkVoteGetter(network) {
  return vi.fn(async (_imdbId, options) => {
    await options.beforeNetwork?.()
    return network()
  })
}

function createEpisode() {
  return {
    id: 'tvmaze:episode:123',
    title: 'Mindy St. Claire',
    season: 1,
    episode: 12,
    ratings: [
      { source: 'tvmaze', rating: 8.4, votes: null },
      {
        source: 'omdb',
        rating: null,
        votes: null,
        votesStatus: 'unknown',
        provenance: { confidence: 'strong' }
      }
    ],
    sourceIds: { tvmaze: '123', omdb: 'tt5884092' }
  }
}

describe('episode detail loading', () => {
  it('delegates caching to the transport without charging cache hits to the budget', async () => {
    const getEpisodeVoteCount = createCachedVoteGetter(3379)
    const loadProvider = vi.fn().mockResolvedValue({ getEpisodeVoteCount })
    const loader = createEpisodeDetailLoader({
      loadProvider,
      expectedSeriesId: 'tt4955642',
      storage: createStorage(),
      now: () => Date.UTC(2026, 7, 10)
    })

    const first = await loader(createEpisode())
    const second = await loader(createEpisode())

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(2)
    expect(getEpisodeVoteCount).toHaveBeenCalledWith(
      'tt5884092',
      expect.objectContaining({
        expectedSeriesId: 'tt4955642',
        beforeNetwork: expect.any(Function),
        onCacheHit: expect.any(Function)
      })
    )
    expect(first.ratings[1]).toMatchObject({
      votes: 3379,
      votesStatus: 'loaded'
    })
    expect(second.ratings[1]).toMatchObject({
      votes: 3379,
      votesStatus: 'loaded'
    })
    expect(loader.getDebugState()).toMatchObject({ requests: 1, cacheHits: 1 })
  })

  it('enforces its request budget before issuing a network request', async () => {
    const network = vi.fn()
    const getEpisodeVoteCount = createNetworkVoteGetter(network)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage(),
      viewLimit: 0
    })

    await expect(loader(createEpisode())).rejects.toThrow('request limit')
    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(1)
    expect(network).not.toHaveBeenCalled()
  })

  it('enforces the persisted daily budget before issuing a request', async () => {
    const storage = createStorage()
    storage.setItem(
      'graphtv:v1:omdb:request-ledger',
      JSON.stringify({ day: '2026-08-10', count: 2 })
    )
    const network = vi.fn()
    const getEpisodeVoteCount = createNetworkVoteGetter(network)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage,
      now: () => Date.UTC(2026, 7, 10),
      dailyLimit: 2
    })

    await expect(loader(createEpisode())).rejects.toThrow(
      'daily request budget'
    )
    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(1)
    expect(network).not.toHaveBeenCalled()
  })

  it('keeps working when the request ledger storage is unavailable', async () => {
    const getEpisodeVoteCount = createCachedVoteGetter(6220)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage({ throws: true })
    })

    await loader(createEpisode())
    const cached = await loader(createEpisode())

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(2)
    expect(cached.ratings[1].votes).toBe(6220)
  })

  it('deduplicates concurrent requests for the same episode', async () => {
    const getEpisodeVoteCount = vi.fn().mockResolvedValue(3379)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage()
    })

    const [first, second] = await Promise.all([
      loader(createEpisode()),
      loader(createEpisode())
    ])

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(1)
    expect(first.ratings[1].votes).toBe(3379)
    expect(second.ratings[1].votes).toBe(3379)
  })

  it('accepts a transport-cached unavailable vote count', async () => {
    const getEpisodeVoteCount = createCachedVoteGetter(null)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage()
    })

    const first = await loader(createEpisode())
    const second = await loader(createEpisode())

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(2)
    expect(first.ratings[1]).toMatchObject({
      votes: null,
      votesStatus: 'unavailable'
    })
    expect(second.ratings[1]).toMatchObject({
      votes: null,
      votesStatus: 'unavailable'
    })
  })

  it('removes the superseded localStorage vote cache', () => {
    const storage = createStorage()
    const legacyKey = 'graphtv:v1:align4:omdb:episode:tt5884092'
    storage.setItem(legacyKey, JSON.stringify({ votes: 3379 }))

    createEpisodeDetailLoader({
      loadProvider: vi.fn(),
      expectedSeriesId: 'tt4955642',
      storage
    })

    expect(storage.removeItem).toHaveBeenCalledWith(legacyKey)
    expect(storage.getItem('graphtv:v1:omdb:episode-cache-cleaned')).toBe(
      'true'
    )
  })

  it('does not load votes for a moderate supplemental match', async () => {
    const episode = createEpisode()
    episode.ratings[1].provenance.confidence = 'moderate'
    const getEpisodeVoteCount = vi.fn()
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage()
    })

    await expect(loader(episode)).resolves.toBe(episode)
    expect(getEpisodeVoteCount).not.toHaveBeenCalled()
  })

  it('requires a parent series ID before reserving request budget', async () => {
    const getEpisodeVoteCount = vi.fn()
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      storage: createStorage()
    })

    await expect(loader(createEpisode())).rejects.toThrow(
      'expected IMDb series ID'
    )
    expect(getEpisodeVoteCount).not.toHaveBeenCalled()
    expect(loader.getDebugState().requests).toBe(0)
  })

  it('briefly caches transient failures without disabling other episodes', async () => {
    const getEpisodeVoteCount = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('Request timed out at the gateway limit')
      )
      .mockResolvedValueOnce(4100)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage()
    })

    await expect(loader(createEpisode())).rejects.toThrow('gateway limit')
    await expect(loader(createEpisode())).rejects.toThrow('gateway limit')

    const otherEpisode = createEpisode()
    otherEpisode.sourceIds.omdb = 'tt-other'
    const loaded = await loader(otherEpisode)

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(2)
    expect(loaded.ratings[1].votes).toBe(4100)
    expect(loader.getDebugState().disabledReason).toBeNull()
  })

  it('latches only explicitly classified OMDb quota failures', async () => {
    const quotaError = Object.assign(new Error('Request limit reached!'), {
      provider: 'omdb',
      code: 'quota'
    })
    const getEpisodeVoteCount = vi.fn().mockRejectedValue(quotaError)
    const loader = createEpisodeDetailLoader({
      loadProvider: vi.fn().mockResolvedValue({ getEpisodeVoteCount }),
      expectedSeriesId: 'tt4955642',
      storage: createStorage()
    })

    await expect(loader(createEpisode())).rejects.toThrow(
      'Request limit reached'
    )
    const otherEpisode = createEpisode()
    otherEpisode.sourceIds.omdb = 'tt-other'
    await expect(loader(otherEpisode)).rejects.toThrow('Request limit reached')

    expect(getEpisodeVoteCount).toHaveBeenCalledTimes(1)
    expect(loader.getDebugState().disabledReason).toBe('Request limit reached!')
  })
})
