import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderComparisonPage } from '../../src/pages/compare.js'

let originalPath
let originalTitle

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  originalTitle = document.title
})

afterEach(() => {
  window.history.replaceState({}, '', originalPath)
  document.title = originalTitle
  document.body.replaceChildren()
})

describe('renderComparisonPage', () => {
  it('loads both shows onto a shared source, scale, and episode extent', async () => {
    window.history.replaceState(
      {},
      '',
      '/graphtv/?show=tvmaze%3A1&vs=tvmaze%3A2'
    )
    const bundles = {
      'tvmaze:1': createBundle('First Show', 3, 'omdb'),
      'tvmaze:2': createBundle('Second Show', 5, 'omdb')
    }
    const bundleStream = createBundleStream(bundles)
    const charts = []
    const chartFactory = vi.fn((root, seasons, options) => {
      const chart = createChartDouble(options)
      charts.push(chart)
      return chart
    })
    const container = document.createElement('div')
    document.body.append(container)

    const page = await renderComparisonPage(container, 'tvmaze:1', 'tvmaze:2', {
      bundleStream,
      chartFactory,
      detailLoaderFactory: vi.fn(() => vi.fn()),
      compareProviders: { a: [], b: [] }
    })
    await page.whenSettled

    expect(container.querySelector('.comparison-title').textContent).toBe(
      'First Show vs Second Show'
    )
    expect(
      container.querySelector('.comparison-title-divider').textContent
    ).toBe('vs')
    expect(container.querySelector('.comparison-heading .eyebrow')).toBeNull()
    expect(container.querySelector('.comparison-subtitle')).toBeNull()
    expect(chartFactory).toHaveBeenCalledTimes(2)
    const optionsByTitle = Object.fromEntries(
      chartFactory.mock.calls.map((call) => [call[2].show.title, call[2]])
    )
    expect(optionsByTitle['First Show']).toMatchObject({
      comparisonXMax: 3,
      primaryRatingSource: null,
      strictPrimaryRatingSource: true,
      compact: true,
      allowEpisodeComparison: false,
      restingSelection: 'none',
      ariaLabel: 'Episode ratings, First Show'
    })
    expect(charts[0].updateSeasons.mock.calls.at(-1)[1]).toMatchObject({
      comparisonXMax: 5,
      primaryRatingSource: 'omdb',
      strictPrimaryRatingSource: true,
      sharedRatings: expect.arrayContaining([7, 7.4])
    })
    expect(optionsByTitle['Second Show']).toMatchObject({
      comparisonXMax: 5,
      primaryRatingSource: 'omdb',
      strictPrimaryRatingSource: true,
      compact: true,
      allowEpisodeComparison: false,
      restingSelection: 'none',
      ariaLabel: 'Episode ratings, Second Show'
    })
    expect(
      charts[0].updateSeasons.mock.calls.at(-1)[1].sharedRatings
    ).toHaveLength(8)
    expect(container.querySelector('.comparison-caution')).toBeNull()
    expect(container.querySelector('.comparison-summary')).not.toBeNull()
    expect(container.querySelector('.comparison-method-note').textContent).toBe(
      'IMDb ratings reflect each show’s voting audience. Adjacent values provide context, not a winner.'
    )
    expect(container.querySelector('.comparison-summary caption')).toBeNull()
    expect(container.querySelector('.comparison-summary thead')).toBeNull()
    expect(container.querySelectorAll('.artwork-missing')).toHaveLength(2)
    expect(container.textContent).not.toContain('No art')
    expect(
      container.querySelector('.comparison-context').textContent
    ).not.toContain('Plotted on')
    const identityActions = Array.from(
      container.querySelectorAll(
        '.comparison-context .comparison-identity-actions button'
      )
    )
    expect(identityActions.map((button) => button.textContent)).toEqual([
      'Replace',
      'Open alone',
      'Replace',
      'Open alone'
    ])
    expect(
      identityActions.map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Replace First Show',
      'Open First Show alone',
      'Replace Second Show',
      'Open Second Show alone'
    ])
    expect(container.querySelector('.comparison-context').hidden).toBe(false)
    expect(container.querySelector('.comparison-detail').hidden).toBe(true)
    expect(
      Array.from(container.querySelector('.comparison-data').children)
    ).toEqual([
      container.querySelector('.comparison-overview'),
      container.querySelector('.comparison-duplex'),
      container.querySelector('.comparison-reading-pane')
    ])
    expect(
      Array.from(container.querySelector('.comparison-duplex').children)
    ).toEqual([
      container.querySelector('.comparison-lane[data-comparison-slot="a"]'),
      container.querySelector('.comparison-lane[data-comparison-slot="b"]')
    ])
    expect(container.querySelector('.comparison-lane-context-key')).toBeNull()
    expect(
      container.querySelectorAll('.comparison-lane-active-label')
    ).toHaveLength(2)
    expect(
      container.querySelector(
        '.comparison-lane.is-active .comparison-lane-active-label'
      ).textContent
    ).toBe('Active')
    expect(charts[0].updateSeasons.mock.calls.at(-1)[1]).not.toHaveProperty(
      'companionSeries'
    )
    expect(charts[1].updateSeasons.mock.calls.at(-1)[1]).not.toHaveProperty(
      'companionSeries'
    )

    optionsByTitle['First Show'].onViewportChange({ start: 2, end: 4 })
    expect(charts[1].setViewport).toHaveBeenCalledWith({ start: 2, end: 4 })

    optionsByTitle['First Show'].onPointHoverContextChange({
      x: 2,
      pointId: 'first-2'
    })
    expect(charts[0].setComparisonCursor).toHaveBeenLastCalledWith(null)
    expect(charts[1].setComparisonCursor).toHaveBeenLastCalledWith(2)

    optionsByTitle['First Show'].onPointHoverContextChange({
      x: null,
      pointId: null
    })
    expect(charts[0].setComparisonCursor).toHaveBeenLastCalledWith(null)
    expect(charts[1].setComparisonCursor).toHaveBeenLastCalledWith(null)

    optionsByTitle['Second Show'].onSelectionContextChange({
      selection: 's01e03',
      x: 3,
      pointId: 'second-3'
    })
    expect(new URL(window.location.href).searchParams.get('select')).toBe(
      'b:s01e03'
    )
    expect(charts[0].clearSelection).toHaveBeenCalled()
    expect(container.querySelector('[data-comparison-detail="b"]').hidden).toBe(
      false
    )
    expect(container.querySelector('.comparison-context').hidden).toBe(true)
    expect(container.querySelector('.comparison-detail').hidden).toBe(false)
    expect(
      container.querySelector('.cross-show-multiselect-action').hidden
    ).toBe(false)

    optionsByTitle['First Show'].onPointHoverContextChange({
      x: 2,
      pointId: 'first-2'
    })
    expect(charts[0].setComparisonCursor).toHaveBeenLastCalledWith(null)
    expect(charts[1].setComparisonCursor).toHaveBeenLastCalledWith(2)
    optionsByTitle['First Show'].onPointHoverContextChange({
      x: null,
      pointId: null
    })
    expect(charts[0].setComparisonCursor).toHaveBeenLastCalledWith(3)
    expect(charts[1].setComparisonCursor).toHaveBeenLastCalledWith(null)

    expect(optionsByTitle['First Show'].onClearSelectionRequest()).toBe(true)
    expect(charts[0].clearSelection).toHaveBeenCalled()
    expect(charts[1].clearSelection).toHaveBeenCalled()
    expect(new URL(window.location.href).searchParams.has('select')).toBe(false)
    expect(container.querySelector('.comparison-context').hidden).toBe(false)
    expect(container.querySelector('.comparison-detail').hidden).toBe(true)

    optionsByTitle['Second Show'].onSelectionContextChange({
      selection: 's01e03',
      x: 3,
      pointId: 'second-3'
    })

    container.querySelector('[data-comparison-action="head-to-head"]').click()
    expect(
      container.querySelector('.cross-show-multiselect-action').textContent
    ).toMatch(/Choose an episode from First Show/u)
    optionsByTitle['First Show'].onSelectionContextChange({
      selection: 's01e02',
      x: 2,
      pointId: 'first-2'
    })
    expect(new URL(window.location.href).searchParams.get('select')).toBe(
      'a:s01e02,b:s01e03'
    )
    expect(container.querySelector('.comparison-head-to-head').hidden).toBe(
      false
    )
    expect(
      container.querySelector('.comparison-head-to-head').textContent
    ).toMatch(/First Show · S01E02/u)
    expect(
      container.querySelector('.comparison-head-to-head').textContent
    ).toMatch(/Second Show · S01E03/u)
    expect(
      container.querySelector('.comparison-head-to-head').textContent
    ).not.toMatch(/episodes between|span/iu)
    expect(container.querySelector('.comparison-detail').hidden).toBe(true)

    optionsByTitle['First Show'].onSelectionContextChange({
      selection: 'none',
      x: null,
      pointId: null
    })
    expect(new URL(window.location.href).searchParams.get('select')).toBe(
      'b:s01e03'
    )
    expect(container.querySelector('.comparison-detail').hidden).toBe(false)

    optionsByTitle['Second Show'].onSelectionContextChange({
      selection: 'none',
      x: null,
      pointId: null
    })
    expect(container.querySelector('.comparison-context').hidden).toBe(false)
    expect(container.querySelector('.comparison-detail').hidden).toBe(true)
    expect(new URL(window.location.href).searchParams.has('select')).toBe(false)

    page.destroy()
  })

  it('keeps the overview in show order when the second show loads first', async () => {
    const bundles = {
      'tvmaze:1': createBundle('First Show', 3, 'omdb'),
      'tvmaze:2': createBundle('Second Show', 5, 'omdb')
    }
    let releaseFirstShow
    const firstShowDelay = new Promise((resolve) => {
      releaseFirstShow = resolve
    })
    const bundleStream = async function* (showRef) {
      if (showRef === 'tvmaze:1') {
        await firstShowDelay
      }
      yield {
        phase: 'primary',
        bundle: bundles[showRef],
        pendingProviders: [],
        complete: true
      }
    }
    const chartFactory = vi.fn((root, seasons, options) => {
      const sparklineShell = document.createElement('div')
      sparklineShell.className = 'sparkline-shell'
      sparklineShell.append(document.createElement('svg'))
      root.append(sparklineShell)
      if (options.show.title === 'Second Show') {
        releaseFirstShow()
      }
      return createChartDouble(options)
    })
    const container = document.createElement('div')

    const page = await renderComparisonPage(container, 'tvmaze:1', 'tvmaze:2', {
      bundleStream,
      chartFactory,
      detailLoaderFactory: vi.fn(() => vi.fn()),
      compareProviders: { a: [], b: [] }
    })
    await page.whenSettled

    expect(
      Array.from(
        container.querySelectorAll('.comparison-overview-row'),
        (row) => row.dataset.comparisonSlot
      )
    ).toEqual(['a', 'b'])
    expect(
      Array.from(
        container.querySelectorAll('.comparison-overview-label'),
        (label) => [label.textContent, label.title]
      )
    ).toEqual([
      ['First Show', 'First Show'],
      ['Second Show', 'Second Show']
    ])

    page.destroy()
  })

  it('drops URL selections that the charts cannot restore', async () => {
    window.history.replaceState(
      {},
      '',
      '/graphtv/?show=tvmaze%3A1&vs=tvmaze%3A2&select=a%3As09e09%2Cb%3As09e09'
    )
    const bundles = {
      'tvmaze:1': createBundle('First Show', 3, 'omdb'),
      'tvmaze:2': createBundle('Second Show', 5, 'omdb')
    }
    const chartFactory = vi.fn((root, seasons, options) => {
      const chart = createChartDouble(options)
      chart.getSelectionContext.mockReturnValue({
        selection: 'none',
        x: null,
        pointId: null
      })
      return chart
    })
    const container = document.createElement('div')

    const page = await renderComparisonPage(container, 'tvmaze:1', 'tvmaze:2', {
      bundleStream: createBundleStream(bundles),
      chartFactory,
      detailLoaderFactory: vi.fn(() => vi.fn()),
      compareProviders: { a: [], b: [] }
    })
    await page.whenSettled

    expect(new URL(window.location.href).searchParams.has('select')).toBe(false)
    expect(container.querySelector('.comparison-context').hidden).toBe(false)
    expect(container.querySelector('.comparison-detail').hidden).toBe(true)
    expect(container.querySelector('.comparison-head-to-head').hidden).toBe(
      true
    )

    page.destroy()
  })

  it('labels unlike rating sources without computing a false comparison', async () => {
    const bundles = {
      'tvmaze:1': createBundle('IMDb Show', 3, 'omdb'),
      'tvmaze:2': createBundle('TVmaze Show', 4, 'tvmaze')
    }
    const chartFactory = vi.fn((root, seasons, options) =>
      createChartDouble(options)
    )
    const container = document.createElement('div')

    const page = await renderComparisonPage(container, 'tvmaze:1', 'tvmaze:2', {
      bundleStream: createBundleStream(bundles),
      chartFactory,
      detailLoaderFactory: vi.fn(() => vi.fn()),
      compareProviders: { a: [], b: [] }
    })
    await page.whenSettled

    expect(container.querySelector('.comparison-caution').textContent).toMatch(
      /does not calculate differences/u
    )
    expect(chartFactory.mock.calls[1][2].primaryRatingSource).toBe('tvmaze')
    expect(
      chartFactory.mock.results[0].value.updateSeasons.mock.calls.at(-1)[1]
        .primaryRatingSource
    ).toBe('omdb')
    expect(container.querySelector('.comparison-subtitle')).toBeNull()
    expect(container.querySelector('.comparison-method-note').textContent).toBe(
      'Ratings reflect each show’s voting audience. Adjacent values provide context, not a winner.'
    )
    expect(
      Array.from(
        container.querySelectorAll('.comparison-identity p'),
        (paragraph) => paragraph.textContent
      ).filter((text) => text.startsWith('Plotted on'))
    ).toEqual(['Plotted on IMDb', 'Plotted on TVmaze'])
    expect(container.querySelector('.comparison-lane-context-key')).toBeNull()
    expect(
      chartFactory.mock.results[0].value.updateSeasons.mock.calls.at(-1)[1]
    ).not.toHaveProperty('companionSeries')

    page.destroy()
  })

  it('keeps the surviving lane when the other show fails', async () => {
    window.history.replaceState(
      {},
      '',
      '/graphtv/?show=tvmaze%3A1&vs=tvmaze%3A2&select=a%3As01e02%2Cb%3As01e03'
    )
    const firstBundle = createBundle('Working Show', 3, 'omdb')
    const bundleStream = async function* (showRef) {
      if (showRef === 'tvmaze:2') {
        throw new Error('Provider unavailable')
      }
      yield { phase: 'show', show: firstBundle.show, complete: false }
      yield {
        phase: 'primary',
        bundle: firstBundle,
        pendingProviders: [],
        complete: true
      }
    }
    const container = document.createElement('div')
    const chartFactory = vi.fn((root, seasons, options) => {
      const chart = createChartDouble(options)
      chart.getSelectionContext.mockReturnValue({
        selection: options.initialSelection ?? 'none',
        x: 2,
        pointId: 'working-2'
      })
      return chart
    })

    const page = await renderComparisonPage(container, 'tvmaze:1', 'tvmaze:2', {
      bundleStream,
      chartFactory,
      detailLoaderFactory: vi.fn(() => vi.fn()),
      compareProviders: { a: [], b: [] }
    })
    await page.whenSettled

    expect(chartFactory).toHaveBeenCalledTimes(1)
    expect(
      container.querySelector('[data-comparison-chart="b"]').textContent
    ).toContain('Provider unavailable')
    expect(
      container.querySelector('[data-comparison-chart="a"]')
    ).not.toBeNull()
    expect(
      Array.from(
        container.querySelectorAll(
          '[data-comparison-chart="b"] [data-comparison-action]'
        ),
        (button) => button.textContent
      )
    ).toEqual(['Retry', 'Replace', 'Remove'])
    expect(new URL(window.location.href).searchParams.get('select')).toBe(
      'a:s01e02'
    )
    expect(container.querySelector('.comparison-head-to-head').hidden).toBe(
      true
    )
    expect(container.querySelector('.comparison-detail').hidden).toBe(false)
    expect(container.querySelector('[data-comparison-detail="a"]').hidden).toBe(
      false
    )

    page.destroy()
  })
})

function createBundle(title, episodeCount, source) {
  const show = {
    id: title,
    title,
    year: '2020',
    plot: `${title} synopsis`,
    poster: null,
    totalSeasons: 1,
    genres: ['Drama'],
    ratings: [{ source, rating: 8, votes: 100 }],
    externalIds: { imdb: `tt-${title}` }
  }
  return {
    show,
    seasons: [
      {
        number: 1,
        episodes: Array.from({ length: episodeCount }, (_, index) => ({
          id: `${title}-${index + 1}`,
          title: `Episode ${index + 1}`,
          season: 1,
          episode: index + 1,
          ratings: [{ source, rating: 7 + index / 10, votes: 20 + index }]
        }))
      }
    ],
    primarySource: source,
    sourceRecords: [{ provider: source }],
    providerDiagnostics: [],
    alignment: {},
    alignmentIssues: []
  }
}

function createBundleStream(bundles) {
  return async function* (showRef) {
    const bundle = bundles[showRef]
    yield { phase: 'show', show: bundle.show, complete: false }
    yield {
      phase: 'primary',
      bundle,
      pendingProviders: [],
      complete: true
    }
  }
}

function createChartDouble(options) {
  return {
    updateSeasons: vi.fn(),
    setViewport: vi.fn(() => true),
    clearSelection: vi.fn(() => true),
    setComparisonCursor: vi.fn(() => true),
    selectNearestEpisode: vi.fn(() => true),
    destroy: vi.fn(),
    getDensityMetrics: vi.fn(),
    getSelectionContext: vi.fn(() => ({
      selection: 'series',
      x: null,
      pointId: null
    })),
    getDebugState: vi.fn(() => ({
      viewport: { start: 1, end: options.comparisonXMax }
    })),
    getSummary: vi.fn(() => ({
      totalEpisodes: options.show.title === 'First Show' ? 3 : 5,
      ratedEpisodes: options.show.title === 'First Show' ? 3 : 5,
      primarySource: options.primaryRatingSource,
      coverage: [],
      medianVotes: 1200,
      series: {
        mean: 8,
        ratingStandardDeviation: 0.4,
        slope: 0.01
      },
      breakpoint: null
    }))
  }
}
