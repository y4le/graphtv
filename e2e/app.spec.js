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
  const resultsTitle = page.getByRole('heading', { name: 'The Wire' })
  await expect(resultsTitle).toBeVisible()
  await expect(resultsTitle).toBeFocused()
  await expect(resultsTitle).toHaveCSS('outline-style', 'none')
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

  await page.keyboard.press('m')
  const dock = page.getByRole('region', { name: 'Mark scaling' })
  await expect(dock).toBeVisible()
  await expect(page.locator('#app')).not.toHaveAttribute('inert', '')
  const sparseRamp = page.getByRole('slider', {
    name: 'Pixels per episode where sparse sizing applies'
  })
  await sparseRamp.focus()
  await sparseRamp.press('ArrowRight')
  await expect(sparseRamp).toHaveValue('81')
  await expect(page.locator('.dock-panel')).toContainText('81px')
  await expectNoAccessibilityViolations(page, '.dock-root')

  // The chart stays interactive while the dock is open.
  await page.locator('.episode-point').nth(2).click()
  await expect(dock).toBeVisible()

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(sparseRamp).toHaveValue('80')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Mark scaling' })).toHaveCount(
    0
  )

  await expectNoAccessibilityViolations(page)
})

test('keeps a shared chart selection across reloads', async ({ page }) => {
  await page.goto('/?show=tvmaze%3A179')
  await expect(page.locator('.sparkline-point')).toHaveCount(72)

  await page.locator('.episode-point').nth(2).click()

  await expect(page).toHaveURL(/[?&]select=s01e03(?:&|$)/u)
  await expect(page.locator('.results-episode')).toContainText('Episode 3')

  await page.reload()

  await expect(page.locator('.sparkline-point')).toHaveCount(72)
  await expect(page.locator('.results-episode')).toContainText('Episode 3')
  await expect(page).toHaveURL(/[?&]select=s01e03(?:&|$)/u)

  await page.keyboard.press('Escape')

  await expect(page).not.toHaveURL(/[?&]select=/u)
  await expect(page.locator('.results-episode')).toContainText('Full Series')

  await page.reload()

  await expect(page.locator('.results-episode')).toContainText('Full Series')
  await expect(page).not.toHaveURL(/[?&]select=/u)
})

test('compares two episodes with pointer and keyboard controls', async ({
  page
}) => {
  await page.goto('/?show=tvmaze%3A179')
  await expect(page.locator('.episode-point').first()).toBeVisible()

  await page.locator('.episode-point').nth(1).click()
  await page
    .locator('.episode-point')
    .nth(5)
    .click({ modifiers: ['Shift'] })

  const comparison = page.locator('.sidenote-comparison')
  await expect(comparison).toBeVisible()
  await expect(page.locator('.sidenote-nav-label')).toHaveAttribute(
    'aria-label',
    'S01E02 - S01E06'
  )
  await expect(
    comparison.locator('.sidenote-comparison-rating-rank')
  ).toHaveCount(2)
  const firstRank = comparison
    .locator('.sidenote-comparison-rating-rank')
    .first()
  const rankTooltip = firstRank.locator(
    '.sidenote-comparison-rating-rank-tooltip'
  )
  await firstRank.locator('.sidenote-comparison-rating-rank-trigger').click()
  await expect(rankTooltip).toBeVisible()
  await expect(rankTooltip).toContainText(
    /Rank \d+ of 72 rated episodes by TVmaze score, from highest to lowest\./u
  )
  await firstRank.locator('.sidenote-comparison-rating-rank-trigger').click()
  await expect(rankTooltip).not.toBeVisible()
  await expect(page.locator('.season-axis-comparison')).toHaveCount(1)
  await expect(page.locator('.sidenote-nav')).toBeVisible()
  await expect(page.locator('[data-sidenote-nav="next"]')).not.toBeVisible()
  await expect(page).toHaveURL(/[?&]select=s01e02-s01e06(?:&|$)/u)
  await expect(page).not.toHaveURL(/[?&](?:compare|pair)=/u)

  await page.setViewportSize({ width: 700, height: 800 })
  expect(
    await comparison
      .locator('.sidenote-comparison-episodes')
      .evaluate(
        (episodes) =>
          getComputedStyle(episodes).gridTemplateColumns.split(' ').length
      )
  ).toBe(2)
  await page.setViewportSize({ width: 1280, height: 720 })

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('End')
  await expect(comparison).toBeVisible()
  await expect(page.locator('.sidenote-nav-label')).toHaveAttribute(
    'aria-label',
    'S01E02 - S01E06'
  )

  await page.keyboard.press('Escape')
  await expect(comparison).toHaveCount(0)
  await expect(page.locator('.results-episode')).toContainText('Episode 2')

  await page.keyboard.press('v')
  await expect(page.locator('.results-episode')).toContainText(
    'Choose a second episode to compare with S01E02.'
  )
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(comparison).toBeVisible()
  await expect(page.locator('.sidenote-nav-label')).toHaveAttribute(
    'aria-label',
    'S01E02 - S01E03'
  )
  await expectNoAccessibilityViolations(page, '.results-episode')

  await page.reload()
  await expect(page.locator('.sparkline-point')).toHaveCount(72)
  await expect(comparison).toBeVisible()
  await expect(page.locator('.sparkline-selection-point')).toHaveCount(2)
})

test('scrubs episodes across empty chart space and commits on release', async ({
  page
}) => {
  await page.goto('/?show=tvmaze%3A179')
  await expect(page.locator('.episode-point').first()).toBeVisible()

  const chartBody = page.locator('.chart-body-shell')
  const hitSurface = page.locator('.chart-hit-surface')
  const box = await chartBody.boundingBox()
  expect(box).not.toBeNull()
  await expect(hitSurface).toHaveCSS('cursor', 'default')

  await hitSurface.dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: box.x + box.width * 0.2,
    clientY: box.y + 20,
    bubbles: true
  })
  await chartBody.dispatchEvent('pointermove', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: box.x + box.width * 0.7,
    clientY: box.y + 20,
    bubbles: true
  })

  await expect(chartBody).toHaveClass(/is-scrubbing/u)
  await expect(chartBody).toHaveCSS('cursor', 'col-resize')
  await expect(page.locator('.crosshair')).toHaveCount(1)
  await expect(page).not.toHaveURL(/[?&]select=/u)

  await chartBody.dispatchEvent('pointerup', {
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: box.x + box.width * 0.7,
    clientY: box.y + 20,
    bubbles: true
  })

  await expect(chartBody).not.toHaveClass(/is-scrubbing/u)
  await expect(page).toHaveURL(/[?&]select=s\d+e\d+(?:&|$)/u)
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

  test('holds before scrubbing with touch', async ({ page }) => {
    await page.goto('/?show=tvmaze%3A179')
    await expect(page.locator('.episode-point').first()).toBeVisible()

    const chartBody = page.locator('.chart-body-shell')
    const hitSurface = page.locator('.chart-hit-surface')
    const box = await chartBody.boundingBox()
    expect(box).not.toBeNull()
    await expect(chartBody).toHaveCSS('touch-action', 'pan-y')

    await hitSurface.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width * 0.25,
      clientY: box.y + 20,
      bubbles: true
    })
    await page.waitForTimeout(320)
    await expect(chartBody).toHaveClass(/is-scrubbing/u)

    await chartBody.dispatchEvent('pointermove', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width * 0.65,
      clientY: box.y + 22,
      bubbles: true
    })
    await chartBody.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width * 0.65,
      clientY: box.y + 22,
      bubbles: true
    })

    await expect(chartBody).not.toHaveClass(/is-scrubbing/u)
    await expect(page).toHaveURL(/[?&]select=s\d+e\d+(?:&|$)/u)
  })

  test('compares episodes through explicit touch controls', async ({
    page
  }) => {
    await page.goto('/?show=tvmaze%3A179')
    await expect(page.locator('.episode-point').first()).toBeVisible()

    await page.locator('.episode-point').nth(1).tap()
    const compareButton = page.getByRole('button', {
      name: 'Compare with another episode'
    })
    await expect(compareButton).toBeVisible()
    await expect(compareButton).toHaveText('⚖')
    expect(
      await compareButton.evaluate(
        (button) => button.getBoundingClientRect().height
      )
    ).toBeGreaterThanOrEqual(44)
    expect(
      await page.locator('.sidenote-nav').evaluate((navigator) => {
        const navigatorBounds = navigator.getBoundingClientRect()
        const centerBounds = navigator
          .querySelector('.sidenote-nav-center')
          .getBoundingClientRect()
        return Math.abs(
          navigatorBounds.left +
            navigatorBounds.width / 2 -
            (centerBounds.left + centerBounds.width / 2)
        )
      })
    ).toBeLessThan(1)
    await compareButton.tap()
    await expect(page.locator('.results-episode')).toContainText(
      'Choose a second episode to compare with S01E02.'
    )

    await page.locator('.episode-point').nth(5).tap()
    const comparison = page.locator('.sidenote-comparison')
    await expect(comparison).toBeVisible()
    await expect(page.locator('.sidenote-nav-label')).toHaveAttribute(
      'aria-label',
      'S01E02 - S01E06'
    )
    await expect(page.locator('.season-axis-comparison')).toHaveCount(1)
    expect(
      await comparison
        .locator('.sidenote-comparison-episodes')
        .evaluate(
          (episodes) =>
            getComputedStyle(episodes).gridTemplateColumns.split(' ').length
        )
    ).toBe(1)
    await expectNoAccessibilityViolations(page, '.results-episode')
  })

  test('keeps an armed scrub active outside the plot without scrolling', async ({
    page,
    context
  }) => {
    await page.goto('/?show=tvmaze%3A179')
    await expect(page.locator('.episode-point').first()).toBeVisible()

    const chartBody = page.locator('.chart-body-shell')
    const box = await chartBody.boundingBox()
    expect(box).not.toBeNull()
    const start = await page.evaluate((bounds) => {
      for (let y = bounds.y + 10; y < bounds.y + bounds.height; y += 20) {
        for (let x = bounds.x + 10; x < bounds.x + bounds.width; x += 20) {
          if (document.elementFromPoint(x, y)?.matches('.chart-hit-surface')) {
            return { x, y, id: 1 }
          }
        }
      }
      throw new Error('No empty chart coordinate found')
    }, box)
    const session = await context.newCDPSession(page)

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start]
    })
    await page.waitForTimeout(320)
    await expect(chartBody).toHaveClass(/is-scrubbing/u)
    const initialCrosshairX = await page
      .locator('.crosshair')
      .first()
      .getAttribute('x1')
    const initialScrollY = await page.evaluate(() => window.scrollY)

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: Math.min(389, box.x + box.width + 20),
          y: 1,
          id: 1
        }
      ]
    })
    await page.waitForTimeout(100)

    await expect(chartBody).toHaveClass(/is-scrubbing/u)
    await expect(page.locator('.crosshair').first()).not.toHaveAttribute(
      'x1',
      initialCrosshairX
    )
    expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY)

    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    })
    await expect(chartBody).not.toHaveClass(/is-scrubbing/u)
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
