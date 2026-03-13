import { select } from 'd3'

import {
  buildChartModel,
  clampViewport,
  createDefaultViewport,
  createMainScales,
  createSparklineScales,
  getMacroTrendline,
  getVisiblePoints,
  getVisibleRatedPoints,
  getVisibleSeasonSpans,
  getVisibleSeasonTrendlines
} from './scales.js'
import { renderCrosshair, renderPoints, renderRangeFrame, renderSeasonLabels, renderTrendlines } from './marks.js'
import { createSidenote } from './sidenote.js'
import { createSparkline } from './sparkline.js'
import { getChartTheme } from './theme.js'

const MOBILE_QUERY = '(max-width: 767px)'

export function createChart(container, seasons, options = {}) {
  container.innerHTML = ''
  container.classList.add('chart-root')

  const shell = document.createElement('div')
  shell.className = 'chart-shell'
  shell.innerHTML = `
    <div class="sparkline-shell">
      <svg class="sparkline-chart" aria-hidden="true"></svg>
    </div>
    <div class="main-chart-shell">
      <div class="chart-axis-shell">
        <svg class="chart-axis" aria-hidden="true"></svg>
      </div>
      <div class="chart-body-shell">
        <svg class="ratings-chart" role="img" aria-label="Episode ratings chart"></svg>
      </div>
    </div>
  `
  container.appendChild(shell)

  const sparklineSvg = shell.querySelector('.sparkline-chart')
  const axisSvg = select(shell.querySelector('.chart-axis'))
  const mainSvg = select(shell.querySelector('.ratings-chart'))
  const bodyShell = shell.querySelector('.chart-body-shell')
  const mediaQuery = window.matchMedia(MOBILE_QUERY)

  let model = buildChartModel(seasons)
  let viewport = null
  let detailPointId = null
  let hoverPointId = null
  let focusPointId = null
  let sparkline = null

  const sidenote = createSidenote({
    desktopRoot: options.desktopDetailRoot,
    mobileRoot: options.mobileDetailRoot
  })

  function getPointById(id) {
    return id ? model.points.find((point) => point.id === id) ?? null : null
  }

  function getActivePoint() {
    return getPointById(hoverPointId) || getPointById(focusPointId) || (isMobile() ? getPointById(detailPointId) : null)
  }

  function isMobile() {
    return mediaQuery.matches
  }

  function updateDetail(point) {
    if (!point) {
      sidenote.renderPlaceholder()
      return
    }

    sidenote.renderPoint(point)
  }

  function ensureViewport(width) {
    const defaultViewport = createDefaultViewport(model, width, isMobile())

    if (!viewport) {
      viewport = defaultViewport
      return
    }

    const currentWidth = viewport.end - viewport.start + 1
    const defaultWidth = defaultViewport.end - defaultViewport.start + 1
    const nextViewport =
      model.xMax <= 40
        ? defaultViewport
        : {
            start: viewport.start,
            end: viewport.start + Math.min(currentWidth, defaultWidth) - 1
          }

    viewport = clampViewport(nextViewport, model)
  }

  function centerViewportAround(x) {
    const width = viewport.end - viewport.start + 1
    const halfWidth = Math.floor(width / 2)
    viewport = clampViewport(
      {
        start: x - halfWidth,
        end: x - halfWidth + width - 1
      },
      model
    )
  }

  function render() {
    const chartTheme = getChartTheme()
    const width = Math.max(container.clientWidth, 320)
    const axisWidth = isMobile() ? 48 : 56
    const chartWidth = Math.max(width - axisWidth - 16, 240)
    const chartHeight = isMobile() ? 260 : 410
    const sparklineHeight = isMobile() ? 30 : 40

    ensureViewport(chartWidth)

    const mainScales = createMainScales(model, viewport, {
      width: chartWidth,
      height: chartHeight
    })
    const sparklineScales = createSparklineScales(model, {
      width: chartWidth + axisWidth,
      height: sparklineHeight
    })
    const visiblePoints = getVisiblePoints(model, viewport)
    const visibleRatedPoints = getVisibleRatedPoints(model, viewport)
    const activePoint = getActivePoint()

    shell.style.setProperty('--chart-height', `${chartHeight}px`)
    shell.style.setProperty('--axis-width', `${axisWidth}px`)

    axisSvg.attr('viewBox', `0 0 ${axisWidth} ${chartHeight}`).attr('width', axisWidth).attr('height', chartHeight)
    mainSvg.attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`).attr('width', chartWidth).attr('height', chartHeight)

    axisSvg.selectAll('*').remove()
    renderRangeFrame(axisSvg, mainScales, { width: axisWidth, height: chartHeight }, chartTheme)

    mainSvg.selectAll('.chart-background').data([null]).join('rect').attr('class', 'chart-background').attr('width', chartWidth).attr('height', chartHeight).attr('fill', chartTheme.background)

    renderTrendlines(
      mainSvg,
      getVisibleSeasonTrendlines(model, viewport),
      getMacroTrendline(model, viewport),
      mainScales,
      chartTheme
    )
    renderSeasonLabels(mainSvg, getVisibleSeasonSpans(model, viewport), viewport, mainScales, { width: chartWidth, height: chartHeight }, chartTheme)
    renderCrosshair(mainSvg, activePoint, mainScales, { width: chartWidth, height: chartHeight }, chartTheme)
    renderPoints(mainSvg, visiblePoints, mainScales, chartTheme, {
      activePointId: activePoint?.id ?? null,
      focusPointId,
      totalSeasons: model.totalSeasons,
      onHover(point) {
        hoverPointId = point.id
        detailPointId = point.id
        updateDetail(point)
        render()
      },
      onLeave() {
        hoverPointId = null
        render()
      },
      onFocus(point) {
        focusPointId = point.id
        detailPointId = point.id
        updateDetail(point)
        if (point.x < viewport.start || point.x > viewport.end) {
          centerViewportAround(point.x)
        }
        render()
      },
      onBlur() {
        focusPointId = null
        render()
      },
      onSelect(point) {
        detailPointId = point.id
        hoverPointId = point.id
        updateDetail(point)
        render()
      },
      onNavigate(point, direction) {
        const points = visibleRatedPoints.length ? model.ratedPoints : model.points.filter((entry) => typeof entry.rating === 'number')
        const currentIndex = points.findIndex((entry) => entry.id === point.id)
        const nextPoint = points[currentIndex + direction]

        if (!nextPoint) {
          return
        }

        detailPointId = nextPoint.id
        focusPointId = nextPoint.id
        hoverPointId = null
        updateDetail(nextPoint)
        if (nextPoint.x < viewport.start || nextPoint.x > viewport.end) {
          centerViewportAround(nextPoint.x)
        }
        render()
      },
      onEscape() {
        hoverPointId = null
        focusPointId = null
        if (isMobile()) {
          detailPointId = null
          updateDetail(null)
        }
        render()
      }
    })

    if (!sparkline) {
      sparkline = createSparkline(sparklineSvg, {
        model,
        viewport,
        theme: chartTheme,
        dimensions: {
          width: chartWidth + axisWidth,
          height: sparklineHeight
        },
        scales: sparklineScales,
        onViewportChange(nextViewport) {
          viewport = clampViewport(nextViewport, model)
          render()
        }
      })
    } else {
      sparkline.render({
        model,
        viewport,
        theme: chartTheme,
        dimensions: {
          width: chartWidth + axisWidth,
          height: sparklineHeight
        },
        scales: sparklineScales,
        onViewportChange(nextViewport) {
          viewport = clampViewport(nextViewport, model)
          render()
        }
      })
    }

    bodyShell.onscroll = () => {
      if (!isMobile()) {
        return
      }

      const scrollRatio = bodyShell.scrollWidth > bodyShell.clientWidth ? bodyShell.scrollLeft / (bodyShell.scrollWidth - bodyShell.clientWidth) : 0
      const widthInEpisodes = viewport.end - viewport.start + 1
      const maxStart = Math.max(1, model.xMax - widthInEpisodes + 1)
      viewport = clampViewport(
        {
          start: 1 + scrollRatio * (maxStart - 1),
          end: 1 + scrollRatio * (maxStart - 1) + widthInEpisodes - 1
        },
        model
      )
      sparkline.render({
        model,
        viewport,
        theme: chartTheme,
        dimensions: {
          width: chartWidth + axisWidth,
          height: sparklineHeight
        },
        scales: sparklineScales,
        onViewportChange(nextViewport) {
          viewport = clampViewport(nextViewport, model)
          render()
        }
      })
    }

    if (!detailPointId) {
      updateDetail(null)
    }
  }

  shell.addEventListener('click', (event) => {
    if (isMobile() && event.target === shell.querySelector('.ratings-chart')) {
      hoverPointId = null
      focusPointId = null
      detailPointId = null
      updateDetail(null)
      render()
    }
  })

  const resizeObserver = new ResizeObserver(() => {
    render()
  })
  resizeObserver.observe(container)

  const settingsListener = () => {
    render()
  }
  document.addEventListener('graphtv:settings-change', settingsListener)

  render()

  return {
    update(nextSeasons) {
      model = buildChartModel(nextSeasons)
      viewport = null
      detailPointId = null
      hoverPointId = null
      focusPointId = null
      render()
    },
    destroy() {
      resizeObserver.disconnect()
      document.removeEventListener('graphtv:settings-change', settingsListener)
      sparkline?.destroy()
      container.innerHTML = ''
    }
  }
}
