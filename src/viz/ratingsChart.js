import { select } from 'd3'

import {
  buildChartModel,
  clampViewport,
  createDefaultViewport,
  createFullSeriesScales,
  createMainScales,
  createSparklineScales,
  getMacroTrendline,
  getVisiblePoints,
  getVisibleSeasonSpans,
  getVisibleSeasonTrendlines
} from './scales.js'
import { renderCrosshair, renderPoints, renderRangeFrame, renderSeasonLabels, renderTrendlines } from './marks.js'
import { createSidenote } from './sidenote.js'
import { createSparkline } from './sparkline.js'
import { getChartTheme, getUiSettings } from './theme.js'

const MOBILE_QUERY = '(max-width: 767px)'
const MOBILE_POINT_SPACING = 18

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
    <div class="reading-pane-shell">
      <div class="reading-pane-axis-spacer" aria-hidden="true"></div>
      <div class="reading-pane" data-reading-pane></div>
    </div>
  `
  container.appendChild(shell)

  const sparklineSvg = shell.querySelector('.sparkline-chart')
  const axisSvg = select(shell.querySelector('.chart-axis'))
  const mainSvg = select(shell.querySelector('.ratings-chart'))
  const bodyShell = shell.querySelector('.chart-body-shell')
  const readingPane = shell.querySelector('[data-reading-pane]')
  const mediaQuery = window.matchMedia(MOBILE_QUERY)

  const model = buildChartModel(seasons)
  let viewport = null
  let selectedPointId = null
  let hoverPointId = null
  let sparkline = null
  let suppressScrollSync = false

  const sidenote = createSidenote({
    desktopRoot: options.detailRoot ?? readingPane,
    mobileRoot: options.detailRoot ?? readingPane
  })

  function isMobile() {
    return mediaQuery.matches
  }

  function usesScrollableBody() {
    return isMobile() && model.xMax > 40
  }

  function getPointById(id) {
    return id ? model.points.find((point) => point.id === id) ?? null : null
  }

  function getRatedPoints() {
    return model.ratedPoints
  }

  function getActivePoint() {
    return getPointById(hoverPointId) || getPointById(selectedPointId)
  }

  function updateDetail(point) {
    if (!point) {
      sidenote.renderPlaceholder()
      shell.style.removeProperty('--reading-pane-marker')
      return
    }

    sidenote.renderPoint(point)
  }

  function ensureSelectedPoint() {
    return getPointById(selectedPointId) ?? model.ratedPoints[0] ?? null
  }

  function ensureNavigablePoint() {
    return getActivePoint() ?? ensureSelectedPoint()
  }

  function ensureViewport(width) {
    const defaultViewport = createDefaultViewport(model, width, isMobile())

    if (!viewport) {
      viewport = defaultViewport
      return
    }

    viewport = clampViewport(viewport, model)
  }

  function setSelectedPoint(point, source = 'keyboard') {
    if (!point) {
      return
    }

    if (source === 'keyboard') {
      hoverPointId = null
    }

    selectedPointId = point.id
    updateDetail(point)

    if (usesScrollableBody()) {
      syncScrollableViewportToPoint(point, source === 'keyboard')
    } else if (point.x < viewport.start || point.x > viewport.end) {
      const width = viewport.end - viewport.start + 1
      const halfWidth = Math.floor(width / 2)
      viewport = clampViewport(
        {
          start: point.x - halfWidth,
          end: point.x - halfWidth + width - 1
        },
        model
      )
    }

    render()
  }

  function moveEpisode(delta) {
    const currentPoint = ensureNavigablePoint()
    if (!currentPoint) {
      return
    }
    const points = getRatedPoints()
    const currentIndex = points.findIndex((point) => point.id === currentPoint.id)
    const nextIndex = clamp(currentIndex + delta, 0, points.length - 1)
    setSelectedPoint(points[nextIndex])
  }

  function moveSeason(delta) {
    const activePoint = ensureNavigablePoint()
    if (!activePoint) {
      return
    }

    const seasonAnchors = getSeasonAnchors()
    const currentSeasonIndex = seasonAnchors.findIndex((point) => point.season === activePoint.season)
    const nextSeasonIndex = clamp(currentSeasonIndex + delta, 0, seasonAnchors.length - 1)
    setSelectedPoint(seasonAnchors[nextSeasonIndex])
  }

  function jumpBoundary(edge) {
    const points = getRatedPoints()
    if (points.length === 0) {
      return
    }

    setSelectedPoint(edge === 'start' ? points[0] : points[points.length - 1])
  }

  function getSeasonAnchors() {
    const anchors = []
    const seen = new Set()

    for (const point of model.ratedPoints) {
      if (!seen.has(point.season)) {
        seen.add(point.season)
        anchors.push(point)
      }
    }

    return anchors
  }

  function syncScrollableViewportToPoint(point, shouldScroll) {
    const width = Math.max(bodyShell.clientWidth, 240)
    const visibleEpisodes = Math.max(1, Math.round(width / MOBILE_POINT_SPACING))
    viewport = clampViewport(
      {
        start: point.x - Math.floor(visibleEpisodes / 2),
        end: point.x - Math.floor(visibleEpisodes / 2) + visibleEpisodes - 1
      },
      model
    )

    if (!shouldScroll) {
      return
    }

    const contentWidth = getScrollableBodyWidth(width)
    const maxScrollLeft = Math.max(contentWidth - width, 0)
    const ratio = model.xMax > 1 ? (point.x - 1) / (model.xMax - 1) : 0
    suppressScrollSync = true
    bodyShell.scrollLeft = ratio * maxScrollLeft
    queueMicrotask(() => {
      suppressScrollSync = false
    })
  }

  function updateViewportFromScroll() {
    const width = Math.max(bodyShell.clientWidth, 240)
    const contentWidth = getScrollableBodyWidth(width)
    const maxScrollLeft = Math.max(contentWidth - width, 0)
    const ratio = maxScrollLeft > 0 ? bodyShell.scrollLeft / maxScrollLeft : 0
    const visibleEpisodes = Math.max(1, Math.round(width / MOBILE_POINT_SPACING))
    const maxStart = Math.max(1, model.xMax - visibleEpisodes + 1)
    const start = 1 + ratio * (maxStart - 1)
    viewport = clampViewport(
      {
        start,
        end: start + visibleEpisodes - 1
      },
      model
    )
  }

  function getScrollableBodyWidth(width) {
    return Math.max(width, (model.xMax - 1) * MOBILE_POINT_SPACING + 40)
  }

  function panViewport(deltaEpisodes) {
    if (!viewport || deltaEpisodes === 0) {
      return
    }

    const width = viewport.end - viewport.start
    viewport = clampViewport(
      {
        start: viewport.start + deltaEpisodes,
        end: viewport.start + deltaEpisodes + width
      },
      model
    )
    render()
  }

  function clearActivePoint() {
    hoverPointId = null
    selectedPointId = null
    updateDetail(null)
    render()
  }

  function renderDesktopChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight) {
    ensureViewport(chartWidth)
    const uiSettings = getUiSettings()

    const mainScales = createMainScales(model, viewport, {
      width: chartWidth,
      height: chartHeight
    })
    const sparklineScales = createSparklineScales(model, {
      width: chartWidth + axisWidth,
      height: sparklineHeight
    })

    shell.dataset.scrollable = 'false'
    bodyShell.style.overflowX = 'hidden'
    bodyShell.scrollLeft = 0

    axisSvg.attr('viewBox', `0 0 ${axisWidth} ${chartHeight}`).attr('width', axisWidth).attr('height', chartHeight)
    mainSvg.attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`).attr('width', chartWidth).attr('height', chartHeight)
    mainSvg.style('width', '100%')

    axisSvg.selectAll('*').remove()
    renderRangeFrame(axisSvg, mainScales, { width: axisWidth, height: chartHeight }, chartTheme)
    renderTrendlines(
      mainSvg,
      uiSettings.seasonTrendlines ? getVisibleSeasonTrendlines(model, viewport) : [],
      uiSettings.fullShowTrendline ? getMacroTrendline(model, viewport) : null,
      mainScales,
      chartTheme
    )
    renderSeasonLabels(
      mainSvg,
      getVisibleSeasonSpans(model, viewport),
      viewport,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme
    )
    renderCrosshair(mainSvg, getActivePoint(), mainScales, { width: chartWidth, height: chartHeight }, chartTheme)
    renderPoints(mainSvg, getVisiblePoints(model, viewport), mainScales, chartTheme, {
      activePointId: getActivePoint()?.id ?? null,
      totalSeasons: model.totalSeasons,
      onHover(point) {
        hoverPointId = point.id
        updateDetail(point)
        render()
      },
      onLeave() {
        hoverPointId = null
        render()
      },
      onSelect(point) {
        hoverPointId = null
        setSelectedPoint(point, 'pointer')
      }
    })

    renderSparkline(chartTheme, sparklineScales, chartWidth + axisWidth, sparklineHeight, (nextViewport) => {
      viewport = clampViewport(nextViewport, model)
      render()
    })
  }

  function renderScrollableMobileChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight) {
    const uiSettings = getUiSettings()
    const contentWidth = getScrollableBodyWidth(chartWidth)
    const fullScales = createFullSeriesScales(model, {
      width: contentWidth,
      height: chartHeight
    })
    updateViewportFromScroll()
    const sparklineScales = createSparklineScales(model, {
      width: chartWidth + axisWidth,
      height: sparklineHeight
    })

    shell.dataset.scrollable = 'true'
    bodyShell.style.overflowX = 'auto'

    axisSvg.attr('viewBox', `0 0 ${axisWidth} ${chartHeight}`).attr('width', axisWidth).attr('height', chartHeight)
    mainSvg.attr('viewBox', `0 0 ${contentWidth} ${chartHeight}`).attr('width', contentWidth).attr('height', chartHeight)
    mainSvg.style('width', `${contentWidth}px`)

    axisSvg.selectAll('*').remove()
    renderRangeFrame(axisSvg, fullScales, { width: axisWidth, height: chartHeight }, chartTheme)
    renderTrendlines(
      mainSvg,
      uiSettings.seasonTrendlines
        ? model.seasonTrendlines.map((trendline) => ({
            ...trendline,
            points: [
              { x: trendline.startX, y: trendline.regression.slope * trendline.startX + trendline.regression.intercept },
              { x: trendline.endX, y: trendline.regression.slope * trendline.endX + trendline.regression.intercept }
            ]
          }))
        : [],
      uiSettings.fullShowTrendline ? getMacroTrendline(model, { start: 1, end: model.xMax }) : null,
      fullScales,
      chartTheme
    )
    renderSeasonLabels(
      mainSvg,
      model.seasonSpans,
      { start: 1, end: model.xMax },
      fullScales,
      { width: contentWidth, height: chartHeight },
      chartTheme
    )
    renderCrosshair(mainSvg, getActivePoint(), fullScales, { width: contentWidth, height: chartHeight }, chartTheme)
    renderPoints(mainSvg, model.points, fullScales, chartTheme, {
      activePointId: getActivePoint()?.id ?? null,
      totalSeasons: model.totalSeasons,
      onHover(point) {
        hoverPointId = point.id
        updateDetail(point)
        render()
      },
      onLeave() {
        hoverPointId = null
        render()
      },
      onSelect(point) {
        hoverPointId = null
        setSelectedPoint(point, 'pointer')
      }
    })

    renderSparkline(chartTheme, sparklineScales, chartWidth + axisWidth, sparklineHeight, (nextViewport) => {
      viewport = clampViewport(nextViewport, model)
      const maxScrollLeft = Math.max(contentWidth - chartWidth, 0)
      const maxStart = Math.max(1, model.xMax - (viewport.end - viewport.start + 1) + 1)
      const ratio = maxStart > 1 ? (viewport.start - 1) / (maxStart - 1) : 0
      suppressScrollSync = true
      bodyShell.scrollLeft = ratio * maxScrollLeft
      queueMicrotask(() => {
        suppressScrollSync = false
      })
      render()
    })
  }

  function renderSparkline(chartTheme, sparklineScales, width, height, onViewportChange) {
    if (!sparkline) {
      sparkline = createSparkline(sparklineSvg, {
        model,
        viewport,
        theme: chartTheme,
        dimensions: { width, height },
        scales: sparklineScales,
        onViewportChange
      })
      return
    }

    sparkline.render({
      model,
      viewport,
      theme: chartTheme,
      dimensions: { width, height },
      scales: sparklineScales,
      onViewportChange
    })
  }

  function render() {
    const chartTheme = getChartTheme()
    const width = Math.max(container.clientWidth, 320)
    const axisWidth = isMobile() ? 48 : 56
    const chartWidth = Math.max(width - axisWidth - 16, 240)
    const chartHeight = isMobile() ? 260 : 410
    const sparklineHeight = isMobile() ? 30 : 40

    shell.style.setProperty('--axis-width', `${axisWidth}px`)
    shell.style.setProperty('--chart-height', `${chartHeight}px`)

    mainSvg.selectAll('*').remove()

    if (usesScrollableBody()) {
      renderScrollableMobileChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight)
    } else {
      renderDesktopChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight)
    }

    const activePoint = getActivePoint()
    if (activePoint) {
      const scale = usesScrollableBody()
        ? createFullSeriesScales(model, {
            width: getScrollableBodyWidth(chartWidth),
            height: chartHeight
          }).xScale
        : createMainScales(model, viewport, { width: chartWidth, height: chartHeight }).xScale
      shell.style.setProperty('--reading-pane-marker', `${scale(activePoint.x)}px`)
      updateDetail(activePoint)
    } else {
      updateDetail(null)
    }
  }

  bodyShell.addEventListener('scroll', () => {
    if (!usesScrollableBody() || suppressScrollSync) {
      return
    }

    updateViewportFromScroll()
    const chartTheme = getChartTheme()
    const axisWidth = isMobile() ? 48 : 56
    const chartWidth = Math.max(container.clientWidth - axisWidth - 16, 240)
    const sparklineHeight = isMobile() ? 30 : 40
    const sparklineScales = createSparklineScales(model, {
      width: chartWidth + axisWidth,
      height: sparklineHeight
    })

    sparkline?.render({
      model,
      viewport,
      theme: chartTheme,
      dimensions: { width: chartWidth + axisWidth, height: sparklineHeight },
      scales: sparklineScales,
      onViewportChange(nextViewport) {
        viewport = clampViewport(nextViewport, model)
        render()
      }
    })
  })

  bodyShell.addEventListener(
    'wheel',
    (event) => {
      if (usesScrollableBody() || event.ctrlKey) {
        return
      }

      const horizontalDelta = Math.abs(event.deltaX) > 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0
      if (!horizontalDelta) {
        return
      }

      const visibleEpisodes = Math.max((viewport?.end ?? 1) - (viewport?.start ?? 1), 1)
      const pixelsPerEpisode = Math.max(bodyShell.clientWidth / visibleEpisodes, 1)
      const deltaEpisodes = horizontalDelta / pixelsPerEpisode

      event.preventDefault()
      panViewport(deltaEpisodes)
    },
    { passive: false }
  )

  bodyShell.addEventListener('click', (event) => {
    if (event.target.closest('.episode-point')) {
      return
    }

    clearActivePoint()
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
    moveEpisode,
    moveSeason,
    jumpBoundary,
    getDebugState() {
      return {
        selectedPointId,
        hoverPointId,
        viewport,
        mobileScrollable: usesScrollableBody(),
        uiSettings: getUiSettings()
      }
    },
    destroy() {
      resizeObserver.disconnect()
      document.removeEventListener('graphtv:settings-change', settingsListener)
      sparkline?.destroy()
      container.innerHTML = ''
    }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
