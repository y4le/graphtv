import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearApiCache } from '../../src/data/apiCache.js'
import { getShowBundle, searchShows } from '../../src/data/provider.js'

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' }
  })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await clearApiCache()
})

describe('provider cache integration', () => {
  it('reuses cached raw search responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          show: {
            id: 2790,
            name: 'The Good Place',
            premiered: '2016-09-19',
            genres: ['Comedy']
          }
        }
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = await searchShows('the good place', 'tvmaze')
    const second = await searchShows('the good place', 'tvmaze')

    expect(first).toEqual(second)
    expect(first[0].title).toBe('The Good Place')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('loads a complete show bundle twice without repeating upstream requests', async () => {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/shows/2790?embed=seasons')) {
        return Promise.resolve(
          jsonResponse({
            id: 2790,
            name: 'The Good Place',
            premiered: '2016-09-19',
            genres: ['Comedy'],
            rating: { average: 8.2 },
            externals: { imdb: 'tt4955642' },
            _embedded: { seasons: [{ id: 1 }] }
          })
        )
      }

      return Promise.resolve(
        jsonResponse([
          {
            id: 123,
            name: 'Everything Is Fine',
            season: 1,
            number: 1,
            airdate: '2016-09-19',
            rating: { average: 8.1 }
          }
        ])
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = await getShowBundle('tvmaze:2790', { compareProviders: [] })
    const second = await getShowBundle('tvmaze:2790', { compareProviders: [] })

    expect(first.show.title).toBe('The Good Place')
    expect(second.seasons[0].episodes[0].title).toBe('Everything Is Fine')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
