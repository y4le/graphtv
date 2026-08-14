import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearApiCache } from '../../src/data/apiCache.js'

vi.mock('../../src/config/clientSecrets.js', () => ({
  getClientSecret: () => 'test-key'
}))

import {
  getEpisodeVoteCount,
  getSeasons
} from '../../src/providers/omdb/transport.js'

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await clearApiCache()
})

describe('OMDb transport', () => {
  it('caps concurrent season requests', async () => {
    let active = 0
    let maximumActive = 0
    const releases = []
    const fetchMock = vi.fn(async (url) => {
      const seasonNumber = new URL(url).searchParams.get('season')
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => releases.push(resolve))
      active -= 1
      return jsonResponse({
        Title: 'Example',
        Season: seasonNumber,
        Episodes: [],
        Response: 'True'
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const seasonsPromise = getSeasons('tt123', 7)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7))
    releases.splice(0).forEach((release) => release())

    const result = await seasonsPromise
    expect(maximumActive).toBe(4)
    expect(result.seasons.map((season) => season.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7
    ])
  })

  it('keeps successful seasons when another season request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (String(url).includes('season=2')) {
          return Promise.reject(new Error('network failure'))
        }

        return Promise.resolve(
          jsonResponse({
            Title: 'Example',
            Season: '1',
            Episodes: [],
            Response: 'True'
          })
        )
      })
    )

    await expect(getSeasons('tt123', 2)).resolves.toEqual({
      seasons: [{ number: 1, title: 'Season 1', episodes: [] }],
      diagnostics: {
        requested: 2,
        loaded: 1,
        failures: [
          {
            season: 2,
            reason: 'network failure',
            error: expect.objectContaining({
              operation: 'load-season',
              provider: 'omdb',
              request: expect.objectContaining({
                endpoint: 'https://www.omdbapi.com',
                kind: 'season'
              })
            })
          }
        ]
      }
    })
  })

  it('preserves per-season diagnostics when every season fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network failure'))
    )

    const error = await getSeasons('tt123', 2).catch((caught) => caught)

    expect(error.message).toBe('OMDb failed to load all 2 seasons.')
    expect(error.seasonDiagnostics).toEqual({
      requested: 2,
      loaded: 0,
      failures: [
        {
          season: 1,
          reason: 'network failure',
          error: expect.objectContaining({
            category: 'provider-error',
            operation: 'load-season',
            provider: 'omdb'
          })
        },
        {
          season: 2,
          reason: 'network failure',
          error: expect.objectContaining({
            category: 'provider-error',
            operation: 'load-season',
            provider: 'omdb'
          })
        }
      ]
    })
  })

  it('loads votes by episode IMDb ID and verifies the parent series', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        imdbID: 'tt5884092',
        seriesID: 'tt4955642',
        imdbVotes: '3,379',
        Response: 'True'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getEpisodeVoteCount('tt5884092', { expectedSeriesId: 'tt4955642' })
    ).resolves.toBe(3379)
    expect(fetchMock.mock.calls[0][0]).toContain('i=tt5884092')
    expect(fetchMock.mock.calls[0][0]).not.toContain('Season=')
  })

  it('rejects an episode that belongs to a different series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          imdbID: 'tt5884092',
          seriesID: 'tt-wrong',
          imdbVotes: '3,379',
          Response: 'True'
        })
      )
    )

    await expect(
      getEpisodeVoteCount('tt5884092', { expectedSeriesId: 'tt4955642' })
    ).rejects.toThrow('unexpected series')
  })

  it('revalidates the parent series when the raw episode response is cached', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        imdbID: 'tt5884092',
        seriesID: 'tt4955642',
        imdbVotes: '3,379',
        Response: 'True'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getEpisodeVoteCount('tt5884092', { expectedSeriesId: 'tt4955642' })
    ).resolves.toBe(3379)
    await expect(
      getEpisodeVoteCount('tt5884092', { expectedSeriesId: 'tt-wrong' })
    ).rejects.toThrow('unexpected series')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('requires the expected parent series before requesting episode details', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getEpisodeVoteCount('tt5884092')).rejects.toThrow(
      'expected IMDb series ID'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifies OMDb quota responses without relying on arbitrary error text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Response: 'False', Error: 'Request limit reached!' })
      )
    vi.stubGlobal('fetch', fetchMock)

    const error = await getEpisodeVoteCount('tt5884092', {
      expectedSeriesId: 'tt4955642'
    }).catch((caught) => caught)
    await expect(
      getEpisodeVoteCount('tt5884092', { expectedSeriesId: 'tt4955642' })
    ).rejects.toMatchObject({ code: 'quota' })

    expect(error).toMatchObject({
      message: 'Request limit reached!',
      provider: 'omdb',
      code: 'quota'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caches not-found payloads while continuing to surface the OMDb error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Response: 'False', Error: 'Incorrect IMDb ID.' })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      getEpisodeVoteCount('tt-invalid', { expectedSeriesId: 'tt4955642' })
    ).rejects.toThrow('Incorrect IMDb ID')
    await expect(
      getEpisodeVoteCount('tt-invalid', { expectedSeriesId: 'tt4955642' })
    ).rejects.toThrow('Incorrect IMDb ID')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
