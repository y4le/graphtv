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

const comparisonShow = {
  id: 527,
  name: 'The Sopranos',
  premiered: '1999-01-10',
  summary: '<p>A New Jersey crime boss balances family and business.</p>',
  genres: ['Crime', 'Drama'],
  image: null,
  rating: { average: 9.1 },
  externals: { imdb: 'tt0141842', thetvdb: 75299 },
  _embedded: {
    seasons: [1, 2, 3, 4].map((number) => ({ number }))
  }
}
const comparisonEpisodes = Array.from({ length: 86 }, (_, index) => ({
  id: 2001 + index,
  name: `Sopranos Episode ${index + 1}`,
  season: Math.floor(index / 22) + 1,
  number: (index % 22) + 1,
  airdate: `199${9 - Math.min(Math.floor(index / 44), 1)}-03-${String((index % 22) + 1).padStart(2, '0')}`,
  summary: `<p>Sopranos episode ${index + 1} summary.</p>`,
  image: null,
  rating: { average: 7 + ((index * 11) % 28) / 10 }
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
      body = /sopranos/iu.test(url.searchParams.get('q') ?? '')
        ? [{ score: 1, show: comparisonShow }]
        : searchResults
    } else if (url.pathname === '/shows/179/episodes') {
      body = episodes
    } else if (url.pathname === '/shows/179') {
      body = show
    } else if (url.pathname === '/shows/527/episodes') {
      body = comparisonEpisodes
    } else if (url.pathname === '/shows/527') {
      body = comparisonShow
    } else {
      await route.abort('failed')
      return
    }

    await route.fulfill({ json: body })
  })
})

test('renders the landing page as a static episode-ratings index', async ({
  page
}) => {
  await page.goto('/')

  await expect(
    page.getByRole('searchbox', { name: 'Show title' })
  ).toBeVisible()
  await expect(
    page.locator('.show-index-columns span:first-child').first()
  ).toHaveText("Yale's picks")
  await expect(page.locator('.show-index-row')).toHaveCount(20)
  await expect(page.locator('.show-index img')).toHaveCount(0)
  await expect(
    page.locator('.show-index-shape[data-shape-regime="points"]')
  ).not.toHaveCount(0)
  await expect(
    page.locator('.show-index-shape[data-shape-regime="line"]')
  ).not.toHaveCount(0)
  await expect(
    page.locator('.show-index-shape[data-shape-regime="envelope"]')
  ).not.toHaveCount(0)

  const shapeBox = await page
    .locator('.show-index-shape-desktop')
    .first()
    .boundingBox()
  expect(shapeBox?.width).toBeCloseTo(192, 0)
  expect(shapeBox?.height).toBeCloseTo(28, 0)

  await page.getByRole('link', { name: /^Breaking Bad,/u }).click()
  await expect(page).toHaveURL(/show=tvmaze%3A169/u)
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

test('adds a second show and keeps comparison navigation synchronized', async ({
  page
}) => {
  await page.goto('/?show=tvmaze%3A179')
  await expect(page.getByRole('heading', { name: 'The Wire' })).toBeVisible()

  await page.getByRole('button', { name: 'Compare (c)' }).click()
  const picker = page.getByRole('region', {
    name: 'Choose a comparison show'
  })
  await expect(picker).toBeVisible()
  const pickerInput = picker.getByRole('searchbox', { name: 'Show title' })
  await expect(pickerInput).toBeFocused()
  await pickerInput.fill('The Sopranos')
  await picker.getByRole('button', { name: 'Search' }).click()
  await picker.getByRole('button', { name: /The Sopranos/u }).click()

  await expect(page).toHaveURL(/show=tvmaze%3A179.*vs=tvmaze%3A527/u)
  await expect(
    page.getByRole('heading', { name: 'The Wire vs The Sopranos' })
  ).toBeFocused()
  const comparisonTitleSizes = await page
    .locator('.comparison-title')
    .evaluate((title) => ({
      divider: Number.parseFloat(
        getComputedStyle(title.querySelector('.comparison-title-divider'))
          .fontSize
      ),
      title: Number.parseFloat(getComputedStyle(title).fontSize)
    }))
  expect(comparisonTitleSizes.divider).toBeLessThan(comparisonTitleSizes.title)
  await expect(page.locator('.comparison-lane')).toHaveCount(2)
  await expect(page.locator('.comparison-overview-row')).toHaveCount(2)
  await expect(page.locator('.comparison-duplex')).toBeVisible()
  await expect(page.locator('.companion-series-trace')).toHaveCount(0)
  await expect(page.locator('.companion-season-tick')).toHaveCount(0)
  await expect(page.locator('.companion-series-layer')).toHaveCount(0)
  await expect(
    page.locator('.comparison-lane.is-active .comparison-lane-active-label')
  ).toHaveText('Active')
  await expect(page.locator('.comparison-lane-context-key')).toHaveCount(0)
  const overviewLabels = await page
    .locator('.comparison-overview-label')
    .evaluateAll((labels) =>
      labels.map((label) => ({
        clipped: label.scrollWidth > label.clientWidth,
        text: label.textContent,
        title: label.title
      }))
    )
  expect(overviewLabels.map(({ text, title }) => [text, title])).toEqual([
    ['The Wire', 'The Wire'],
    ['The Sopranos', 'The Sopranos']
  ])
  expect(overviewLabels.some(({ clipped }) => clipped)).toBe(true)
  await expect(
    page.locator('.comparison-overview .viewport-brush')
  ).toHaveCount(2)
  await expect(
    page.locator('.comparison-overview-row-a .viewport-brush')
  ).toBeVisible()
  await expect(
    page.locator('.comparison-overview-row-b .viewport-brush')
  ).toBeHidden()
  const sharedBrushBounds = await page.evaluate(() => {
    const overview = document.querySelector('.comparison-overview')
    const firstTrack = overview?.querySelector(
      '.comparison-overview-row-a .sparkline-chart'
    )
    const secondTrack = overview?.querySelector(
      '.comparison-overview-row-b .sparkline-chart'
    )
    const selection = overview?.querySelector(
      '.comparison-overview-row-a .viewport-brush .selection'
    )
    const handles = Array.from(
      overview?.querySelectorAll(
        '.comparison-overview-row-a .viewport-brush .handle'
      ) ?? []
    )

    const toBounds = (element) => {
      const bounds = element?.getBoundingClientRect()
      return bounds
        ? { top: bounds.top, right: bounds.right, bottom: bounds.bottom }
        : null
    }

    return {
      firstTrack: toBounds(firstTrack),
      secondTrack: toBounds(secondTrack),
      selection: toBounds(selection),
      handles: handles.map(toBounds)
    }
  })
  expect(sharedBrushBounds.selection?.top).toBeCloseTo(
    sharedBrushBounds.firstTrack?.top,
    0
  )
  expect(
    Math.abs(
      sharedBrushBounds.selection?.bottom -
        sharedBrushBounds.secondTrack?.bottom
    )
  ).toBeLessThan(1)
  expect(sharedBrushBounds.handles).toHaveLength(2)
  for (const handle of sharedBrushBounds.handles) {
    expect(handle?.top).toBeLessThan(sharedBrushBounds.firstTrack?.top)
    expect(handle?.bottom).toBeGreaterThan(
      sharedBrushBounds.secondTrack?.bottom
    )
  }
  const overviewTrackBox = await page
    .locator('.comparison-overview-row-a .sparkline-chart')
    .boundingBox()
  const firstChartBox = await page
    .locator('.comparison-lane[data-comparison-slot="a"] .ratings-chart')
    .boundingBox()
  expect(overviewTrackBox).not.toBeNull()
  expect(firstChartBox).not.toBeNull()
  expect(overviewTrackBox.x).toBeCloseTo(firstChartBox.x, 0)
  expect(overviewTrackBox.width).toBeCloseTo(firstChartBox.width, 0)

  await page.setViewportSize({ width: 820, height: 800 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const overview = document
          .querySelector('.comparison-overview-row-a .sparkline-chart')
          ?.getBoundingClientRect()
        const chart = document
          .querySelector(
            '.comparison-lane[data-comparison-slot="a"] .ratings-chart'
          )
          ?.getBoundingClientRect()
        return overview && chart
          ? Math.max(
              Math.abs(overview.left - chart.left),
              Math.abs(overview.right - chart.right)
            )
          : Number.POSITIVE_INFINITY
      })
    )
    .toBeLessThan(1)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect
    .poll(() =>
      page.evaluate(() => {
        const overview = document
          .querySelector('.comparison-overview-row-a .sparkline-chart')
          ?.getBoundingClientRect()
        const chart = document
          .querySelector(
            '.comparison-lane[data-comparison-slot="a"] .ratings-chart'
          )
          ?.getBoundingClientRect()
        return overview && chart
          ? Math.max(
              Math.abs(overview.left - chart.left),
              Math.abs(overview.right - chart.right)
            )
          : Number.POSITIVE_INFINITY
      })
    )
    .toBeLessThan(1)

  const sharedSelection = page.locator(
    '.comparison-overview-row-a .viewport-brush .selection'
  )
  const initialSelectionX = Number(await sharedSelection.getAttribute('x'))
  const selectionBox = await sharedSelection.boundingBox()
  const secondTrackBox = await page
    .locator('.comparison-overview-row-b .sparkline-chart')
    .boundingBox()
  expect(selectionBox).not.toBeNull()
  expect(secondTrackBox).not.toBeNull()
  await page.mouse.move(
    selectionBox.x + selectionBox.width / 2,
    secondTrackBox.y + secondTrackBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    selectionBox.x + selectionBox.width / 2 + 30,
    secondTrackBox.y + secondTrackBox.height / 2
  )
  await page.mouse.up()
  await expect
    .poll(async () => Number(await sharedSelection.getAttribute('x')))
    .not.toBe(initialSelectionX)
  await expect(page.locator('.comparison-summary')).toContainText(
    'Rated episodes'
  )
  await expect(page.locator('.comparison-summary caption')).toHaveCount(0)
  await expect(page.locator('.comparison-summary thead')).toHaveCount(0)
  await expect(page.locator('.comparison-caution')).toHaveCount(0)
  await expect(page.locator('.comparison-context')).toBeVisible()
  await expect(page.locator('.comparison-detail')).toBeHidden()

  const firstLane = page.locator('.comparison-lane[data-comparison-slot="a"]')
  const secondLane = page.locator('.comparison-lane[data-comparison-slot="b"]')
  await firstLane.locator('.episode-point').first().hover()
  await expect(firstLane.locator('.crosshair')).toHaveCount(1)
  await expect(secondLane.locator('.crosshair')).toHaveCount(1)
  expect(
    Number(await firstLane.locator('.crosshair').getAttribute('x1'))
  ).toBeCloseTo(
    Number(await secondLane.locator('.crosshair').getAttribute('x1'))
  )
  await page.mouse.move(0, 0)
  await expect(page.locator('.comparison-data .crosshair')).toHaveCount(0)

  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/[?&]select=a%3As01e01(?:&|$)/u)
  await secondLane.locator('.chart-hit-surface').click({
    position: { x: 10, y: 5 }
  })
  await expect(page).not.toHaveURL(/[?&]select=/u)
  await expect(page.locator('.comparison-context')).toBeVisible()
  await firstLane.locator('.comparison-lane-heading').click()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/[?&]select=a%3As01e01(?:&|$)/u)
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page).toHaveURL(/[?&]select=a%3As01e01%2Cb%3As01e01(?:&|$)/u)
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(/[?&]select=a%3As01e01%2Cb%3As01e02(?:&|$)/u)
  const headToHead = page.locator('.comparison-head-to-head')
  await expect(headToHead).toContainText('The Wire · S01E01')
  await expect(headToHead).toContainText('Episode 1')
  await expect(headToHead).toContainText('Sopranos Episode 2')
  await expect(headToHead).not.toContainText(/episodes between|span/iu)
  await expect(page.locator('.comparison-context')).toBeHidden()
  await expect(page.locator('.comparison-detail')).toBeHidden()
  await expect(page.locator('.comparison-data .crosshair')).toHaveCount(2)
  await expect(page.locator('.season-axis-comparison')).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(/[?&]select=a%3As01e01%2Cb%3As01e02(?:&|$)/u)
  await expect(headToHead).toContainText('The Wire · S01E01')
  await expect(headToHead).toContainText('The Sopranos · S01E02')

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/[?&]select=a%3As01e01(?:&|$)/u)
  await expect(page.locator('[data-comparison-detail="a"]')).toContainText(
    'Episode 1'
  )
  await page.keyboard.press('Escape')
  await expect(page).not.toHaveURL(/[?&]select=/u)
  await expect(page.locator('.comparison-context')).toBeVisible()
  await expect(page.locator('.comparison-detail')).toBeHidden()

  const viewports = await page.evaluate(() => {
    const brushes = Array.from(
      document.querySelectorAll('.comparison-overview .selection')
    )
    return brushes.map((brush) => [
      Number(brush.getAttribute('x')),
      Number(brush.getAttribute('width'))
    ])
  })
  expect(viewports[0][0]).toBeCloseTo(viewports[1][0], 3)
  expect(viewports[0][1]).toBeCloseTo(viewports[1][1], 3)

  await page.goto(
    '/?show=tvmaze%3A179&vs=tvmaze%3A527&select=a%3As09e09%2Cb%3As09e09'
  )
  await expect(page.locator('.comparison-context')).toBeVisible()
  await expect(page.locator('.comparison-detail')).toBeHidden()
  await expect(page.locator('.comparison-head-to-head')).toBeHidden()
  await expect(page).not.toHaveURL(/[?&]select=/u)
  await expectNoAccessibilityViolations(page)
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

test('keeps a narrow results masthead within a fine-pointer viewport', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/?show=tvmaze%3A179')
  await expect(page.locator('.sparkline-point')).toHaveCount(72)

  expect(
    await page.evaluate(
      () => matchMedia('(pointer: coarse) and (hover: none)').matches
    )
  ).toBe(false)
  await expect(page.locator('.results-masthead .action-key')).toHaveCount(4)
  for (const key of await page.locator('.results-masthead .action-key').all()) {
    await expect(key).toBeHidden()
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(320)
})

test.describe('mobile chart', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  })

  test('keeps the landing masthead on one line at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')

    const layout = await page
      .locator('.document-shell-search .masthead')
      .evaluate((masthead) => {
        const brand = masthead.querySelector('.publisher-brand')
        const actions = masthead.querySelector('.masthead-actions')
        const brandBounds = brand.getBoundingClientRect()
        const actionBounds = actions.getBoundingClientRect()

        return {
          actionCenter: actionBounds.top + actionBounds.height / 2,
          actionsFollowBrand: actionBounds.left > brandBounds.right,
          brandCenter: brandBounds.top + brandBounds.height / 2,
          fits: masthead.scrollWidth <= masthead.clientWidth
        }
      })

    expect(Math.abs(layout.brandCenter - layout.actionCenter)).toBeLessThan(1)
    expect(layout.actionsFollowBrand).toBe(true)
    expect(layout.fits).toBe(true)
    for (const shortcut of await page.locator('.masthead .action-key').all()) {
      await expect(shortcut).toBeHidden()
    }
  })

  test('stacks index metadata beside touch-sized rating shapes', async ({
    page
  }) => {
    await page.goto('/')

    const firstRow = page.locator('.show-index-row').first()
    const mobileShape = firstRow.locator('.show-index-shape-mobile')
    await expect(mobileShape).toBeVisible()
    await expect(firstRow.locator('.show-index-shape-desktop')).toBeHidden()

    const [rowBox, shapeBox] = await Promise.all([
      firstRow.boundingBox(),
      mobileShape.boundingBox()
    ])
    expect(rowBox?.height).toBeGreaterThanOrEqual(44)
    expect(shapeBox?.width).toBeCloseTo(120, 0)
    expect(shapeBox?.height).toBeCloseTo(24, 0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390)
    await expectNoAccessibilityViolations(page)
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

  test('uses touch-sized navigation and compact options', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/?show=tvmaze%3A179')
    await expect(page.locator('.sparkline-point')).toHaveCount(72)

    const mastheadActions = page.locator('.results-masthead .masthead-action')
    await expect(mastheadActions).toHaveCount(4)
    for (const key of await page
      .locator('.results-masthead .action-key')
      .all()) {
      await expect(key).toBeHidden()
    }
    for (const action of await mastheadActions.all()) {
      expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }

    const mastheadLayout = await page
      .locator('.results-masthead')
      .evaluate((masthead) => {
        const brandBounds = masthead
          .querySelector('.publisher-brand')
          .getBoundingClientRect()
        const actionBounds = Array.from(
          masthead.querySelectorAll('.masthead-action'),
          (action) => action.getBoundingClientRect()
        )
        const centers = [
          brandBounds.top + brandBounds.height / 2,
          ...actionBounds.map((bounds) => bounds.top + bounds.height / 2)
        ]

        return {
          centerSpread: Math.max(...centers) - Math.min(...centers),
          fits: masthead.scrollWidth <= masthead.clientWidth
        }
      })

    expect(mastheadLayout.centerSpread).toBeLessThan(1)
    expect(mastheadLayout.fits).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(320)

    await page.locator('[data-ui-action="view-options"]').click()
    await expect(
      page.getByRole('dialog', { name: 'View options' })
    ).toBeVisible()
    for (const hint of await page.locator('.view-option-hint').all()) {
      await expect(hint).toBeHidden()
    }
    expect(
      (await page.locator('.view-value').first().boundingBox())?.height
    ).toBeGreaterThanOrEqual(44)
    const overlayClose = page.locator('.overlay-panel .overlay-close')
    const closeBox = await overlayClose.boundingBox()
    expect(
      Math.min(closeBox?.width ?? 0, closeBox?.height ?? 0)
    ).toBeGreaterThanOrEqual(44)
    await expectNoAccessibilityViolations(page, '.overlay-root')
    await overlayClose.click()

    await page.setViewportSize({ width: 1024, height: 768 })
    const indexRowSize = await page.evaluate(() => {
      const fixture = document.createElement('div')
      fixture.className = 'document-shell-search'
      fixture.innerHTML = '<a class="show-index-row">Series</a>'
      document.body.append(fixture)
      const bounds = fixture.firstElementChild.getBoundingClientRect()
      fixture.remove()
      return {
        coarse: window.matchMedia('(pointer: coarse)').matches,
        height: bounds.height
      }
    })
    expect(indexRowSize.coarse).toBe(true)
    expect(indexRowSize.height).toBeGreaterThanOrEqual(44)
  })

  test('brings a replacement picker into view', async ({ page }) => {
    await page.goto('/?show=tvmaze%3A179&vs=tvmaze%3A527')
    await expect(page.locator('.comparison-context')).toContainText(
      'The Sopranos'
    )

    const replace = page.locator(
      '.comparison-identity-b [data-comparison-action="replace"]'
    )
    await replace.scrollIntoViewIfNeeded()
    await replace.click()

    const picker = page.locator('.show-picker-root')
    await expect(picker.getByRole('heading')).toHaveText('Replace The Sopranos')
    await expect(picker.getByRole('heading')).toBeVisible()
    await expect(
      picker.getByRole('searchbox', { name: 'Show title' })
    ).toBeFocused()
    await expect
      .poll(() =>
        picker.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.bottom > 0 && bounds.top < window.innerHeight
        })
      )
      .toBe(true)
  })

  test('shrinks long page titles instead of wrapping them', async ({
    page
  }) => {
    await page.goto('/?show=tvmaze%3A179')
    const resultsTitle = page.locator('.results-title')
    await expect(resultsTitle).toBeVisible()
    await expect(resultsTitle).toHaveText('The Wire')
    const resultsMaximum = await resultsTitle.evaluate((title) =>
      Number.parseFloat(getComputedStyle(title).fontSize)
    )
    await resultsTitle.evaluate((title) => {
      title.textContent =
        'The Unnecessarily Long Chronicle of Detectives, Institutions, and the Entire City of Baltimore'
    })

    await expect
      .poll(() =>
        resultsTitle.evaluate((title) =>
          Number.parseFloat(title.style.fontSize)
        )
      )
      .toBeLessThan(resultsMaximum)
    const resultsFit = await resultsTitle.evaluate((title) => ({
      clientWidth: title.clientWidth,
      fontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      fits: title.scrollWidth <= title.clientWidth,
      overflow: getComputedStyle(title).overflow,
      parentRight: title.parentElement.getBoundingClientRect().right,
      right: title.getBoundingClientRect().right,
      scrollWidth: title.scrollWidth,
      textOverflow: getComputedStyle(title).textOverflow,
      whiteSpace: getComputedStyle(title).whiteSpace
    }))
    expect(resultsFit.fontSize).toBeGreaterThanOrEqual(14)
    expect(resultsFit.fits).toBe(false)
    expect(resultsFit.scrollWidth).toBeGreaterThan(resultsFit.clientWidth)
    expect(resultsFit.overflow).toBe('clip')
    expect(resultsFit.right).toBeLessThanOrEqual(resultsFit.parentRight + 1)
    expect(resultsFit.textOverflow).toBe('ellipsis')
    expect(resultsFit.whiteSpace).toBe('nowrap')

    await page.goto('/?show=tvmaze%3A179&vs=tvmaze%3A527')
    const comparisonTitle = page.locator('.comparison-title')
    await expect(comparisonTitle).toBeVisible()
    await expect(comparisonTitle).toHaveText('The Wire vs The Sopranos')
    const comparisonMaximum = await comparisonTitle.evaluate((title) =>
      Number.parseFloat(getComputedStyle(title).fontSize)
    )
    await comparisonTitle.evaluate((title) => {
      title.innerHTML =
        'The Complete History of Baltimore Institutions <span class="comparison-title-divider">vs</span> The Complete History of New Jersey Organized Crime Families'
    })

    await expect
      .poll(() =>
        comparisonTitle.evaluate((title) =>
          Number.parseFloat(title.style.fontSize)
        )
      )
      .toBeLessThan(comparisonMaximum)
    const comparisonFit = await comparisonTitle.evaluate((title) => ({
      clientWidth: title.clientWidth,
      fontSize: Number.parseFloat(getComputedStyle(title).fontSize),
      fits: title.scrollWidth <= title.clientWidth,
      overflow: getComputedStyle(title).overflow,
      parentRight: title.parentElement.getBoundingClientRect().right,
      right: title.getBoundingClientRect().right,
      scrollWidth: title.scrollWidth,
      textOverflow: getComputedStyle(title).textOverflow,
      whiteSpace: getComputedStyle(title).whiteSpace
    }))
    expect(comparisonFit.fontSize).toBeGreaterThanOrEqual(14)
    expect(comparisonFit.fits).toBe(false)
    expect(comparisonFit.scrollWidth).toBeGreaterThan(comparisonFit.clientWidth)
    expect(comparisonFit.overflow).toBe('hidden')
    expect(comparisonFit.right).toBeLessThanOrEqual(
      comparisonFit.parentRight + 1
    )
    expect(comparisonFit.textOverflow).toBe('ellipsis')
    expect(comparisonFit.whiteSpace).toBe('nowrap')
  })

  test('keeps show comparison in one mobile reading column', async ({
    page
  }) => {
    await page.goto('/?show=tvmaze%3A179&vs=tvmaze%3A527')
    await expect(
      page.getByRole('heading', { name: 'The Wire vs The Sopranos' })
    ).toBeVisible()
    await expect(page.locator('.comparison-overview-label')).toHaveText([
      'The Wire',
      'The Sopranos'
    ])
    expect(
      await page
        .locator('.comparison-overview-label')
        .evaluateAll((labels) =>
          labels.every(
            (label) =>
              Number.parseFloat(getComputedStyle(label).fontSize) >= 11 &&
              getComputedStyle(label, '::after').content === 'none' &&
              label.getBoundingClientRect().left >= 0 &&
              label.getBoundingClientRect().right <= window.innerWidth
          )
        )
    ).toBe(true)
    expect(
      await page
        .locator('.comparison-title')
        .evaluate((title) =>
          Number.parseFloat(getComputedStyle(title).fontSize)
        )
    ).toBeLessThanOrEqual(22)
    expect(
      await page.locator('.comparison-lane').evaluateAll((lanes) =>
        lanes.every((lane) => {
          const laneLeft = lane.getBoundingClientRect().left
          const headingLeft = lane
            .querySelector('.comparison-lane-heading h2')
            .getBoundingClientRect().left
          const plotLeft = lane
            .querySelector('.ratings-chart')
            .getBoundingClientRect().left
          const headingInset = headingLeft - laneLeft
          return (
            headingInset >= 15 && headingInset <= 17 && headingLeft < plotLeft
          )
        })
      )
    ).toBe(true)
    expect(
      await page
        .locator('.comparison-identities')
        .evaluate(
          (identities) =>
            getComputedStyle(identities).gridTemplateColumns.split(' ').length
        )
    ).toBe(1)
    const identityBounds = await page
      .locator('.comparison-identity')
      .evaluateAll((identities) =>
        identities.map((identity) => {
          const bounds = identity.getBoundingClientRect()
          return { top: bounds.top, bottom: bounds.bottom }
        })
      )
    expect(identityBounds[1].top).toBeGreaterThan(identityBounds[0].bottom)
    await expect(
      page.locator('.comparison-context .comparison-identity-actions button')
    ).toHaveCount(4)
    await expect(
      page.locator('.comparison-context [data-comparison-action="remove"]')
    ).toHaveCount(0)
    await expect(page.locator('.comparison-context')).not.toContainText(
      'Plotted on'
    )
    expect(
      await page
        .locator('.comparison-context .comparison-identity-actions button')
        .evaluateAll((buttons) =>
          buttons.map((button) => ({
            height: button.getBoundingClientRect().height,
            label: button.getAttribute('aria-label')
          }))
        )
    ).toEqual([
      { height: 44, label: 'Replace The Wire' },
      { height: 44, label: 'Open The Wire alone' },
      { height: 44, label: 'Replace The Sopranos' },
      { height: 44, label: 'Open The Sopranos alone' }
    ])
    expect(
      await page
        .locator('.comparison-summary')
        .evaluate((summary) =>
          Number.parseFloat(getComputedStyle(summary).fontSize)
        )
    ).toBeGreaterThanOrEqual(12)
    expect(
      await page
        .locator('.comparison-layout')
        .evaluate(
          (layout) =>
            getComputedStyle(layout).gridTemplateColumns.split(' ').length
        )
    ).toBe(1)
    await expect(page.locator('.comparison-lane')).toHaveCount(2)
    await expect(page.locator('.comparison-overview-row')).toHaveCount(2)
    const mobileBrushBounds = await page.evaluate(() => {
      const bounds = (selector) =>
        document.querySelector(selector)?.getBoundingClientRect()
      const firstTrack = bounds('.comparison-overview-row-a .sparkline-chart')
      const secondTrack = bounds('.comparison-overview-row-b .sparkline-chart')
      const selection = bounds(
        '.comparison-overview-row-a .viewport-brush .selection'
      )
      return {
        firstTop: firstTrack?.top,
        secondBottom: secondTrack?.bottom,
        selectionTop: selection?.top,
        selectionBottom: selection?.bottom
      }
    })
    expect(mobileBrushBounds.selectionTop).toBeCloseTo(
      mobileBrushBounds.firstTop,
      0
    )
    expect(
      Math.abs(
        mobileBrushBounds.selectionBottom - mobileBrushBounds.secondBottom
      )
    ).toBeLessThan(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth)
    ).toBeLessThanOrEqual(390)

    const secondLane = page.locator(
      '.comparison-lane[data-comparison-slot="b"]'
    )
    await secondLane.scrollIntoViewIfNeeded()
    const firstSecondLanePoint = secondLane.locator('.episode-point').first()
    const pointBox = await firstSecondLanePoint.boundingBox()
    expect(pointBox).not.toBeNull()
    await page.touchscreen.tap(
      pointBox.x + pointBox.width / 2,
      pointBox.y + pointBox.height / 2
    )
    await expect(page).toHaveURL(/[?&]select=b%3As01e01(?:&|$)/u)
    await expect(page.locator('[data-comparison-detail="b"]')).toContainText(
      'Sopranos Episode 1'
    )
    await expect(page.locator('.comparison-data .crosshair')).toHaveCount(2)

    const mobileHeadToHeadButton = page.getByRole('button', {
      name: 'Compare with The Wire'
    })
    await page.locator('.comparison-reading-pane').scrollIntoViewIfNeeded()
    const headToHeadButtonBox = await mobileHeadToHeadButton.boundingBox()
    expect(headToHeadButtonBox).not.toBeNull()
    await page.touchscreen.tap(
      headToHeadButtonBox.x + headToHeadButtonBox.width / 2,
      headToHeadButtonBox.y + headToHeadButtonBox.height / 2
    )
    const firstLane = page.locator('.comparison-lane[data-comparison-slot="a"]')
    await firstLane.scrollIntoViewIfNeeded()
    const firstLanePointBox = await firstLane
      .locator('.episode-point')
      .first()
      .boundingBox()
    expect(firstLanePointBox).not.toBeNull()
    await page.touchscreen.tap(
      firstLanePointBox.x + firstLanePointBox.width / 2,
      firstLanePointBox.y + firstLanePointBox.height / 2
    )
    await expect(page).toHaveURL(/[?&]select=a%3As01e01%2Cb%3As01e01(?:&|$)/u)
    await expect(page.locator('.comparison-head-to-head')).toContainText(
      'The Wire · S01E01'
    )
    await expect(page.locator('.comparison-head-to-head')).toContainText(
      'Episode 1'
    )
    await expect(page.locator('.comparison-head-to-head')).toContainText(
      'Sopranos Episode 1'
    )
    await expect(page.locator('.comparison-head-to-head')).not.toContainText(
      /episodes between|span/iu
    )
    await expectNoAccessibilityViolations(page)
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
