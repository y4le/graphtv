import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createChart } from '../../src/viz/ratingsChart.js'
import { MARK_DENSITY_CONFIG } from '../../src/viz/pointSize.js'
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
    showSourceSpread: true,
    episodeDensity: 'balanced'
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
  document.head
    .querySelectorAll('[data-chart-theme-test]')
    .forEach((style) => style.remove())
})

describe('createChart', () => {
  it('emits concrete SVG colors from the active CSS theme', () => {
    const style = document.createElement('style')
    style.dataset.chartThemeTest = ''
    style.textContent = readFileSync(
      resolve(process.cwd(), 'css/styles.css'),
      'utf8'
    )
    document.head.appendChild(style)
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    expect(container.querySelector('.episode-point').getAttribute('fill')).toBe(
      '#1a1a1a'
    )

    updateUiSettings({ theme: 'dark' })

    expect(container.querySelector('.episode-point').getAttribute('fill')).toBe(
      '#e8e3d5'
    )
    const colorAttributes = Array.from(
      container.querySelectorAll('[fill], [stroke]'),
      (element) => [
        element.getAttribute('fill'),
        element.getAttribute('stroke')
      ]
    ).flat()
    expect(colorAttributes.filter(Boolean).join(' ')).not.toContain('var(--')
    style.remove()
  })

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

  it('does not rewrite an unchanged chart status live region', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    chart = createChart(container, createSeasons())
    const status = container.querySelector('.chart-source-status')
    const onMutation = vi.fn()
    const observer = new MutationObserver(onMutation)
    observer.observe(status, { childList: true, characterData: true })

    chart.panHalfViewport(1)
    await Promise.resolve()

    expect(onMutation).not.toHaveBeenCalled()
    observer.disconnect()
  })

  it('threads an injected breakpoint detector through chart updates', () => {
    const container = document.createElement('div')
    const breakpointDetector = vi.fn(() => null)
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons(), { breakpointDetector })
    chart.updateSeasons(createSeasons())

    expect(breakpointDetector).toHaveBeenCalledTimes(2)
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
      'Full Series'
    )
    expect(
      detailRoot.querySelector('.sidenote-content .sidenote-header')
    ).toBeNull()
    expect(
      detailRoot.querySelector('.sidenote-content .sidenote-title')
    ).toBeNull()
    expect(detailRoot.querySelector('[data-series-breakpoint]')).toBeNull()
    expect(container.querySelector('.chart-selection-status').textContent).toBe(
      ''
    )
  })

  it('shows a detected breakpoint overlay only while its detail selection is active', () => {
    updateUiSettings({ fullShowTrendline: true })
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createBreakpointSeasons(), { detailRoot })

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'series',
      breakpoint: { highConfidence: true, splitIndex: 16 }
    })
    expect(container.querySelector('.series-breakpoint-trend')).toBeNull()
    expect(container.querySelector('.series-breakpoint-marker')).toBeNull()

    chart.zoomBy(0.5)
    expect(chart.getDebugState().viewport).not.toEqual({ start: 1, end: 32 })
    const showBreakpoint = detailRoot.querySelector('[data-series-breakpoint]')
    expect(showBreakpoint.textContent).toBe('🦈 shark jump detected')
    showBreakpoint.click()

    expect(chart.getDebugState().selectedTrendId).toBe('series:breakpoint')
    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 32 })
    expect(container.querySelectorAll('.series-breakpoint-trend')).toHaveLength(
      2
    )
    const breakpointTrend = container.querySelector('.series-breakpoint-trend')
    const breakpointMarker = container.querySelector(
      '.series-breakpoint-marker'
    )
    expect(breakpointTrend.getAttribute('stroke-width')).toBe('2.5')
    expect(breakpointMarker.getAttribute('stroke-width')).toBe('1.5')
    const chartLayers = Array.from(
      container.querySelector('.ratings-chart').children
    )
    expect(
      chartLayers.indexOf(container.querySelector('.series-breakpoint-layer'))
    ).toBeGreaterThan(
      chartLayers.indexOf(container.querySelector('.episode-mark-layer'))
    )
    expect(detailRoot.querySelector('[data-breakpoint-summary]')).not.toBeNull()
    expect(detailRoot.textContent).toContain('Starting S03E01')
    expect(detailRoot.textContent).toContain('High confidence')

    detailRoot.querySelector('[data-breakpoint-episode]').click()
    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: null,
      selectedPointId: 'breakpoint-episode-17'
    })
    expect(container.querySelector('.series-breakpoint-trend')).toBeNull()
    expect(container.querySelector('.series-breakpoint-marker')).toBeNull()

    chart.toggleSeriesTrend()
    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(container.querySelector('.series-breakpoint-trend')).toBeNull()
    expect(container.querySelector('.series-breakpoint-marker')).toBeNull()
  })

  it('lets the breakpoint shortcut select the best candidate below the automatic threshold', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })
    expect(chart.getDebugState().breakpoint.highConfidence).toBe(false)

    chart.toggleSeriesTrend()
    expect(detailRoot.querySelector('[data-series-breakpoint]')).toBeNull()
    chart.zoomBy(0.5)
    expect(chart.toggleSeriesBreakpoint()).toBe(true)

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'series:breakpoint',
      viewport: { start: 1, end: 72 }
    })
    expect(detailRoot.textContent).toMatch(
      /Confidence below threshold \d+\/100/
    )
    expect(container.querySelectorAll('.series-breakpoint-trend')).toHaveLength(
      2
    )

    expect(chart.toggleSeriesBreakpoint()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(container.querySelector('.series-breakpoint-trend')).toBeNull()
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
    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'series',
      selectedPointId: null,
      uiSettings: { fullShowTrendline: false }
    })
    expect(container.querySelector('.macro-trendline')).toBeNull()
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Full Series'
    )
    expect(detailRoot.querySelector('.trend-summary-provenance')).not.toBeNull()
  })

  it('offers the browse view only when no full-series trend exists', () => {
    updateUiSettings({ seasonTrendlines: false, fullShowTrendline: false })
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 2)

    chart = createChart(container, seasons, { detailRoot })
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')

    expect(chart.clearSelection()).toBe(true)
    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: null,
      selectedPointId: null
    })
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Browse episodes'
    )
    expect(detailRoot.textContent).toContain(
      'Browse the rated episodes with the arrow buttons.'
    )
    expect(chart.clearSelection()).toBe(false)
  })

  it('wraps rated episodes through the same buttons and shortcut handler while hover only previews detail', () => {
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
      'Season 1'
    )
    expect(previous.getAttribute('aria-disabled')).toBe('false')
    expect(next.getAttribute('aria-disabled')).toBe('false')
    expect(previous.getAttribute('aria-label')).toBe(
      'Last rated episode of Season 1'
    )
    expect(next.getAttribute('aria-label')).toBe(
      'First rated episode of Season 1'
    )
    expect(
      detailRoot.querySelector('.sidenote-nav').getAttribute('aria-label')
    ).toBe('Episode navigation')

    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    previous.focus()
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    expect(document.activeElement).toBe(previous)

    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    expect(next.getAttribute('aria-disabled')).toBe('false')

    const thirdPoint = Array.from(
      container.querySelectorAll('.episode-point')
    ).find((point) => point.__data__.id === 'episode-3')
    thirdPoint.dispatchEvent(new MouseEvent('mouseenter'))
    expect(detailRoot.textContent).toContain('Episode 3')
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'S01E03'
    )
    expect(detailRoot.querySelector('.sidenote-nav-meta').textContent).toBe(
      '2 of 3 rated episodes'
    )
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    thirdPoint.dispatchEvent(new MouseEvent('mouseleave'))
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'S01E01'
    )
    expect(detailRoot.querySelector('.sidenote-nav-meta').textContent).toBe(
      '1 of 3 rated episodes'
    )
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')

    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-3')
    expect(detailRoot.querySelector('.sidenote-nav-meta').textContent).toBe(
      '2 of 3 rated episodes'
    )
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    next.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')

    chart.moveEpisode(-1)
    expect(chart.getDebugState().selectedPointId).toBe('episode-4')
    chart.moveEpisode(1)
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
  })

  it('pans keyboard navigation once the selection enters the outer 10% of the viewport', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    const initialViewport = chart.getDebugState().viewport
    const span = initialViewport.end - initialViewport.start
    const rightFollowEdge = initialViewport.end - span * 0.1
    const lastEpisodeBeforeFollow = Math.floor(rightFollowEdge)

    chart.moveEpisode(1)
    chart.moveEpisode(lastEpisodeBeforeFollow - 1)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: `episode-${lastEpisodeBeforeFollow}`,
      viewport: initialViewport
    })

    chart.moveEpisode(1)

    const followedViewport = chart.getDebugState().viewport
    expect(followedViewport.start).toBeGreaterThan(initialViewport.start)
    expect(followedViewport.end - followedViewport.start).toBeCloseTo(span)
    expect(
      (lastEpisodeBeforeFollow + 1 - followedViewport.start) / span
    ).toBeCloseTo(0.9)

    chart.moveEpisode(1)

    const draggedViewport = chart.getDebugState().viewport
    expect(draggedViewport.start - followedViewport.start).toBeCloseTo(1)
    expect(
      (lastEpisodeBeforeFollow + 2 - draggedViewport.start) / span
    ).toBeCloseTo(0.9)
  })

  it('pans half a viewport and carries the selection to the same on-screen x', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    chart.moveEpisode(1)
    const initialViewport = chart.getDebugState().viewport
    const span = initialViewport.end - initialViewport.start
    const travelled = Math.round(span / 2)

    chart.panHalfViewport(1)

    // The viewport moves by the distance the selection travelled, not by the
    // half span, so the arrival keeps the departure's on-screen x.
    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: `episode-${1 + travelled}`,
      viewport: {
        start: initialViewport.start + travelled,
        end: initialViewport.end + travelled
      }
    })

    chart.panHalfViewport(-1)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      viewport: initialViewport
    })
  })

  it('holds the selection at the same on-screen x across repeated half pages', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    for (let index = 0; index < 20; index += 1) {
      chart.moveEpisode(1)
    }

    const screenRatio = () => {
      const { selectedPointId, viewport } = chart.getDebugState()
      const x = Number(selectedPointId.replace('episode-', ''))
      return (x - viewport.start) / (viewport.end - viewport.start)
    }

    const departureRatio = screenRatio()
    const departureId = chart.getDebugState().selectedPointId

    for (const direction of [1, 1, 1, -1, -1, -1]) {
      chart.panHalfViewport(direction)
      expect(screenRatio()).toBeCloseTo(departureRatio)
    }

    // Half a page down and back lands on the departure episode again.
    expect(chart.getDebugState().selectedPointId).toBe(departureId)
  })

  it('steps seasons to the same episode number and shifts the viewport by the distance travelled', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(
      container,
      createSeasonLengths([10, 10, 6, 10, 10, 10, 10, 10])
    )
    for (let index = 0; index < 18; index += 1) {
      chart.moveEpisode(1)
    }
    expect(chart.getDebugState().selectedPointId).toBe('season-2-episode-8')
    const departure = chart.getDebugState()
    const departureX = departure.viewport.start

    chart.moveSeason(1)

    let state = chart.getDebugState()
    expect(state.selectedPointId).toBe('season-3-episode-6')
    // S03 only has six episodes, so the nearest rated episode is chosen and
    // the viewport moves by the same distance the selection travelled (8).
    expect(state.viewport.start - departureX).toBeCloseTo(8)

    chart.moveSeason(1)

    state = chart.getDebugState()
    expect(state.selectedPointId).toBe('season-4-episode-6')
    expect(state.viewport.start - departureX).toBeCloseTo(14)

    chart.moveSeason(-1)
    chart.moveSeason(-1)

    state = chart.getDebugState()
    expect(state.selectedPointId).toBe('season-2-episode-6')
    // Travelling back 16 from +14 would land at -2, but the viewport is
    // clamped at the start of the series.
    expect(state.viewport.start).toBeCloseTo(departureX)

    chart.moveSeason(-1)
    chart.moveSeason(-1)

    state = chart.getDebugState()
    expect(state.selectedPointId).toBe('season-8-episode-6')
    // Wrapping from S01 to S08 pans forward as far as the series allows and
    // keeps the arrival episode (x = 71) on screen.
    expect(state.viewport.start).toBeGreaterThan(departureX)
    expect(state.viewport.start).toBeLessThanOrEqual(71)
    expect(state.viewport.end).toBeGreaterThanOrEqual(71)

    chart.moveSeason(1)

    state = chart.getDebugState()
    expect(state.selectedPointId).toBe('season-1-episode-6')
    expect(state.viewport.start).toBeCloseTo(departureX)
  })

  it('keeps advancing the selection like Vim once the viewport is pinned at an edge', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    chart.moveEpisode(1)
    const initialViewport = chart.getDebugState().viewport
    const halfSpan = (initialViewport.end - initialViewport.start) / 2

    chart.panHalfViewport(-1)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      viewport: initialViewport
    })

    chart.jumpBoundary('end')
    chart.moveEpisode(-1)
    const endViewport = chart.getDebugState().viewport
    const secondToLast = chart.getDebugState().selectedPointId

    chart.panHalfViewport(1)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-72',
      viewport: endViewport
    })
    expect(secondToLast).toBe('episode-71')

    chart.panHalfViewport(-1)

    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: `episode-${72 - Math.round(halfSpan)}`
    })
  })

  it('wraps selected season trendlines through buttons and season shortcuts without entering the series trend', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = Array.from({ length: 3 }, (_, seasonIndex) => ({
      number: seasonIndex + 1,
      episodes: Array.from({ length: 3 }, (_, episodeIndex) => ({
        id: `season-${seasonIndex + 1}-episode-${episodeIndex + 1}`,
        title: `Season ${seasonIndex + 1} Episode ${episodeIndex + 1}`,
        season: seasonIndex + 1,
        number: episodeIndex + 1,
        ratings: [
          { source: 'test', rating: 6 + seasonIndex + episodeIndex / 10 }
        ]
      }))
    }))

    chart = createChart(container, seasons, { detailRoot })
    updateUiSettings({ fullShowTrendline: true })
    const previous = detailRoot.querySelector('[data-sidenote-nav="previous"]')
    const next = detailRoot.querySelector('[data-sidenote-nav="next"]')

    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(container.querySelector('.macro-trendline')).not.toBeNull()
    expect(previous.getAttribute('aria-label')).toBe(
      'Previous season trendline'
    )
    expect(next.getAttribute('aria-label')).toBe('Next season trendline')

    previous.click()
    expect(chart.getDebugState().selectedTrendId).toBe('season:3')
    next.click()
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')

    chart.moveSeason(1)
    expect(chart.getDebugState().selectedTrendId).toBe('season:2')
    chart.moveSeason(1)
    expect(chart.getDebugState().selectedTrendId).toBe('season:3')
    chart.moveSeason(1)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(chart.getDebugState().selectedPointId).toBeNull()

    chart.moveSeason(1)
    expect(chart.getDebugState().selectedTrendId).toBe('season:2')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')

    chart.toggleSeriesTrend()
    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
  })

  it('moves the viewport to contain a selected season within the 10% edges', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasonLengths([10, 10, 10, 10, 10])

    chart = createChart(container, seasons)
    chart.moveSeason(2)

    const { viewport, selectedTrendId } = chart.getDebugState()
    const span = viewport.end - viewport.start
    expect(selectedTrendId).toBe('season:3')
    expect((21 - viewport.start) / span).toBeGreaterThanOrEqual(0.1)
    expect((30 - viewport.start) / span).toBeCloseTo(0.9)
  })

  it('prioritizes the first episode when a selected season exceeds the buffered viewport', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasonLengths([3, 30, 40])

    chart = createChart(container, seasons)
    chart.moveSeason(1)

    const { viewport, selectedTrendId } = chart.getDebugState()
    const span = viewport.end - viewport.start
    expect(selectedTrendId).toBe('season:2')
    expect((4 - viewport.start) / span).toBeCloseTo(0.1)
  })

  it('keeps selectable season-axis labels in sync with season trends', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createTwoSeasons())

    expect(container.querySelector('.ratings-chart').getAttribute('role')).toBe(
      'group'
    )
    const labels = Array.from(container.querySelectorAll('.season-axis-label'))

    expect(labels.map((label) => label.textContent)).toEqual([
      'Season 1',
      'Season 2'
    ])
    expect(new Set(labels.map((label) => label.getAttribute('y'))).size).toBe(1)
    expect(
      labels.every((label) => label.getAttribute('role') === 'button')
    ).toBe(true)
    expect(
      labels.every((label) => label.getAttribute('tabindex') === '0')
    ).toBe(true)
    expect(
      labels.every(
        (label) => label.getAttribute('data-keyboard-chart') === 'true'
      )
    ).toBe(true)
    expect(labels[0].getAttribute('aria-pressed')).toBe('true')
    expect(labels[0].getAttribute('aria-label')).toBe(
      'Season 1 trendline selected'
    )
    expect(labels[0].classList.contains('is-active')).toBe(true)
    expect(labels[1].getAttribute('aria-pressed')).toBe('false')
    expect(
      Array.from(
        container.querySelectorAll('.season-axis-tick.is-active'),
        (tick) => tick.__data__
      )
    ).toEqual([1, 3.5])
    expect(
      container.querySelector('.season-axis-selection').getAttribute('stroke')
    ).toBe(labels[0].getAttribute('fill'))

    labels[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(chart.getDebugState().selectedTrendId).toBe('season:2')
    expect(labels[0].getAttribute('aria-pressed')).toBe('false')
    expect(labels[1].getAttribute('aria-pressed')).toBe('true')
    expect(labels[1].classList.contains('is-active')).toBe(true)
    expect(
      Array.from(
        container.querySelectorAll('.season-axis-tick.is-active'),
        (tick) => tick.__data__
      )
    ).toEqual([3.5, 6])

    labels[0].dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: ' ' })
    )

    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(labels[0].getAttribute('aria-pressed')).toBe('true')

    updateUiSettings({ seasonTrendlines: false })
    expect(chart.getDebugState().selectedTrendId).toBeNull()
    labels[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'season:2',
      uiSettings: { seasonTrendlines: true }
    })
    expect(labels[1].getAttribute('aria-pressed')).toBe('true')

    expect(container.querySelectorAll('.season-axis-tick')).toHaveLength(3)
    expect(
      Number(container.querySelector('.season-axis-line').getAttribute('y1'))
    ).toBeGreaterThan(Number(labels[0].getAttribute('y')))
    const chartHeight = getViewBoxHeight(
      container.querySelector('.ratings-chart')
    )
    expect(
      Number(container.querySelector('.season-axis-line').getAttribute('y1'))
    ).toBe(chartHeight - 0.5)
    expect(
      Number(container.querySelector('.season-axis-line').getAttribute('x1'))
    ).toBeLessThan(0)
    expect(
      Number(container.querySelector('.range-line').getAttribute('y2'))
    ).toBe(chartHeight)
    const firstTick = container.querySelector('.season-axis-tick')
    expect(Number(firstTick.getAttribute('y2'))).toBeLessThan(
      Number(firstTick.getAttribute('y1'))
    )
    expect(container.querySelector('.season-label')).toBeNull()
  })

  it('keeps a season label plain when no season trendline is available', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createTwoSeasons({ secondEpisodeCount: 2 }))
    const secondSeason = Array.from(
      container.querySelectorAll('.season-axis-label')
    ).find((label) => label.__data__.seasonNumber === 2)

    expect(secondSeason.getAttribute('role')).toBeNull()
    expect(secondSeason.getAttribute('tabindex')).toBeNull()
    expect(secondSeason.getAttribute('aria-pressed')).toBeNull()
    expect(secondSeason.getAttribute('aria-hidden')).toBe('true')
    expect(secondSeason.getAttribute('data-keyboard-chart')).toBeNull()
  })

  it('moves focus to the plot when a focused season-axis label leaves the viewport', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = Array.from({ length: 8 }, (_, seasonIndex) => ({
      number: seasonIndex + 1,
      episodes: Array.from({ length: 10 }, (_, episodeIndex) => ({
        id: `season-${seasonIndex + 1}-episode-${episodeIndex + 1}`,
        title: `Season ${seasonIndex + 1} Episode ${episodeIndex + 1}`,
        season: seasonIndex + 1,
        number: episodeIndex + 1,
        ratings: [{ source: 'test', rating: 7 + episodeIndex / 10 }]
      }))
    }))

    chart = createChart(container, seasons)
    const firstSeason = Array.from(
      container.querySelectorAll('.season-axis-label')
    ).find((label) => label.__data__.seasonNumber === 1)
    firstSeason.focus()

    chart.jumpBoundary('end')

    expect(document.activeElement).toBe(
      container.querySelector('.ratings-chart')
    )
  })

  it('selects best and worst season trendlines from the series summary', () => {
    updateUiSettings({ fullShowTrendline: true, seasonTrendlines: false })
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const seasons = createTwoSeasons()
    seasons[1].episodes.forEach((episode) => {
      episode.ratings[0].rating += 1
    })

    chart = createChart(container, seasons, { detailRoot })

    expect(chart.getDebugState().selectedTrendId).toBe('series')
    detailRoot.querySelector('[data-trend-season-number="2"]').click()

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'season:2',
      selectedPointId: null,
      uiSettings: { seasonTrendlines: true }
    })
  })

  it('resets T to the first available season trend when Season 1 has no trendline', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = Array.from({ length: 3 }, (_, seasonIndex) => ({
      number: seasonIndex + 1,
      episodes: Array.from(
        { length: seasonIndex === 0 ? 2 : 3 },
        (_, episodeIndex) => ({
          id: `season-${seasonIndex + 1}-episode-${episodeIndex + 1}`,
          title: `Season ${seasonIndex + 1} Episode ${episodeIndex + 1}`,
          season: seasonIndex + 1,
          number: episodeIndex + 1,
          ratings: [
            { source: 'test', rating: 6 + seasonIndex + episodeIndex / 10 }
          ]
        })
      )
    }))

    chart = createChart(container, seasons)

    expect(chart.getDebugState().selectedTrendId).toBe('season:2')
    chart.moveSeason(1)
    expect(chart.getDebugState().selectedTrendId).toBe('season:3')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('season:2')

    expect(chart.toggleSeriesTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('season:2')
  })

  it('re-enables season trendlines when T resets from the series trend', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons())
    expect(chart.toggleSeriesTrend()).toBe(true)
    updateUiSettings({ seasonTrendlines: false })

    expect(chart.getDebugState().selectedTrendId).toBe('series')
    expect(chart.toggleSeasonTrend()).toBe(true)
    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'season:1',
      uiSettings: { seasonTrendlines: true }
    })
  })

  it('returns to the full-series trend after clearing and enters browsing forward', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)

    chart = createChart(container, createSeasons(), { detailRoot })
    expect(chart.getDebugState().selectedTrendId).toBe('season:1')
    expect(chart.clearSelection()).toBe(true)

    expect(chart.getDebugState()).toMatchObject({
      selectedTrendId: 'series',
      selectedPointId: null
    })
    expect(detailRoot.querySelector('.sidenote-nav-label').textContent).toBe(
      'Full Series'
    )
    expect(chart.clearSelection()).toBe(false)
    detailRoot.querySelector('[data-sidenote-nav="next"]').click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    expect(chart.clearSelection()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('series')
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

  it('refits an untouched viewport when a provider snapshot adds an episode', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 1368
    })
    document.body.appendChild(container)
    const initialSeasons = createSeasons()
    initialSeasons[0].episodes = initialSeasons[0].episodes.slice(0, 64)

    chart = createChart(container, initialSeasons)
    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 64 })

    const updatedSeasons = createSeasons()
    updatedSeasons[0].episodes = updatedSeasons[0].episodes.slice(0, 65)
    chart.updateSeasons(updatedSeasons)

    expect(chart.getDebugState()).toMatchObject({
      hasUserInteracted: false,
      viewport: { start: 1, end: 65 }
    })

    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 1296
    })
    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 5
      })
    )

    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 65 })
    expect(
      Array.from(
        container.querySelectorAll('.episode-point'),
        (point) => point.__data__.id
      )
    ).toEqual(expect.arrayContaining(['episode-1', 'episode-65']))
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

  it('hides the viewport hint when the default view shows every episode', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 1200
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 50)

    chart = createChart(container, seasons)

    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 50 })
    expect(container.querySelector('.chart-source-status').hidden).toBe(true)
  })

  it('applies episode density to the initial view and live setting changes', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    updateUiSettings({ episodeDensity: 'roomy' })
    chart = createChart(container, createSeasons())

    expect(viewportEpisodeCount(chart)).toBe(17)

    updateUiSettings({ episodeDensity: 'dense' })
    expect(viewportEpisodeCount(chart)).toBe(44)

    updateUiSettings({ episodeDensity: 'all' })
    expect(chart.getDebugState().viewport).toEqual({ start: 1, end: 72 })
    expect(container.querySelector('.chart-source-status').hidden).toBe(true)
  })

  it('shows provider disagreement by default and lets the setting hide it', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes[0].ratings.push({
      source: 'tmdb',
      rating: 1,
      votes: 5
    })

    chart = createChart(container, seasons)

    expect(container.querySelectorAll('.source-spread')).toHaveLength(1)
    expect(container.querySelector('.chart-source-status').hidden).toBe(false)
    expect(container.querySelector('.chart-source-status').textContent).toBe(
      'Drag the overview window to pan; resize it to zoom.'
    )
    expect(
      container.querySelector('.chart-source-status').textContent
    ).not.toContain('Plotting TEST')

    chart.toggleSeriesTrend()

    expect(
      container.querySelector('.trend-summary-provenance').textContent
    ).toContain('Plotting TEST · source spread shows TMDB · 72 of 72 rated')
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

    chart.toggleSeriesTrend()

    expect(
      container.querySelector('.trend-summary-provenance').textContent
    ).toContain('Plotting TEST · 72 of 72 rated')
    expect(
      container.querySelector('.trend-summary-provenance').textContent
    ).not.toContain('source spread shows TMDB')
  })

  it('previews and pins a provider rating as the graph accent', () => {
    const style = document.createElement('style')
    style.dataset.chartThemeTest = ''
    style.textContent = readFileSync(
      resolve(process.cwd(), 'css/styles.css'),
      'utf8'
    )
    document.head.appendChild(style)
    updateUiSettings({ showSourceSpread: false })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes[0].ratings.push({
      source: 'tmdb',
      rating: 1,
      votes: 5
    })

    chart = createChart(container, seasons)
    chart.moveEpisode(1)

    const mainPoint = getRenderedPoint(container, 'episode-1')
    const mainRating = container.querySelector(
      '[data-provider-rating][data-rating-source="test"]'
    )
    const providerRating = container.querySelector(
      '[data-provider-rating][data-rating-source="tmdb"]'
    )
    const accentColor = mainPoint.getAttribute('fill')

    providerRating.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    let preview = container.querySelector('.provider-rating-preview')
    expect(preview.getAttribute('data-rating-source')).toBe('tmdb')
    expect(preview.getAttribute('fill')).toBe(accentColor)
    expect(Number(preview.getAttribute('cy'))).toBeGreaterThanOrEqual(0)
    expect(Number(preview.getAttribute('cy'))).toBeLessThanOrEqual(410)
    expect(mainPoint.getAttribute('fill')).not.toBe(accentColor)
    expect(container.querySelectorAll('.source-rating-point')).toHaveLength(0)
    expect(chart.getDebugState().providerRating.active).toMatchObject({
      pointId: 'episode-1',
      source: 'tmdb',
      rating: 1
    })

    providerRating.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(container.querySelector('.provider-rating-preview')).toBeNull()
    expect(mainPoint.getAttribute('fill')).toBe(accentColor)

    providerRating.click()
    preview = container.querySelector('.provider-rating-preview')
    expect(preview).not.toBeNull()
    expect(providerRating.getAttribute('aria-pressed')).toBe('true')
    expect(mainRating.classList).toContain('is-superseded')
    expect(chart.getDebugState().providerRating.selected).toEqual({
      pointId: 'episode-1',
      source: 'tmdb'
    })

    mainRating.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(container.querySelector('.provider-rating-preview')).toBeNull()
    expect(mainPoint.getAttribute('fill')).toBe(accentColor)
    mainRating.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(container.querySelector('.provider-rating-preview')).not.toBeNull()

    mainRating.click()
    expect(container.querySelector('.provider-rating-preview')).toBeNull()
    expect(mainRating.classList).not.toContain('is-superseded')
    expect(chart.getDebugState().providerRating.selected).toBeNull()

    providerRating.click()
    expect(container.querySelector('.provider-rating-preview')).not.toBeNull()
    chart.clearSelection()
    getRenderedPoint(container, 'episode-1').dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    expect(container.querySelector('.provider-rating-preview')).toBeNull()
    expect(chart.getDebugState().providerRating.selected).toBeNull()
  })

  it('pins a provider rating when its number is tapped on mobile', () => {
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
      value: 390
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes[0].ratings.push({
      source: 'tmdb',
      rating: 7.2,
      votes: 5
    })

    chart = createChart(container, seasons)
    chart.moveEpisode(1)
    const providerRating = container.querySelector(
      '[data-provider-rating][data-rating-source="tmdb"]'
    )
    providerRating.focus()
    providerRating.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 })
    )

    expect(chart.getDebugState().providerRating.selected).toEqual({
      pointId: 'episode-1',
      source: 'tmdb'
    })
    expect(document.activeElement).not.toBe(providerRating)
    expect(container.querySelector('.provider-rating-preview')).not.toBeNull()
  })

  it('switches and preserves an explicitly selected primary rating source', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes.forEach((episode, index) => {
      episode.ratings = [
        { source: 'omdb', rating: 8 + (index % 3) / 10 },
        {
          source: 'tmdb',
          rating: 7 + (index % 3) / 10,
          votes: 5
        }
      ]
    })
    const onPrimaryRatingSourceChange = vi.fn()

    chart = createChart(container, seasons, {
      onPrimaryRatingSourceChange
    })
    chart.moveEpisode(1)

    expect(chart.getDebugState().ratings.primarySource).toBe('omdb')
    expect(onPrimaryRatingSourceChange).toHaveBeenLastCalledWith('omdb')
    expect(chart.setPrimaryRatingSource('tmdb')).toBe(true)
    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      ratings: { primarySource: 'tmdb' }
    })
    expect(
      getRenderedPoint(container, 'episode-1').getAttribute(
        'data-rating-source'
      )
    ).toBe('tmdb')
    expect(
      container.querySelector('.sidenote-rating-primary').textContent
    ).toContain('TMDB 7.0')
    expect(onPrimaryRatingSourceChange).toHaveBeenLastCalledWith('tmdb')

    chart.updateSeasons(seasons)
    expect(chart.getDebugState().ratings.primarySource).toBe('tmdb')
    expect(chart.setPrimaryRatingSource('missing')).toBe(false)
    expect(chart.getDebugState().ratings.primarySource).toBe('tmdb')
  })

  it('cycles available primary rating sources in provider order', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes.forEach((episode, index) => {
      episode.ratings = [
        { source: 'tmdb', rating: 7 + (index % 3) / 10, votes: 5 },
        { source: 'omdb', rating: 8 + (index % 3) / 10 },
        { source: 'tvmaze', rating: 6 + (index % 3) / 10 }
      ]
    })
    const onPrimaryRatingSourceChange = vi.fn()

    chart = createChart(container, seasons, {
      onPrimaryRatingSourceChange
    })
    chart.moveEpisode(1)

    expect(chart.getDebugState().ratings.primarySource).toBe('omdb')
    expect(chart.cyclePrimaryRatingSource()).toBe(true)
    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      ratings: { primarySource: 'tvmaze' }
    })
    expect(chart.cyclePrimaryRatingSource()).toBe(true)
    expect(chart.getDebugState().ratings.primarySource).toBe('tmdb')
    expect(chart.cyclePrimaryRatingSource()).toBe(true)
    expect(chart.getDebugState().ratings.primarySource).toBe('omdb')
    expect(onPrimaryRatingSourceChange.mock.calls).toEqual([
      ['omdb'],
      ['tvmaze'],
      ['tmdb'],
      ['omdb']
    ])
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

    updateUiSettings({ palette: 'rainbow' })
    chart = createChart(container, seasons)

    const fallback = container.querySelector('[data-rating-fallback="true"]')
    expect(fallback).not.toBeNull()
    expect(fallback.getAttribute('fill')).toBe('hsl(150 68% 42%)')
    expect(fallback.getAttribute('fill-opacity')).toBe('0.2')
    expect(fallback.getAttribute('stroke')).toBe('hsl(150 68% 42%)')
    expect(fallback.getAttribute('stroke-width')).toBe('1.25')
    expect(fallback.getAttribute('stroke-opacity')).toBe('1')
  })

  it('enlarges points and trendlines when few ratings occupy the available width', () => {
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
    expect(restingRadius).toBe(
      Math.round(3 * MARK_DENSITY_CONFIG.pointRadius.maxScale * 100) / 100
    )

    chart.toggleSeriesTrend()
    expect(
      Number(
        container.querySelector('.macro-trendline').getAttribute('stroke-width')
      )
    ).toBe(
      Math.round(
        2.2 *
          MARK_DENSITY_CONFIG.lineWidth.maxScale *
          MARK_DENSITY_CONFIG.selection.lineScale *
          100
      ) / 100
    )

    chart.moveEpisode(1)
    const activeRadius = Number(
      container.querySelector('.episode-point').getAttribute('r')
    )
    expect(activeRadius).toBe(
      Math.round(
        restingRadius * MARK_DENSITY_CONFIG.selection.pointScale * 100
      ) / 100
    )
  })

  it('re-sizes marks live from the mark scaling setting and reports slot widths', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)
    const seasons = createSeasons()
    seasons[0].episodes = seasons[0].episodes.slice(0, 5)
    const densityEvents = []
    const onDensity = (event) => densityEvents.push(event.detail)
    document.addEventListener('graphtv:chart-density', onDensity)

    try {
      chart = createChart(container, seasons)

      const metrics = chart.getDensityMetrics()
      expect(metrics.chartSlotWidth).toBeGreaterThan(
        MARK_DENSITY_CONFIG.ramp.sparseSlotWidth
      )
      expect(metrics.sparklineSlotWidth).toBe(metrics.chartSlotWidth)
      expect(densityEvents.at(-1)).toEqual(metrics)

      updateUiSettings({
        markDensity: { pointRadius: { minScale: 1, maxScale: 3 } }
      })

      expect(
        Number(container.querySelector('.episode-point').getAttribute('r'))
      ).toBe(9)
      expect(
        Number(container.querySelector('.sparkline-point').getAttribute('r'))
      ).toBe(Math.round(1.7 * 3 * 100) / 100)
    } finally {
      document.removeEventListener('graphtv:chart-density', onDensity)
      updateUiSettings({ markDensity: MARK_DENSITY_CONFIG })
    }
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
    expect(container.querySelector('.trend-label')).toBeNull()
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

  it('batches large full-series views while preserving point selection', () => {
    updateUiSettings({ episodeDensity: 'all' })
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 1200
    })
    document.body.appendChild(container)

    const seasons = createSeasonLengths([400])
    for (const episode of seasons[0].episodes) {
      episode.ratings.push({
        source: 'comparison',
        rating: episode.ratings[0].rating + 0.5
      })
    }
    chart = createChart(container, seasons)

    expect(container.querySelectorAll('.episode-point')).toHaveLength(0)
    expect(container.querySelectorAll('.episode-point-batch')).toHaveLength(1)
    expect(container.querySelectorAll('.episode-point-hit')).toHaveLength(0)
    expect(container.querySelectorAll('.episode-point-hit-batch')).toHaveLength(
      1
    )
    expect(container.querySelectorAll('.sparkline-point')).toHaveLength(0)
    expect(container.querySelectorAll('.sparkline-point-batch')).toHaveLength(1)
    expect(container.querySelectorAll('.source-spread')).toHaveLength(0)
    expect(container.querySelectorAll('.source-spread-batch')).toHaveLength(1)

    const hitBatch = container.querySelector('.episode-point-hit-batch')
    const firstPoint = hitBatch.__data__.points[0]
    const firstMark = container.querySelector('.episode-point-batch')
    const [, pathStartX, pathY] = firstMark
      .getAttribute('d')
      .match(/^M(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
      .map(Number)
    const pointerPosition = {
      clientX: pathStartX + firstMark.__data__.radius,
      clientY: pathY
    }
    hitBatch.dispatchEvent(
      new MouseEvent('mouseenter', {
        bubbles: true,
        ...pointerPosition
      })
    )

    expect(chart.getDebugState().hoverPointId).toBe(firstPoint.id)

    hitBatch.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        ...pointerPosition
      })
    )

    expect(chart.getDebugState().selectedPointId).toBe(firstPoint.id)
    expect(container.querySelectorAll('.source-spread.is-active')).toHaveLength(
      1
    )
    expect(
      (
        container
          .querySelector('.source-spread-batch')
          .getAttribute('d')
          .match(/M/g) ?? []
      ).length
    ).toBe(seasons[0].episodes.length - 1)
  })

  it('returns to the full-series trend when a selected trendline is clicked again', () => {
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

    expect(chart.getDebugState().selectedTrendId).toBe('series')
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

  it('highlights the matching axis label and trendline from either hover target', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createTwoSeasons())
    const surface = container.querySelector('.chart-hit-surface')
    const getSeasonLabel = (seasonNumber) =>
      Array.from(container.querySelectorAll('.season-axis-label')).find(
        (label) => label.__data__.seasonNumber === seasonNumber
      )
    const getSeasonTrend = (seasonNumber) =>
      Array.from(container.querySelectorAll('.micro-trendline')).find(
        (trendline) => trendline.__data__.id === `season:${seasonNumber}`
      )
    const seasonTwoPoint = getPathMidpoint(getSeasonTrend(2).getAttribute('d'))

    surface.dispatchEvent(
      new MouseEvent('pointermove', {
        bubbles: true,
        clientX: seasonTwoPoint.x,
        clientY: seasonTwoPoint.y
      })
    )
    await vi.advanceTimersByTimeAsync(100)

    expect(getSeasonTrend(2).classList.contains('is-active')).toBe(true)
    expect(getSeasonLabel(2).classList.contains('is-active')).toBe(true)
    expect(getSeasonLabel(1).getAttribute('aria-pressed')).toBe('true')
    expect(getSeasonLabel(2).getAttribute('aria-pressed')).toBe('false')

    surface.dispatchEvent(new MouseEvent('pointerleave'))
    getSeasonLabel(2).dispatchEvent(new MouseEvent('pointerenter'))

    expect(chart.getDebugState().hoverTrendId).toBe('season:2')
    expect(getSeasonTrend(2).classList.contains('is-active')).toBe(true)
    expect(getSeasonLabel(2).classList.contains('is-active')).toBe(true)

    getSeasonLabel(2).dispatchEvent(new MouseEvent('pointerleave'))

    expect(chart.getDebugState().hoverTrendId).toBeNull()
    expect(getSeasonTrend(1).classList.contains('is-active')).toBe(true)
    expect(getSeasonLabel(1).classList.contains('is-active')).toBe(true)
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
    expect(container.querySelector('.trend-label')).toBeNull()

    expect(chart.toggleSeriesTrend()).toBe(true)
    expect(chart.getDebugState().selectedTrendId).toBe('series')

    const previous = container.querySelector('[data-sidenote-nav="previous"]')
    const next = container.querySelector('[data-sidenote-nav="next"]')
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-72')
    expect(next.getAttribute('aria-label')).toBe('First rated episode')
    next.click()
    expect(chart.getDebugState()).toMatchObject({
      selectedPointId: 'episode-1',
      selectedTrendId: null
    })
    expect(previous.getAttribute('aria-label')).toBe('Last rated episode')
    previous.click()
    expect(chart.getDebugState().selectedPointId).toBe('episode-72')

    chart.moveEpisode(1)
    expect(chart.getDebugState().selectedPointId).toBe('episode-1')
    chart.moveEpisode(-1)
    expect(chart.getDebugState().selectedPointId).toBe('episode-72')
    expect(chart.getDebugState().selectedTrendId).toBeNull()
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
    expect(
      container.querySelector('.chart-selection-status').textContent
    ).toContain('Full series trend selected. Mean')
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

  it('moves fractional viewport-edge points through the chart edge before removing them', () => {
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
    const firstPoint = getRenderedPoint(container, 'episode-1')
    const firstX = Number(firstPoint.getAttribute('cx'))

    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 5
      })
    )

    const pannedFirstPoint = getRenderedPoint(container, 'episode-1')
    expect(pannedFirstPoint).not.toBeNull()
    expect(Number(pannedFirstPoint.getAttribute('cx'))).toBeLessThan(firstX)

    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: 10000
      })
    )
    const lastPoint = getRenderedPoint(container, 'episode-72')
    const lastX = Number(lastPoint.getAttribute('cx'))

    body.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaX: -5
      })
    )

    const pannedLastPoint = getRenderedPoint(container, 'episode-72')
    expect(pannedLastPoint).not.toBeNull()
    expect(Number(pannedLastPoint.getAttribute('cx'))).toBeGreaterThan(lastX)
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

  it('responds continuously and announces a completed slow touch drag', () => {
    vi.useFakeTimers()
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
    const performanceNow = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValue(1001)

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 1, clientX: 100 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 90 })

    const nextViewport = chart.getDebugState().viewport
    expect(nextViewport.start).toBeGreaterThan(initialViewport.start)
    expect(nextViewport.start).toBeLessThan(initialViewport.start + 1)

    dispatchTouchPointer(body, 'pointerup', { pointerId: 1, clientX: 90 })
    vi.advanceTimersByTime(120)
    expect(container.querySelector('.chart-viewport-status').textContent).toBe(
      'Episodes 2–18 of 72'
    )
    performanceNow.mockRestore()
  })

  it('announces the final viewport after touch-fling inertia settles', () => {
    vi.useFakeTimers()
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
    const performanceNow = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(20)
      .mockReturnValue(21)

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 1, clientX: 300 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 100 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 1, clientX: 100 })
    vi.advanceTimersByTime(5000)

    expect(chart.getDebugState().viewport.start).toBeCloseTo(55)
    expect(chart.getDebugState().viewport.end).toBe(72)
    expect(container.querySelector('.chart-viewport-status').textContent).toBe(
      'Episodes 55–72 of 72'
    )
    performanceNow.mockRestore()
  })

  it('announces the arrested viewport when a tap stops touch-fling inertia', () => {
    vi.useFakeTimers()
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
    const performanceNow = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(20)
      .mockReturnValue(21)

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 1, clientX: 300 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 100 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 1, clientX: 100 })
    vi.advanceTimersByTime(32)

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 2, clientX: 100 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 2, clientX: 100 })
    const arrestedViewport = { ...chart.getDebugState().viewport }
    vi.advanceTimersByTime(1000)

    expect(chart.getDebugState().viewport).toEqual(arrestedViewport)
    const start = Math.ceil(arrestedViewport.start - 1e-9)
    const end = Math.floor(arrestedViewport.end + 1e-9)
    expect(container.querySelector('.chart-viewport-status').textContent).toBe(
      `Episodes ${start}–${end} of 72`
    )
    performanceNow.mockRestore()
  })

  it('announces a touch pinch after both pointers are released', () => {
    vi.useFakeTimers()
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
    dispatchTouchPointer(body, 'pointerdown', { pointerId: 2, clientX: 200 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 2, clientX: 300 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 2, clientX: 300 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 1, clientX: 100 })
    vi.advanceTimersByTime(120)

    const pinchedViewport = chart.getDebugState().viewport
    expect(pinchedViewport.end - pinchedViewport.start).toBeLessThan(
      initialViewport.end - initialViewport.start
    )
    expect(
      container.querySelector('.chart-viewport-status').textContent
    ).toMatch(/^Episodes \d+–\d+ of 72$/u)
  })

  it('suppresses the trailing click after a pan against a clamped edge', () => {
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
    chart.moveEpisode(1)
    const selectedPointId = chart.getDebugState().selectedPointId
    const initialViewport = chart.getDebugState().viewport
    const body = container.querySelector('.chart-body-shell')
    Object.defineProperty(body, 'clientWidth', {
      configurable: true,
      value: 544
    })
    const performanceNow = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1001)
      .mockReturnValue(1002)

    dispatchTouchPointer(body, 'pointerdown', { pointerId: 1, clientX: 100 })
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 110 })
    dispatchTouchPointer(body, 'pointerup', { pointerId: 1, clientX: 110 })
    body.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(chart.getDebugState().viewport).toEqual(initialViewport)
    expect(chart.getDebugState().selectedPointId).toBe(selectedPointId)
    performanceNow.mockRestore()
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

    chart.destroy()
    chart = undefined
    expect(detailRoot.childNodes).toHaveLength(0)
  })

  it('refreshes episode source links when supplemental provider context arrives', () => {
    const container = document.createElement('div')
    const detailRoot = document.createElement('section')
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.append(container, detailRoot)
    const initialEpisode = {
      id: 'episode-1',
      title: 'Pilot',
      season: 1,
      episode: 1,
      ratings: [{ source: 'tvmaze', rating: 8 }],
      sourceIds: { tvmaze: '1001' }
    }

    chart = createChart(
      container,
      [{ number: 1, episodes: [initialEpisode] }],
      {
        detailRoot,
        show: { externalIds: { tvmaze: 179 } }
      }
    )

    expect(
      detailRoot.querySelector('.sidenote-rating-source').getAttribute('href')
    ).toBe('https://www.tvmaze.com/episodes/1001')

    chart.updateSeasons(
      [
        {
          number: 1,
          episodes: [
            {
              ...initialEpisode,
              ratings: [
                ...initialEpisode.ratings,
                { source: 'tmdb', rating: 8.2 }
              ],
              sourceIds: { ...initialEpisode.sourceIds, tmdb: '66452' }
            }
          ]
        }
      ],
      {
        show: { externalIds: { tvmaze: 179, tmdb: 1438 } }
      }
    )

    expect(
      Array.from(detailRoot.querySelectorAll('.sidenote-rating-source')).map(
        (source) => source.getAttribute('href')
      )
    ).toEqual([
      'https://www.tvmaze.com/episodes/1001',
      'https://www.themoviedb.org/tv/1438/season/1/episode/1'
    ])
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

function getViewBoxHeight(svg) {
  return Number(svg.getAttribute('viewBox').split(/\s+/)[3])
}

function getAxisLabels(container) {
  return Array.from(
    container.querySelectorAll('.range-tick text'),
    (node) => node.textContent
  )
}

function getRenderedPoint(container, id) {
  return Array.from(container.querySelectorAll('.episode-point')).find(
    (point) => point.__data__.id === id
  )
}

function viewportEpisodeCount(chartInstance) {
  const { start, end } = chartInstance.getDebugState().viewport
  return end - start + 1
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

function createTwoSeasons({ secondEpisodeCount = 3 } = {}) {
  return Array.from({ length: 2 }, (_, seasonIndex) => ({
    number: seasonIndex + 1,
    episodes: Array.from(
      { length: seasonIndex === 1 ? secondEpisodeCount : 3 },
      (_, episodeIndex) => ({
        id: `season-${seasonIndex + 1}-episode-${episodeIndex + 1}`,
        title: `Season ${seasonIndex + 1} Episode ${episodeIndex + 1}`,
        season: seasonIndex + 1,
        number: episodeIndex + 1,
        ratings: [{ source: 'test', rating: 7 + episodeIndex / 10 }]
      })
    )
  }))
}

function createSeasonLengths(episodeCounts) {
  return episodeCounts.map((episodeCount, seasonIndex) => ({
    number: seasonIndex + 1,
    episodes: Array.from({ length: episodeCount }, (_, episodeIndex) => ({
      id: `season-${seasonIndex + 1}-episode-${episodeIndex + 1}`,
      title: `Season ${seasonIndex + 1} Episode ${episodeIndex + 1}`,
      season: seasonIndex + 1,
      number: episodeIndex + 1,
      ratings: [{ source: 'test', rating: 7 + (episodeIndex % 3) / 10 }]
    }))
  }))
}

function createBreakpointSeasons() {
  return Array.from({ length: 4 }, (_, seasonIndex) => ({
    number: seasonIndex + 1,
    episodes: Array.from({ length: 8 }, (_, episodeIndex) => {
      const index = seasonIndex * 8 + episodeIndex
      const rating = (index < 16 ? 8.8 : 6.4) + [0, 0.1, -0.1, 0.05][index % 4]
      return {
        id: `breakpoint-episode-${index + 1}`,
        title: `Breakpoint Episode ${index + 1}`,
        season: seasonIndex + 1,
        number: episodeIndex + 1,
        ratings: [{ source: 'test', rating }]
      }
    })
  }))
}

function createRatedEpisode(id, ratings) {
  return {
    id,
    title: id,
    season: 1,
    episode: Number.NaN,
    ratings: ratings.map((rating) =>
      rating.source === 'tmdb' && rating.votes === undefined
        ? { ...rating, votes: 5 }
        : rating
    )
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
