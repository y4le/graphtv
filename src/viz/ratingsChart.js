import { create } from 'd3'

import { buildChartModel, createScales } from './scales.js'
import { renderAxes, renderPoints, renderSeasonSeparators, renderTrendlines } from './marks.js'
import { chartTheme } from './theme.js'
import { createTooltip, getTooltipContent } from './tooltip.js'

const PADDING = {
  top: 24,
  right: 28,
  bottom: 42,
  left: 52
}

export function createChart(container, seasons) {
  container.innerHTML = ''
  container.classList.add('chart-frame')

  const svg = create('svg').attr('class', 'ratings-chart').attr('role', 'img')
  container.appendChild(svg.node())
  const tooltip = createTooltip(container)

  let latestSeasons = seasons

  function render() {
    const width = Math.max(container.clientWidth, 320)
    const height = Math.max(Math.min(width * 0.58, 560), 320)
    const model = buildChartModel(latestSeasons)
    const scales = createScales(model, {
      width,
      height,
      padding: PADDING
    })

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height)

    svg
      .selectAll('.chart-bg')
      .data([null])
      .join('rect')
      .attr('class', 'chart-bg')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', 20)
      .attr('fill', chartTheme.background)

    renderAxes(svg, { width, height, padding: PADDING }, scales, chartTheme)
    renderSeasonSeparators(svg, model.seasonSpans, scales, { width, height, padding: PADDING }, chartTheme)
    renderTrendlines(svg, model.trendlines, scales, chartTheme)
    renderPoints(
      svg,
      model.points,
      scales,
      chartTheme,
      (event, point) => {
        const bounds = container.getBoundingClientRect()
        const x = Math.min(event.clientX - bounds.left + 12, bounds.width - 280)
        const y = Math.max(event.clientY - bounds.top - 28, 12)
        tooltip.show(getTooltipContent(point), { x, y })
      },
      () => tooltip.hide()
    )
  }

  const resizeObserver = new ResizeObserver(() => {
    render()
  })
  resizeObserver.observe(container)
  render()

  return {
    update(nextSeasons) {
      latestSeasons = nextSeasons
      render()
    },
    destroy() {
      resizeObserver.disconnect()
      tooltip.hide()
      container.innerHTML = ''
    }
  }
}
