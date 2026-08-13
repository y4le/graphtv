import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChart } from '../../src/viz/ratingsChart.js'
import { updateUiSettings } from '../../src/viz/theme.js'

let chart

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  updateUiSettings({
    theme: 'light',
    palette: 'monotone',
    absoluteYAxis: false,
    seasonTrendlines: true,
    fullShowTrendline: false,
    showSourceSpread: true
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query === '(hover: hover) and (pointer: fine)',
      media: query,
      addEventListener() {},
      removeEventListener() {}
    }))
  )
})

afterEach(() => {
  chart?.destroy()
  chart = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('createChart', () => {
  it('aligns the sparkline viewBox with the main plot rather than the axis gutter', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())

    const sparklineWidth = getViewBoxWidth(
      container.querySelector('.sparkline-chart')
    )
    const mainPlotWidth = getViewBoxWidth(
      container.querySelector('.ratings-chart')
    )

    expect(sparklineWidth).toBe(mainPlotWidth)
  })

  it('opens rating details with the highest-priority enabled selection', () => {
    updateUiSettings({ fullShowTrendline: true })
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'series',
      selectedPointId: null,
      hasUserInteracted: false
    })
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Browse the full series'
    )
    expect(detailRoot.textContent).toContain('Full series')
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      ''
    )
  })

  it('falls back to and enriches the first rated episode when trendlines are unavailable', async () => {
    vi.useFakeTimers()
    updateUiSettings({
      seasonTrendlines: false,
      fullShowTrendline: false
    })
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    const loadEpisodeDetails = vi.fn(async (point) => point)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = createSeasons()
    seasons[0].episodes[0].ratings[0].rating = null

    chart = createChart(container, seasons, {
      detailRoot,
      loadEpisodeDetails
    })

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: null,
      selectedPointId: 'episode-2',
      hasUserInteracted: false
    })
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'S01E02'
    )
    expect(detailRoot.textContent).toContain('Episode 2')

    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].id).toBe('episode-2')

    chart.clearSelection()
    expect(detailRoot.textContent).toContain(
      'Browse the rated episodes with the arrow buttons.'
    )
  })

  it('navigates rated episodes without wrapping while hover only previews detail', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 4)
    seasons[0].episodes[1].ratings[0].rating = null

    chart = createChart(container, seasons, { detailRoot })
    const previous = detailRoot.querySelector('[data-sidenote-nav="previous"]')
    const next = detailRoot.querySelector('[data-sidenote-nav="next"]')

    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Browse Season 1'
    )
    expect(previous.getAttribute('aria-disabled')).toBe('true')
    expect(next.getAttribute('aria-label')).toBe('First episode of Season 1')

    next.focus()
    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    expect(document.activeElement).toBe(next)

    const thirdPoint = Array.from(
      container.querySelectorAll('.episode-point')
    ).find((point) => point.__data__.id === 'episode-3')
    thirdPoint.dispatchEvent(new MouseEvent('mouseenter'))
    expect(detailRoot.textContent).toContain('Episode 3')
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'S01E01'
    )
    thirdPoint.dispatchEvent(new MouseEvent('mouseleave'))

    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-3')
    expect(detailRoot.querySelector('.sidenote-nav-meta').textContent).toBe(
      '2 of 3 rated episodes'
    )
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    next.click()
    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    expect(next.getAttribute('aria-disabled')).toBe('true')
    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    expect(document.activeElement).toBe(next)
  })

  it('keeps the detail region open after clearing and enters browsing forward', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })
    chart.clearSelection()

    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Browse episodes'
    )
    expect(detailRoot.textContent).toContain(
      'Choose a trendline or browse the rated episodes.'
    )
    detailRoot.querySelector('[data-sidenote-nav="next"]').click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
  })

  it('upgrades the untouched fallback selection when richer data arrives', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const initialSeasons = createSeasons()
    initialSeasons[0].episodes = initialSeasons[0].episodes.slice(0, 2)

    chart = createChart(container, initialSeasons)
    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      selectedTrendId: null,
      hasUserInteracted: false
    })

    const hoveredPoint = Array.from(
      container.querySelectorAll('.episode-point')
    ).find((point) => point.__data__.id === 'episode-2')
    hoveredPoint.dispatchEvent(new MouseEvent('mouseenter'))
    expect(chart.getDebugState().hasUserInteracted).toBe(false)

    const updatedSeasons = createSeasons()
    updatedSeasons[0].episodes = updatedSeasons[0].episodes.slice(0, 3)
    chart.updateSeasons(updatedSeasons)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: null,
      selectedTrendId: 'season:1',
      hasUserInteracted: false
    })
    hoveredPoint.dispatchEvent(new MouseEvent('mouseleave'))
    expect(container.textContent).toContain('Mean')
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      ''
    )
  })

  it('moves and enriches a vanished user-selected episode at the nearest rated point', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn(async (point) => point)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const initialSeasons = createSeasons()
    initialSeasons[0].episodes = initialSeasons[0].episodes.slice(0, 5)

    chart = createChart(container, initialSeasons, { loadEpisodeDetails })
    chart.moveEpisode(1)
    chart.moveEpisode(2)
    expect(chart.getDebugState().selectedPointId).toBe('episode-3')
    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)

    const updatedSeasons = createSeasons()
    updatedSeasons[0].episodes = updatedSeasons[0].episodes
      .slice(0, 5)
      .filter((episode) => episode.id !== 'episode-3')
    chart.updateSeasons(updatedSeasons)

    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    expect(chart.getDebugState().selectedTrendId).toBeNull()
    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(2)
    expect(loadEpisodeDetails.mock.calls[1][0].id).toBe('episode-4')
  })

  it('shows a stable empty detail state when no episodes are rated', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 2)
    seasons[0].episodes.forEach((episode) => {
      episode.ratings[0].rating = null
    })

    chart = createChart(container, seasons, { detailRoot })

    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'No rated episodes'
    )
    expect(detailRoot.textContent).toContain(
      'No rated episode details are available.'
    )
    expect(
      Array.from(detailRoot.querySelectorAll('.sidenote-nav-button')).every(
        (button) => button.getAttribute('aria-disabled') === 'true'
      )
    ).toBe(true)
  })

  it('rerenders the graph and sparkline on an absolute 0–10 y-axis', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    expect(getAxisLabels(container)).not.toContain('0.0')

    updateUiSettings({ absoluteYAxis: true })

    expect(getAxisLabels(container)).toEqual(
      expect.arrayContaining(['0.0', '10.0'])
    )
  })

  it('shows provider disagreement by default and lets the setting hide it', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes[0].ratings.push({ source: 'tmdb', rating: 1 })

    chart = createChart(container, seasons)

    expect(container.querySelectorAll('.source-spread')).toHaveLength(1)
    expect(
      container.querySelector('.chart-source-status').textContent
    ).toContain('Plotting TEST')
    expect(
      container.querySelector('.chart-source-status').textContent
    ).toContain('source spread shows TMDB')
    expect(
      container.querySelector('.chart-source-status').textContent
    ).toContain('Pinch or drag the overview to adjust the visible range.')
    expect(getAxisLabels(container)).toEqual(
      expect.arrayContaining(['0.0', '10.0'])
    )

    chart.moveEpisode(1)

    expect(container.querySelectorAll('.crosshair')).toHaveLength(2)
    expect(
      container
        .querySelector('.source-spread.is-active')
        .getAttribute('stroke-opacity')
    ).toBe('0.72')
    expect(container.querySelectorAll('.source-spread-whisker')).toHaveLength(2)
    expect(container.querySelectorAll('.source-rating-point')).toHaveLength(1)
    expect(
      container
        .querySelector('.source-rating-point')
        .getAttribute('data-rating-source')
    ).toBe('tmdb')

    updateUiSettings({ showSourceSpread: false })

    expect(container.querySelectorAll('.source-spread')).toHaveLength(0)
    expect(container.querySelectorAll('.source-spread-whisker')).toHaveLength(0)
    expect(container.querySelectorAll('.source-rating-point')).toHaveLength(0)
    expect(container.querySelectorAll('.crosshair')).toHaveLength(1)
    expect(getAxisLabels(container)).not.toContain('0.0')
  })

  it('renders a borrowed provider rating as a deemphasized palette-colored point', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = [
      {
        number: 1,
        episodes: [
          createRatedEpisode('one', [
            { source: 'omdb', rating: 8 },
            { source: 'tmdb', rating: 7 }
          ]),
          createRatedEpisode('two', [
            { source: 'omdb', rating: 8.2 },
            { source: 'tmdb', rating: 7.2 }
          ]),
          createRatedEpisode('three', [
            { source: 'omdb', rating: 8.4 },
            { source: 'tmdb', rating: 7.4 }
          ]),
          createRatedEpisode('four', [{ source: 'tmdb', rating: 7.6 }])
        ]
      }
    ]

    updateUiSettings({ palette: 'vivid' })
    chart = createChart(container, seasons)

    const fallback = container.querySelector('[data-rating-fallback="true"]')
    expect(fallback).not.toBeNull()
    expect(fallback.getAttribute('fill')).toBe('hsl(150 68% 42%)')
    expect(fallback.getAttribute('fill-opacity')).toBe('0.2')
    expect(fallback.getAttribute('stroke')).toBe('hsl(150 68% 42%)')
    expect(fallback.getAttribute('stroke-width')).toBe('1.25')
    expect(fallback.getAttribute('stroke-opacity')).toBe('1')
  })

  it('subtly enlarges points when few ratings occupy the available width', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 5)

    chart = createChart(container, seasons)

    const restingRadius = Number(
      container.querySelector('.episode-point').getAttribute('r')
    )
    expect(restingRadius).toBe(5)

    chart.moveEpisode(1)
    const activeRadius = Number(
      container.querySelector('.episode-point').getAttribute('r')
    )
    expect(activeRadius).toBe(restingRadius + 1.5)
  })

  it('selects trendlines through the plot surface and gives points priority', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })
    const surface = container.querySelector('.chart-hit-surface')
    const pointHit = container.querySelector('.episode-point-hit')
    const trendPoint = getPathMidpoint(
      container.querySelector('.micro-trendline').getAttribute('d')
    )

    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    chart.clearSelection()
    dispatchSurfaceClick(surface, trendPoint)

    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(chart.getDebugState().selectedPointId).toBeNull()
    expect(container.querySelector('.micro-trendline.is-active')).not.toBeNull()
    expect(container.querySelector('.trend-label').textContent).toContain(
      'Season 1'
    )
    expect(detailRoot.textContent).toContain('Mean')
    expect(detailRoot.textContent).toContain('72 of 72 rated · TEST')
    expect(
      surface.compareDocumentPosition(pointHit) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    chart.fitSeries()
    const lastHit = container.querySelectorAll('.episode-point-hit').item(71)
    const firstMark = container.querySelector('.episode-point')
    expect(
      lastHit.compareDocumentPosition(firstMark) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()

    pointHit.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(chart.getDebugState().selectedTrendId).toBeNull()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    expect(detailRoot.textContent).toContain('Episode 1')
  })

  it('toggles a selected trendline off when it is clicked again', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const surface = container.querySelector('.chart-hit-surface')
    const trendPoint = getPathMidpoint(
      container.querySelector('.micro-trendline').getAttribute('d')
    )

    chart.clearSelection()
    dispatchSurfaceClick(surface, trendPoint)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    dispatchSurfaceClick(surface, trendPoint)

    expect(chart.getDebugState().selectedTrendId).toBeNull()
    expect(container.querySelector('.micro-trendline.is-active')).toBeNull()
  })

  it('waits before previewing a trendline on fine-pointer hover', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const surface = container.querySelector('.chart-hit-surface')
    const trendPoint = getPathMidpoint(
      container.querySelector('.micro-trendline').getAttribute('d')
    )

    surface.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: trendPoint.x,
        clientY: trendPoint.y
      })
    )
    await vi.advanceTimersByTimeAsync(99)
    expect(chart.getDebugState().hoverTrendId).toBeNull()

    await vi.advanceTimersByTimeAsync(1)
    expect(chart.getDebugState().hoverTrendId).toBe('season:1')
    expect(container.textContent).toContain('Mean')

    surface.dispatchEvent(new MouseEvent('pointerleave'))
    expect(chart.getDebugState().hoverTrendId).toBeNull()
  })

  it('uses a wider tap tolerance without hover on coarse pointers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query) => ({
        matches:
          query === '(max-width: 767px)' || query === '(pointer: coarse)',
        media: query,
        addEventListener() {},
        removeEventListener() {}
      }))
    )
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const surface = container.querySelector('.chart-hit-surface')
    const trendPoint = getPathMidpoint(
      container.querySelector('.micro-trendline').getAttribute('d')
    )
    const coarseTarget = { x: trendPoint.x, y: trendPoint.y + 10 }

    surface.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: coarseTarget.x,
        clientY: coarseTarget.y
      })
    )
    await vi.advanceTimersByTimeAsync(200)
    expect(chart.getDebugState().hoverTrendId).toBeNull()

    chart.clearSelection()
    dispatchSurfaceClick(surface, coarseTarget)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
  })

  it('drops a selected season trend when refreshed data can no longer fit it', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    chart.clearSelection()
    chart.toggleSeasonTrend()
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')

    const nextSeasons = createSeasons()
    nextSeasons[0].episodes = nextSeasons[0].episodes.slice(0, 2)
    chart.updateSeasons(nextSeasons)

    expect(chart.getDebugState().selectedTrendId).toBeNull()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
  })

  it('reveals and selects the full-series trend from its keyboard action', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    expect(container.querySelector('.macro-trendline')).toBeNull()

    chart.toggleSeriesTrend()

    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(container.querySelector('.macro-trendline.is-active')).not.toBeNull()
  })

  it('does not enable keyboard trend settings when no trend is available', () => {
    updateUiSettings({
      seasonTrendlines: false,
      fullShowTrendline: false
    })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 2)

    chart = createChart(container, seasons)

    expect(chart.toggleSeriesTrend()).toBe(false)
    expect(chart.toggleSeasonTrend()).toBe(false)
    expect(chart.getDebugState().selectedTrendId).toBeNull()
    expect(chart.getDebugState().uiSettings).toMatchObject({
      seasonTrendlines: false,
      fullShowTrendline: false
    })
  })

  it('announces persistent trend selections and keyboard clearing', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    chart.clearSelection()
    chart.toggleSeasonTrend()
    await vi.advanceTimersByTimeAsync(120)

    expect(
      container.querySelector('.chart-selection-status').textContent
    ).toContain('Season 1 trend selected. Mean')

    chart.moveEpisode(1)
    await vi.advanceTimersByTimeAsync(120)
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      'S01E01 selected: Episode 1. Rating 6.0.'
    )

    expect(chart.clearSelection()).toBe(true)
    await vi.advanceTimersByTimeAsync(120)
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      'Chart selection cleared.'
    )
    expect(chart.clearSelection()).toBe(false)
  })

  it('announces and enriches a disabled season trend selection in the same season', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn(async (point) => point)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 3)
    seasons.push({
      number: 2,
      episodes: Array.from({ length: 3 }, (_, index) => ({
        id: `season-2-episode-${index + 1}`,
        title: `Season 2 Episode ${index + 1}`,
        season: 2,
        number: index + 1,
        ratings: [{ source: 'test', rating: 7 + index / 10 }]
      }))
    })

    chart = createChart(container, seasons, { loadEpisodeDetails })
    chart.moveEpisode(1)
    chart.moveSeason(1)
    chart.toggleSeasonTrend()
    expect(chart.getDebugState().selectedTrendId).toBe('season:2')

    updateUiSettings({ seasonTrendlines: false })

    expect(chart.getDebugState().selectedTrendId).toBeNull()
    expect(chart.getDebugState().selectedPointId).toBe('season-2-episode-1')
    expect(container.querySelector('.micro-trendline')).toBeNull()

    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].id).toBe('season-2-episode-1')
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      'S02E01 selected: Season 2 Episode 1. Rating 7.0.'
    )
  })

  it('preserves small horizontal trackpad deltas', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 528
    })
    const initialViewport = chart.getDebugState().viewport

    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 5
      })
    )

    const nextViewport = chart.getDebugState().viewport
    expect(nextViewport.start).toBeGreaterThan(initialViewport.start)
    expect(nextViewport.start).toBeLessThan(initialViewport.start + 1)
  })

  it('zooms at the cursor for a trackpad pinch over the main graph', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 56, width: 528 })
    })
    const initialViewport = chart.getDebugState().viewport
    const initialSpan = initialViewport.end - initialViewport.start
    const pinch = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 320,
      ctrlKey: true,
      deltaY: -8
    })

    body.dispatchEvent(pinch)

    const nextViewport = chart.getDebugState().viewport
    expect(pinch.defaultPrevented).toBe(true)
    expect(nextViewport.end - nextViewport.start).toBeLessThan(initialSpan)
    expect((nextViewport.start + nextViewport.end) / 2).toBeCloseTo(
      (initialViewport.start + initialViewport.end) / 2
    )
  })

  it('zooms at the selected window for a trackpad pinch over the sparkline', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const sparkline = container.querySelector('.sparkline-chart')
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(sparkline, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 56, width: 528 })
    })
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 528
    })
    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 150
      })
    )
    const initialViewport = chart.getDebugState().viewport
    const initialSpan = initialViewport.end - initialViewport.start
    const selectedCenterX =
      56 + (((initialViewport.start + initialViewport.end) / 2 - 1) / 71) * 528
    const pinch = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: selectedCenterX,
      ctrlKey: true,
      deltaY: 8
    })

    sparkline.dispatchEvent(pinch)

    const nextViewport = chart.getDebugState().viewport
    expect(pinch.defaultPrevented).toBe(true)
    expect(nextViewport.end - nextViewport.start).toBeGreaterThan(initialSpan)
    expect((nextViewport.start + nextViewport.end) / 2).toBeCloseTo(
      (initialViewport.start + initialViewport.end) / 2
    )
  })

  it('fits the whole series and restores default zoom around the selection', () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const initialViewport = chart.getDebugState().viewport
    const initialSpan = initialViewport.end - initialViewport.start
    chart.moveEpisode(1)
    chart.moveEpisode(40)
    const selectedPointId = chart.getDebugState().selectedPointId

    chart.fitSeries()
    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 72 })
    expect(chart.getDebugState().selectedPointId).toBe(selectedPointId)

    vi.advanceTimersByTime(120)
    expect(container.querySelector('.chart-viewport-status').textContent).toBe(
      'Whole series, 72 episodes'
    )

    chart.resetZoom()
    const resetViewport = chart.getDebugState().viewport
    expect(resetViewport.end - resetViewport.start).toBeCloseTo(initialSpan)
    expect((resetViewport.start + resetViewport.end) / 2).toBeCloseTo(41)
    expect(chart.getDebugState().selectedPointId).toBe(selectedPointId)

    chart.zoomBy(1 / 1.5)
    const zoomedViewport = chart.getDebugState().viewport
    expect(zoomedViewport.end - zoomedViewport.start).toBeLessThan(initialSpan)
    expect((zoomedViewport.start + zoomedViewport.end) / 2).toBeCloseTo(41)

    for (let index = 0; index < 20; index += 1) {
      chart.zoomBy(1 / 1.5)
    }
    const minimumViewport = chart.getDebugState().viewport
    expect(minimumViewport.end - minimumViewport.start).toBeCloseTo(4)
  })

  it('preserves the viewport center when the selection is offscreen', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    chart.moveEpisode(1)
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 528
    })
    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 1000
      })
    )
    chart.zoomBy(1 / 1.5)
    const zoomedViewport = chart.getDebugState().viewport
    const zoomedCenter = (zoomedViewport.start + zoomedViewport.end) / 2

    chart.resetZoom()
    const resetViewport = chart.getDebugState().viewport
    expect((resetViewport.start + resetViewport.end) / 2).toBeCloseTo(
      zoomedCenter
    )
  })

  it('responds continuously once a slow touch drag crosses the intent threshold', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        addEventListener() {},
        removeEventListener() {}
      }))
    )
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 544
    })
    const initialViewport = chart.getDebugState().viewport

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 1, clientX: 100 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 90 })

    const nextViewport = chart.getDebugState().viewport
    expect(nextViewport.start).toBeGreaterThan(initialViewport.start)
    expect(nextViewport.start).toBeLessThan(initialViewport.start + 1)
  })

  it('suppresses a pan click without swallowing the next deliberate tap', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query) => ({
        matches:
          query === '(max-width: 767px)' || query === '(pointer: coarse)',
        media: query,
        addEventListener() {},
        removeEventListener() {}
      }))
    )
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const body = container.querySelector('.chart-body-shell')
    const point = container.querySelector('.episode-point-hit')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 544
    })
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValue(1001)

    dispatchTouchPointer(body, 'pointerdown', {
      pointerId: 1,
      clientX: 100
    })
    dispatchTouchPointer(body, 'pointermove', {
      pointerId: 1,
      clientX: 90
    })
    dispatchTouchPointer(body, 'pointerup', {
      pointerId: 1,
      clientX: 90
    })
    point.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(chart.getDebugState().selectedPointId).toBeNull()

    dispatchTouchPointer(body, 'pointerdown', {
      pointerId: 2,
      clientX: 100
    })
    dispatchTouchPointer(body, 'pointermove', {
      pointerId: 2,
      clientX: 90
    })
    dispatchTouchPointer(body, 'pointerup', {
      pointerId: 2,
      clientX: 90
    })

    const tapTarget = container.querySelector('.episode-point-hit')
    const tapTargetId = tapTarget.__data__.id
    dispatchTouchPointer(body, 'pointerdown', {
      pointerId: 3,
      clientX: 20
    })
    dispatchTouchPointer(body, 'pointerup', {
      pointerId: 3,
      clientX: 20
    })
    tapTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(chart.getDebugState().selectedPointId).toBe(tapTargetId)
  })

  it('renders episode details outside the chart when given a detail root', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })
    chart.moveEpisode(1)
    chart.moveEpisode(1)

    expect(container.querySelector('.reading-pane-shell')).toBeNull()
    expect(detailRoot.querySelector('.sidenote-card')).not.toBeNull()
    expect(detailRoot.textContent).toContain('Episode 2')
    expect(detailRoot.textContent).toContain('TEST 7.0')
    expect(
      detailRoot.querySelector('.sidenote-rating-primary').textContent
    ).toBe('TEST 7.0')
  })

  it('updates provider ratings in place while preserving the selected episode', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const initialSeasons = createSeasons()

    chart = createChart(container, initialSeasons, { detailRoot })
    chart.moveEpisode(1)
    const selectedPointId = chart.getDebugState().selectedPointId
    expect(detailRoot.textContent).not.toContain('TMDB')

    const updatedSeasons = createSeasons()
    updatedSeasons[0].episodes[0].ratings.push({
      source: 'tmdb',
      rating: 9,
      votes: 500
    })
    chart.updateSeasons(updatedSeasons)

    expect(chart.getDebugState().selectedPointId).toBe(selectedPointId)
    expect(detailRoot.textContent).toContain('TMDB 9.0 (500 votes)')
  })

  it('merges late episode details into the newest provider snapshot', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    let resolveDetails
    const loadEpisodeDetails = vi.fn(
      (point) =>
        new Promise((resolve) => {
          resolveDetails = () =>
            resolve({
              ...point,
              ratings: point.ratings.map((rating) => ({
                ...rating,
                votes: 123,
                votesStatus: 'loaded'
              }))
            })
        })
    )
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), {
      detailRoot,
      loadEpisodeDetails
    })
    chart.moveEpisode(1)
    await vi.advanceTimersByTimeAsync(250)

    const updatedSeasons = createSeasons()
    updatedSeasons[0].episodes[0].ratings.push({
      source: 'tmdb',
      rating: 9,
      votes: 500
    })
    chart.updateSeasons(updatedSeasons)
    resolveDetails()
    await Promise.resolve()

    expect(detailRoot.textContent).toContain('TEST 6.0 (123 votes)')
    expect(detailRoot.textContent).toContain('TMDB 9.0 (500 votes)')
  })

  it('does not starve a pending detail load during repeated renders', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn(async (point) => point)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 2)

    chart = createChart(container, seasons, { loadEpisodeDetails })
    for (let index = 0; index < 4; index += 1) {
      await vi.advanceTimersByTimeAsync(50)
      chart.zoomBy(0.99)
    }
    await vi.advanceTimersByTimeAsync(50)

    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].id).toBe('episode-1')
  })

  it('suppresses failed detail retries until provider data refreshes', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn(async () => {
      throw new Error('detail provider unavailable')
    })
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 2)

    chart = createChart(container, seasons, { loadEpisodeDetails })
    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)

    for (let index = 0; index < 5; index += 1) {
      chart.zoomBy(0.99)
      await vi.advanceTimersByTimeAsync(250)
    }
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(chart.getDebugState().episodeDetails.errors).toHaveLength(1)

    chart.updateSeasons(seasons)
    await vi.advanceTimersByTimeAsync(250)

    expect(loadEpisodeDetails).toHaveBeenCalledTimes(2)
    expect(chart.getDebugState().episodeDetails.errors).toHaveLength(2)
  })

  it('debounces selected episode detail loading', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    const loadEpisodeDetails = vi.fn(async (point) => ({
      ...point,
      ratings: [...point.ratings, { source: 'omdb', rating: null, votes: 3379 }]
    }))
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), {
      detailRoot,
      loadEpisodeDetails
    })
    chart.moveEpisode(1)
    chart.moveEpisode(1)
    chart.moveEpisode(1)

    await vi.advanceTimersByTimeAsync(249)
    expect(loadEpisodeDetails).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].title).toBe('Episode 3')
    expect(detailRoot.textContent).toContain('IMDb n/a (3.4k votes)')
  })

  it('debounces episode detail loading while hovering', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn(async (point) => ({
      ...point,
      ratings: point.ratings.map((rating) =>
        rating.source === 'omdb' ? { ...rating, votes: 4200 } : rating
      )
    }))
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    const seasons = createSeasons()
    seasons[0].episodes.slice(0, 2).forEach((episode, index) => {
      episode.ratings.push({
        source: 'omdb',
        rating: 8.2 + index / 10,
        votes: null
      })
    })
    chart = createChart(container, seasons, { loadEpisodeDetails })
    const firstPoint = container.querySelector('.episode-point')
    firstPoint.dispatchEvent(new MouseEvent('mouseenter'))
    expect(container.querySelector('.sidenote-votes-loading')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(249)
    expect(loadEpisodeDetails).not.toHaveBeenCalled()

    firstPoint.dispatchEvent(new MouseEvent('mouseleave'))
    expect(container.querySelector('.sidenote-votes-loading')).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(loadEpisodeDetails).not.toHaveBeenCalled()

    container
      .querySelectorAll('.episode-point')[1]
      .dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(250)

    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].title).toBe('Episode 2')
    expect(container.querySelector('.sidenote-votes-loading')).toBeNull()
    expect(container.textContent).toContain('IMDb 8.3 (4.2k votes)')
  })

  it('destroys the detail loader and suppresses abort errors from an in-flight request', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let rejectLoad
    const loadEpisodeDetails = vi.fn(
      () =>
        new Promise((resolve, reject) => {
          rejectLoad = reject
        })
    )
    loadEpisodeDetails.destroy = vi.fn(() => {
      rejectLoad?.(new DOMException('Aborted', 'AbortError'))
    })
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons(), { loadEpisodeDetails })
    chart.moveEpisode(1)
    await vi.advanceTimersByTimeAsync(250)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)

    chart.destroy()
    await Promise.resolve()

    expect(loadEpisodeDetails.destroy).toHaveBeenCalledTimes(1)
    expect(chart.getDebugState().episodeDetails.errors).toEqual([])
    chart = undefined
  })
})

function getViewBoxWidth(svg) {
  return Number(svg.getAttribute('viewBox').split(/\s+/)[2])
}

function getAxisLabels(container) {
  return Array.from(
    container.querySelectorAll('.range-tick text'),
    (node) => node.textContent
  )
}

function getPathMidpoint(pathData) {
  const coordinates = pathData.match(
    /^M(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)L(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/
  )
  const [, startX, startY, endX, endY] = coordinates.map(Number)

  return {
    x: (startX + endX) / 2,
    y: (startY + endY) / 2
  }
}

function dispatchSurfaceClick(surface, { x, y }) {
  surface.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: x,
      clientY: y
    })
  )
}

function createSeasons() {
  return [
    {
      number: 1,
      episodes: Array.from({ length: 72 }, (_, index) => ({
        id: `episode-${index + 1}`,
        title: `Episode ${index + 1}`,
        season: 1,
        number: index + 1,
        ratings: [{ source: 'test', rating: 6 + (index % 4) }]
      }))
    }
  ]
}

function createRatedEpisode(id, ratings) {
  return {
    id,
    title: id,
    season: 1,
    episode: Number.NaN,
    ratings
  }
}

function dispatchTouchPointer(target, type, properties) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: properties.pointerId },
    clientX: { value: properties.clientX }
  })
  target.dispatchEvent(event)
}
