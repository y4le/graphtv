import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const show = {
  id: 179,
  name: 'The Wire',
  premiered: '2002-06-02',
  summary: '<p>Baltimore detectives investigate a drug organization.</p>',
  genres: ['Crime', 'Drama'],
  image: null,
  rating: { average: 8.9 },
  externals: { imdb: 'tt0306414', thetvdb: 79126 },
  _embedded: {
    seasons: [1, 2, 3].map((number) => ({ number }))
  }
}

const searchResults = [{ score: 1, show }]
const episodes = Array.from({ length: 72 }, (_, index) => ({
  id: 1001 + index,
  name: `Episode ${index + 1}`,
  season: Math.floor(index / 24) + 1,
  number: (index % 24) + 1,
  airdate: `200${2 + Math.floor(index / 24)}-06-${String((index % 24) + 1).padStart(2, '0')}`,
  summary: `<p>Episode ${index + 1} summary.</p>`,
  image: null,
  rating: { average: 6.5 + ((index * 7) % 30) / 10 }
}))

test.beforeEach(async ({ page }) => {
  await page.route('https://api.themoviedb.org/**', (route) =>
    route.abort('blockedbyclient')
  )
  await page.route('https://www.omdbapi.com/**', (route) =>
    route.abort('blockedbyclient')
  )
  await page.route('https://api.tvmaze.com/**', async (route) => {
    const url = new URL(route.request().url())
    let body

    if (url.pathname === '/search/shows') {
      body = searchResults
    } else if (url.pathname === '/shows/179/episodes') {
      body = episodes
    } else if (url.pathname === '/shows/179') {
      body = show
    } else {
      await route.abort('failed')
      return
    }

    await route.fulfill({ json: body })
  })
})

test('searches, navigates the chart, and isolates modal interaction', async ({
  page
}) => {
  await page.goto('/')
  const searchInput = page.getByRole('searchbox', { name: 'Show title' })
  await expect(searchInput).toBeFocused()

  await searchInput.fill('The Wire')
  await searchInput.press('Enter')
  await expect(page.getByRole('link', { name: /The Wire/ })).toBeVisible()
  await expectNoAccessibilityViolations(page)

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/show=tvmaze%3A179/)
  await expect(page.getByRole('heading', { name: 'The Wire' })).toBeVisible()
  await expect(page.locator('.sparkline-point')).toHaveCount(72)
  await expect(page.locator('.episode-point').first()).toBeVisible()
  // A second provider badge means the supposedly hermetic build loaded a local key.
  await expect(page.locator('.rating-badge')).toHaveCount(1)

  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.results-episode')).toContainText('Episode 1')

  const optionsButton = page.getByRole('button', { name: 'Options (o)' })
  await optionsButton.click()
  await expect(page.getByRole('dialog', { name: 'View options' })).toBeVisible()
  await expect(page.locator('#app')).toHaveAttribute('inert', '')
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await page.locator('[data-view-theme="dark"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expectNoAccessibilityViolations(page, '.overlay-root')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '')
  await expect(optionsButton).toBeFocused()

  await expectNoAccessibilityViolations(page)
})

test.describe('mobile chart', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  })

  test('pans the shared viewport with a touch gesture', async ({ page }) => {
    await page.goto('/?show=tvmaze%3A179')
    await expect(page.locator('.sparkline-point')).toHaveCount(72)
    await expect(page.locator('.episode-point').first()).toBeVisible()

    const status = page.locator('.chart-viewport-status')
    const chartBody = page.locator('.chart-body-shell')
    const box = await chartBody.boundingBox()
    expect(box).not.toBeNull()

    await chartBody.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.8,
      clientY: box.y + box.height / 2,
      bubbles: true
    })
    await chartBody.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.2,
      clientY: box.y + box.height / 2,
      bubbles: true
    })
    await chartBody.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: box.x + box.width * 0.2,
      clientY: box.y + box.height / 2,
      bubbles: true
    })

    await expect(status).not.toHaveText('')
    await expect(page.locator('.ratings-chart')).toBeVisible()
  })
})

async function expectNoAccessibilityViolations(page, include) {
  let builder = new AxeBuilder({ page })
  if (include) {
    builder = builder.include(include)
  }
  const accessibility = await builder.analyze()
  expect(accessibility.violations).toEqual([])
}
