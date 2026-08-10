import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChart } from '../../src/viz/ratingsChart.js'

let chart

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
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
})

function getViewBoxWidth(svg) {
  return Number(svg.getAttribute('viewBox').split(/\s+/)[2])
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
