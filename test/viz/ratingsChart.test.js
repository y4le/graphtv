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
    showSourceSpread: true
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: false,
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

    updateUiSettings({ showSourceSpread: false })

    expect(container.querySelectorAll('.source-spread')).toHaveLength(0)
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
      56 +
      (((initialViewport.start + initialViewport.end) / 2 - 1) / 71) * 528
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
    dispatchTouchPointer(body, 'pointermove', { pointerId: 1, clientX: 95 })

    const nextViewport = chart.getDebugState().viewport
    expect(nextViewport.start).toBeGreaterThan(initialViewport.start)
    expect(nextViewport.start).toBeLessThan(initialViewport.start + 1)
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

    expect(container.querySelector('.reading-pane-shell')).toBeNull()
    expect(detailRoot.querySelector('.sidenote-card')).not.toBeNull()
    expect(detailRoot.textContent).toContain('Episode 2')
    expect(detailRoot.textContent).toContain('TEST: 7.0 · plotted')
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
    chart.moveEpisode(0)
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
    expect(detailRoot.textContent).toContain('TMDB: 9.0 · 500 votes')
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
    chart.moveEpisode(0)
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

    expect(detailRoot.textContent).toContain('TEST: 6.0 · 123 votes')
    expect(detailRoot.textContent).toContain('TMDB: 9.0 · 500 votes')
  })

  it('debounces selection-only episode detail loading', async () => {
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

    await vi.advanceTimersByTimeAsync(249)
    expect(loadEpisodeDetails).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(loadEpisodeDetails).toHaveBeenCalledTimes(1)
    expect(loadEpisodeDetails.mock.calls[0][0].title).toBe('Episode 3')
    expect(detailRoot.textContent).toContain(
      'IMDb (via OMDb): n/a · 3,379 votes'
    )
  })

  it('does not load episode details from hover', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const loadEpisodeDetails = vi.fn()
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 600
    })
    document.body.appendChild(container)

    chart = createChart(container, createSeasons(), { loadEpisodeDetails })
    container
      .querySelector('.episode-point')
      .dispatchEvent(new MouseEvent('mouseenter'))
    await vi.advanceTimersByTimeAsync(300)

    expect(loadEpisodeDetails).not.toHaveBeenCalled()
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
