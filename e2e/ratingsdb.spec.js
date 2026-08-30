import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const RATINGSDB_ORIGIN = 'https://ratingsdb.test'
const legacyProviderRoutes = [
  'https://api.tvmaze.com/**',
  'https://api.themoviedb.org/**',
  'https://www.omdbapi.com/**'
]
const baseBundle = JSON.parse(
  readFileSync(
    new URL('../test/fixtures/ratingsdb/short-series.json', import.meta.url),
    'utf8'
  )
)
const searchResponse = {
  results: [
    {
      id: 'tt9000001',
      title: 'Contract Show',
      year: '2026',
      poster: null,
      genres: ['Drama', 'Mystery'],
      externalIds: {
        imdb: 'tt9000001',
        tmdb: '9001',
        tvmaze: '901'
      }
    }
  ]
}

function createBundle() {
  const bundle = structuredClone(baseBundle)
  const episodeTemplate = bundle.seasons[0].episodes[0]
  bundle.show.poster = null
  bundle.show.totalSeasons = 2
  bundle.seasons = [1, 2].map((season) => ({
    number: season,
    title: `Season ${season}`,
    episodes: Array.from({ length: 12 }, (_, index) => {
      const sequence = (season - 1) * 12 + index
      const episodeId = `tt${String(9_000_002 + sequence)}`
      return {
        ...structuredClone(episodeTemplate),
        id: episodeId,
        title: `Episode ${sequence + 1}`,
        season,
        episode: index + 1,
        date: `202${season + 4}-${String(index + 1).padStart(2, '0')}-01`,
        sourceIds: { imdb: episodeId }
      }
    })
  }))
  bundle.stats.episodes = 24
  bundle.stats.rated = { imdb: 24, tmdb: 24, combined: 24 }
  return bundle
}

function createCompanionBundle(id = 'tt9000900', title = 'Companion Show') {
  const bundle = createBundle()
  bundle.show.id = id
  bundle.show.title = title
  bundle.show.totalSeasons = 1
  bundle.show.externalIds.imdb = id
  bundle.seasons = bundle.seasons.slice(0, 1)
  bundle.seasons[0].episodes = bundle.seasons[0].episodes.map(
    (episode, index) => {
      const episodeId = `tt${9_000_901 + index}`
      return {
        ...episode,
        id: episodeId,
        sourceIds: { ...episode.sourceIds, imdb: episodeId }
      }
    }
  )
  bundle.stats.episodes = bundle.seasons[0].episodes.length
  bundle.stats.rated = {
    imdb: bundle.stats.episodes,
    tmdb: bundle.stats.episodes,
    combined: bundle.stats.episodes
  }
  return bundle
}

function createDiagnosticsBundle() {
  const bundle = createBundle()
  bundle.incomplete = true
  bundle.providers = [
    {
      source: 'imdb',
      status: 'fresh',
      contributed: true,
      lastSuccessAt: '2026-09-01T10:00:00Z',
      expiresAt: '2026-09-01T18:00:00Z'
    },
    {
      source: 'tmdb',
      status: 'failed',
      contributed: false,
      reason: 'upstream_error'
    },
    {
      source: 'rtCritics',
      status: 'redacted',
      contributed: false,
      reason: 'provider_redacted'
    },
    {
      source: 'combined',
      status: 'computed',
      contributed: true
    }
  ]
  return bundle
}

async function installRoutes(
  page,
  { bundle = createBundle(), handleChart } = {}
) {
  const legacyRequests = []
  const chartPaths = []
  const chartRequestTimes = []

  for (const pattern of legacyProviderRoutes) {
    await page.route(pattern, (route) => {
      legacyRequests.push(route.request().url())
      return route.abort('blockedbyclient')
    })
  }

  await page.route(`${RATINGSDB_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/v1/search') {
      await fulfillJson(route, searchResponse)
      return
    }

    if (/^\/api\/v1\/series\/[^/]+\/chart$/u.test(url.pathname)) {
      chartPaths.push(url.pathname)
      chartRequestTimes.push(Date.now())
      if (handleChart) {
        await handleChart(route, chartPaths.length)
      } else {
        await fulfillJson(route, bundle)
      }
      return
    }

    await route.abort('failed')
  })

  return { chartPaths, chartRequestTimes, legacyRequests }
}

async function fulfillJson(route, body, { headers = {}, status = 200 } = {}) {
  await route.fulfill({
    status,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'Retry-After',
      ...headers
    },
    json: body
  })
}

test('searches into a RatingsDB chart without contacting legacy hosts', async ({
  page
}) => {
  const requests = await installRoutes(page)
  await page.goto('/?api=ratingsdb')

  const searchbox = page.getByRole('searchbox', { name: 'Show title' })
  await searchbox.fill('Contract Show')
  await searchbox.press('Enter')
  await expect(page.getByRole('link', { name: /Contract Show/u })).toBeVisible()
  await page.keyboard.press('Enter')

  await expect(
    page.getByRole('heading', { name: 'Contract Show' })
  ).toBeVisible()
  await expect(page.locator('.episode-point').first()).toBeVisible()
  await expect(page).toHaveURL(/show=ratingsdb%3Att9000001/u)
  await expect(page).toHaveURL(/[?&]api=ratingsdb(?:&|$)/u)
  expect(requests.chartPaths).toStrictEqual(['/api/v1/series/tt9000001/chart'])
  expect(requests.legacyRequests).toStrictEqual([])
})

test('compares two RatingsDB series without contacting legacy hosts', async ({
  page
}) => {
  const primary = createBundle()
  const companion = createCompanionBundle()
  const requests = await installRoutes(page, {
    async handleChart(route) {
      const reference = new URL(route.request().url()).pathname.split('/')[4]
      await fulfillJson(
        route,
        reference === companion.show.id ? companion : primary
      )
    }
  })

  await page.goto(
    '/?api=ratingsdb&show=ratingsdb%3Att9000001&vs=ratingsdb%3Att9000900'
  )

  await expect(
    page.getByRole('heading', { name: 'Contract Show vs Companion Show' })
  ).toBeVisible()
  await expect(page.locator('.comparison-lane')).toHaveCount(2)
  // Both lanes load concurrently, so only the set of request paths is stable.
  expect([...requests.chartPaths].sort()).toStrictEqual([
    '/api/v1/series/tt9000001/chart',
    '/api/v1/series/tt9000900/chart'
  ])
  await expect(page).toHaveURL(/[?&]api=ratingsdb(?:&|$)/u)
  expect(requests.legacyRequests).toStrictEqual([])
})

test('honors two measured pending delays before rendering a series', async ({
  page
}) => {
  const bundle = createBundle()
  const requests = await installRoutes(page, {
    async handleChart(route, attempt) {
      if (attempt < 3) {
        await fulfillJson(
          route,
          {
            error: 'Hydration in progress',
            code: 'hydration_pending',
            degradation: {
              capability: 'hydration',
              reason: 'request_budget_exhausted'
            }
          },
          { headers: { 'Retry-After': '2' }, status: 202 }
        )
        return
      }
      await fulfillJson(route, bundle)
    }
  })

  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9000001')

  await expect(page.locator('.episode-point').first()).toBeVisible()
  expect(requests.chartRequestTimes).toHaveLength(3)
  expect(
    requests.chartRequestTimes[1] - requests.chartRequestTimes[0]
  ).toBeGreaterThanOrEqual(1_900)
  expect(
    requests.chartRequestTimes[2] - requests.chartRequestTimes[1]
  ).toBeGreaterThanOrEqual(1_900)
  expect(requests.chartPaths).toStrictEqual([
    '/api/v1/series/tt9000001/chart',
    '/api/v1/series/tt9000001/chart',
    '/api/v1/series/tt9000001/chart'
  ])
  expect(requests.legacyRequests).toStrictEqual([])
})

test('offers a retry after fast pending exhaustion and preserves the route', async ({
  page
}) => {
  const bundle = createBundle()
  let ready = false
  const requests = await installRoutes(page, {
    handleChart: (route) =>
      ready
        ? fulfillJson(route, bundle)
        : fulfillJson(
            route,
            {
              error: 'Hydration in progress',
              code: 'hydration_pending'
            },
            { headers: { 'Retry-After': '0' }, status: 202 }
          )
  })

  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9000001')

  await expect(page.locator('.pending-state-copy')).toHaveText(
    'This series is still being prepared. Try again in a moment.'
  )
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeVisible()
  expect(requests.chartPaths).toHaveLength(3)
  await expect(page).toHaveURL(/[?&]api=ratingsdb(?:&|$)/u)
  await expect(page).toHaveURL(/show=ratingsdb%3Att9000001/u)

  ready = true
  await retry.click()

  await expect(page.locator('.episode-point').first()).toBeVisible()
  expect(requests.chartPaths).toHaveLength(4)
  expect(requests.legacyRequests).toStrictEqual([])
})

test('renders an unknown RatingsDB series as an error', async ({ page }) => {
  const requests = await installRoutes(page, {
    handleChart: (route) =>
      fulfillJson(route, { error: 'Not found' }, { status: 404 })
  })

  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9999999')

  await expect(page.locator('.error-state')).toBeVisible()
  expect(requests.chartPaths).toStrictEqual(['/api/v1/series/tt9999999/chart'])
  expect(requests.legacyRequests).toStrictEqual([])
})

test('exposes RatingsDB provider statuses through debug diagnostics', async ({
  page
}) => {
  const requests = await installRoutes(page, {
    bundle: createDiagnosticsBundle()
  })
  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9000001')
  await expect(page.locator('.episode-point').first()).toBeVisible()
  await expect(page.locator('.results-progress')).toHaveText('TMDB unavailable')

  await page.keyboard.press('Shift+D')
  const section = page.locator('.debug-section').filter({
    has: page.getByRole('heading', { name: 'Merged bundle' })
  })
  const href = await section.locator('.debug-raw-link').getAttribute('href')
  const bundle = JSON.parse(
    decodeURIComponent(href.slice(href.indexOf(',') + 1))
  )
  const sources = Object.fromEntries(
    bundle.sourceStatus.sources.map((item) => [
      item.source,
      { reason: item.reason, status: item.status }
    ])
  )

  expect(bundle.sourceStatus.incomplete).toBe(true)
  expect(sources).toStrictEqual({
    combined: { reason: null, status: 'loaded' },
    imdb: { reason: null, status: 'loaded' },
    rtCritics: { reason: 'provider_redacted', status: 'skipped' },
    tmdb: { reason: 'upstream_error', status: 'failed' }
  })
  expect(requests.legacyRequests).toStrictEqual([])
})

test('reveals hidden RatingsDB rating sources from the debug overlay', async ({
  page
}) => {
  const requests = await installRoutes(page)
  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9000001')

  const ratingSources = page.locator('.rating-badge-source')
  await expect(ratingSources).toHaveText(['Combined', 'IMDb'])
  await page.keyboard.press('Shift+D')
  await page.getByRole('button', { name: 'Show hidden rating sources' }).click()

  await expect(ratingSources).toHaveText([
    'Combined',
    'IMDb',
    'RT Critics',
    'Metacritic'
  ])
  expect(requests.legacyRequests).toStrictEqual([])
})

test('credits the rating sources a RatingsDB chart actually shows', async ({
  page
}) => {
  const requests = await installRoutes(page)
  await page.goto('/?api=ratingsdb&show=ratingsdb%3Att9000001')
  await expect(page.locator('.episode-point').first()).toBeVisible()

  await page.getByRole('button', { name: /Help/u }).click()
  await page.getByRole('button', { name: 'Credits & attribution' }).click()
  const credits = page.locator('[data-credit-provider]')
  await expect(credits).toHaveCount(3)
  expect(
    await credits.evaluateAll((items) =>
      items.map((item) => item.dataset.creditProvider)
    )
  ).toStrictEqual(['ratingsdb', 'imdb', 'tmdb'])
  await expect(page.locator('.credits-current-data')).not.toContainText(
    'Used with permission'
  )
  await page.getByRole('button', { name: 'Close overlay' }).click()

  await page.keyboard.press('Shift+D')
  await page.getByRole('button', { name: 'Show hidden rating sources' }).click()
  await expect(page.locator('.episode-point').first()).toBeVisible()
  await page.getByRole('button', { name: /Help/u }).click()
  await page.getByRole('button', { name: 'Credits & attribution' }).click()

  await expect(credits).toHaveCount(5)
  expect(
    await credits.evaluateAll((items) =>
      items.map((item) => item.dataset.creditProvider)
    )
  ).toStrictEqual(['ratingsdb', 'imdb', 'tmdb', 'rottentomatoes', 'metacritic'])
  expect(requests.legacyRequests).toStrictEqual([])
})

test('adopts landing references for RatingsDB without loading legacy data', async ({
  page
}) => {
  const requests = await installRoutes(page)
  await page.goto('/?api=ratingsdb')

  const href = await page
    .getByRole('link', { name: /^Breaking Bad,/u })
    .getAttribute('href')
  const target = new URL(href, page.url())

  expect(target.searchParams.get('show')).toBe('ratingsdb:tvmaze:169')
  expect(target.searchParams.get('api')).toBe('ratingsdb')
  expect(requests.chartPaths).toStrictEqual([])
  expect(requests.legacyRequests).toStrictEqual([])
})
