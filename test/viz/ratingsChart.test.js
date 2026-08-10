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
  updateUiSettings({ absoluteYAxis: false })
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

    expect(getAxisLabels(container)).toEqual(expect.arrayContaining(['0.0', '10.0']))
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
    expect(detailRoot.textContent).toContain('OMDB: n/a · 3,379 votes')
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
    container.querySelector('.episode-point').dispatchEvent(new MouseEvent('mouseenter'))
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
  return Array.from(container.querySelectorAll('.range-tick text'), (node) => node.textContent)
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
