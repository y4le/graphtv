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
import {
  renderCrosshair,
  renderPoints,
  renderRangeFrame,
  renderSeasonLabels,
  renderSourceSpreads,
  renderTrendlines
} from './marks.js'
import { createSidenote } from './sidenote.js'
import { createSparkline } from './sparkline.js'
import { getChartTheme, getUiSettings, updateUiSettings } from './theme.js'
import { getRatingSourceLabel } from '../data/stats.js'

const MOBILE_QUERY = '(max-width: 767px)'
const MOBILE_LANDSCAPE_QUERY = '(max-width: 767px) and (orientation: landscape)'
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const COARSE_POINTER_QUERY = '(pointer: coarse)'
const MOBILE_POINT_SPACING = 18
const DETAIL_LOAD_DELAY_MS = 250
const TREND_HOVER_DELAY_MS = 100
const MAX_DETAIL_ERRORS = 25
const TOUCH_DRAG_START_TOLERANCE_PX = 9
const MIN_VIEWPORT_SPAN = 4
const VIEWPORT_ANNOUNCEMENT_DELAY_MS = 120
const SELECTION_ANNOUNCEMENT_DELAY_MS = 120
const SUPPRESS_CLICK_DURATION_MS = 350
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2

export function createChart(container, seasons, options = {}) {
  container.innerHTML = ''
  container.classList.add('chart-root')
  const usesExternalDetailRoot = Boolean(options.detailRoot)

  const shell = document.createElement('div')
  shell.className = 'chart-shell'
  shell.innerHTML = `
    <p class="chart-source-status" aria-live="polite"></p>
    <p class="chart-viewport-status visually-hidden" aria-live="polite" aria-atomic="true"></p>
    <p class="chart-selection-status visually-hidden" aria-live="polite" aria-atomic="true"></p>
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
    ${
      usesExternalDetailRoot
        ? ''
        : `<div class="reading-pane-shell">
            <div class="reading-pane-axis-spacer" aria-hidden="true"></div>
            <div class="reading-pane" data-reading-pane></div>
          </div>`
    }
  `
  container.appendChild(shell)

  const sparklineSvg = shell.querySelector('.sparkline-chart')
  const axisSvg = select(shell.querySelector('.chart-axis'))
  const mainSvg = select(shell.querySelector('.ratings-chart'))
  const bodyShell = shell.querySelector('.chart-body-shell')
  const sourceStatus = shell.querySelector('.chart-source-status')
  const viewportStatus = shell.querySelector('.chart-viewport-status')
  const selectionStatus = shell.querySelector('.chart-selection-status')
  const readingPane = shell.querySelector('[data-reading-pane]')
  const mediaQuery = window.matchMedia(MOBILE_QUERY)
  const mobileLandscapeQuery = window.matchMedia(MOBILE_LANDSCAPE_QUERY)
  const finePointerQuery = window.matchMedia(FINE_POINTER_QUERY)
  const coarsePointerQuery = window.matchMedia(COARSE_POINTER_QUERY)

  let model = buildChartModel(seasons)
  let viewport = null
  let selectedPointId = null
  let hoverPointId = null
  let selectedTrendId = null
  let hoverTrendId = null
  let sparkline = null
  let suppressScrollSync = false
  let suppressScrollSyncFrame = null
  let viewportAnnouncementTimer = null
  let selectionAnnouncementTimer = null
  let trendHoverTimer = null
  let pendingTrendHoverId = null
  let detailLoadTimer = null
  let scheduledDetailPointId = null
  let destroyed = false
  const detailCache = new Map()
  const detailErrors = []
  const loadingDetailPointIds = new Set()

  function setScrollLeftSuppressed(scrollLeft) {
    suppressScrollSync = true
    bodyShell.scrollLeft = scrollLeft
    if (suppressScrollSyncFrame) {
      cancelAnimationFrame(suppressScrollSyncFrame)
    }
    suppressScrollSyncFrame = requestAnimationFrame(() => {
      suppressScrollSyncFrame = requestAnimationFrame(() => {
        suppressScrollSyncFrame = null
        suppressScrollSync = false
      })
    })
  }

  const sidenote = createSidenote({
    desktopRoot: options.detailRoot ?? readingPane,
    mobileRoot: options.detailRoot ?? readingPane,
    onSelectPoint(pointId) {
      setSelectedPoint(getPointById(pointId), 'pointer')
    }
  })

  function isMobile() {
    return mediaQuery.matches
  }

  function usesScrollableBody() {
    return false
  }

  function isMobileLandscape() {
    return mobileLandscapeQuery.matches
  }

  function getChartDimensions() {
    if (!isMobile()) {
      return {
        chartHeight: 410,
        sparklineHeight: 40
      }
    }

    if (!isMobileLandscape()) {
      return {
        chartHeight: 260,
        sparklineHeight: 30
      }
    }

    const chartTop = container.getBoundingClientRect().top
    const availableHeight = Math.max(window.innerHeight - chartTop - 12, 180)
    const sparklineHeight = clamp(Math.round(availableHeight * 0.11), 24, 34)
    const chartHeight = clamp(availableHeight - sparklineHeight - 18, 140, 220)

    return {
      chartHeight,
      sparklineHeight
    }
  }

  function getPointById(id) {
    return id ? (model.points.find((point) => point.id === id) ?? null) : null
  }

  function getRatedPoints() {
    return model.ratedPoints
  }

  function getActivePoint() {
    if (hoverTrendId) {
      return null
    }

    return (
      getPointById(hoverPointId) ||
      (selectedTrendId ? null : getPointById(selectedPointId))
    )
  }

  function getActiveTrendId() {
    if (hoverPointId) {
      return null
    }

    return hoverTrendId || (selectedPointId ? null : selectedTrendId)
  }

  function getTrendSummary(id) {
    return id ? (model.trendSummaries[id] ?? null) : null
  }

  function isTrendEnabled(id, settings = getUiSettings()) {
    return id === 'series'
      ? settings.fullShowTrendline
      : settings.seasonTrendlines
  }

  function cancelTrendHover() {
    if (trendHoverTimer) {
      clearTimeout(trendHoverTimer)
      trendHoverTimer = null
    }
    pendingTrendHoverId = null
  }

  function clearTrendHover({ rerender = false } = {}) {
    cancelTrendHover()
    if (!hoverTrendId) {
      return
    }

    hoverTrendId = null
    if (rerender) {
      render()
    }
  }

  function previewTrend(trendline) {
    if (!finePointerQuery.matches || gesture || flingFrame) {
      clearTrendHover({ rerender: true })
      return
    }

    const nextId = trendline?.id ?? null
    if (!nextId) {
      clearTrendHover({ rerender: true })
      return
    }
    if (nextId === hoverTrendId || nextId === pendingTrendHoverId) {
      return
    }

    cancelTrendHover()
    pendingTrendHoverId = nextId
    trendHoverTimer = setTimeout(() => {
      trendHoverTimer = null
      pendingTrendHoverId = null
      if (destroyed || gesture || flingFrame || !getTrendSummary(nextId)) {
        return
      }

      hoverPointId = null
      hoverTrendId = nextId
      cancelScheduledDetailLoad()
      render()
    }, TREND_HOVER_DELAY_MS)
  }

  function mergeEpisodeDetails(point, detailedPoint) {
    const detailedRatings = new Map(
      detailedPoint.ratings.map((rating) => [rating.source, rating])
    )
    const currentSources = new Set(point.ratings.map((rating) => rating.source))
    const addedRatings = detailedPoint.ratings.filter(
      (rating) => !currentSources.has(rating.source)
    )

    return {
      ...point,
      ratings: [
        ...point.ratings.map((rating) => {
          const detailedRating = detailedRatings.get(rating.source)
          return typeof detailedRating?.votes === 'number' ||
            detailedRating?.votesStatus === 'unavailable'
            ? {
                ...rating,
                votes: detailedRating.votes,
                votesStatus: detailedRating.votesStatus
              }
            : rating
        }),
        ...addedRatings
      ]
    }
  }

  function scheduleDetailLoad(point) {
    cancelScheduledDetailLoad()

    if (
      !options.loadEpisodeDetails ||
      detailCache.has(point.id) ||
      loadingDetailPointIds.has(point.id)
    ) {
      return
    }

    scheduledDetailPointId = point.id
    loadingDetailPointIds.add(point.id)
    detailLoadTimer = setTimeout(async () => {
      detailLoadTimer = null
      scheduledDetailPointId = null

      try {
        const enrichedPoint = await options.loadEpisodeDetails(point)
        if (destroyed) {
          return
        }

        const currentPoint = getPointById(point.id)
        const mergedPoint = currentPoint
          ? mergeEpisodeDetails(currentPoint, enrichedPoint)
          : enrichedPoint
        detailCache.set(point.id, mergedPoint)
      } catch (error) {
        if (error?.name !== 'AbortError') {
          detailErrors.push({ episodeId: point.id, reason: error.message })
          if (detailErrors.length > MAX_DETAIL_ERRORS) {
            detailErrors.shift()
          }
        }
      } finally {
        loadingDetailPointIds.delete(point.id)
        if (!destroyed && getActivePoint()?.id === point.id) {
          const currentPoint = getPointById(point.id)
          sidenote.renderPoint(detailCache.get(point.id) ?? currentPoint)
        }
      }
    }, DETAIL_LOAD_DELAY_MS)
  }

  function cancelScheduledDetailLoad() {
    if (!detailLoadTimer) {
      return
    }

    clearTimeout(detailLoadTimer)
    detailLoadTimer = null
    loadingDetailPointIds.delete(scheduledDetailPointId)
    scheduledDetailPointId = null
  }

  function leaveHoveredPoint() {
    hoverPointId = null
    cancelScheduledDetailLoad()
    render()
  }

  function updateDetail(point, { load = false } = {}) {
    if (!point) {
      cancelScheduledDetailLoad()
      sidenote.renderPlaceholder()
      shell.style.removeProperty('--reading-pane-marker')
      return
    }

    if (load) {
      scheduleDetailLoad(point)
    }
    sidenote.renderPoint(detailCache.get(point.id) ?? point, {
      loadingDetails: loadingDetailPointIds.has(point.id)
    })
  }

  function updateActiveDetail() {
    const activePoint = getActivePoint()
    if (activePoint) {
      shell.dataset.detailKind = 'point'
      updateDetail(activePoint)
      return
    }

    const activeTrend = getTrendSummary(getActiveTrendId())
    if (activeTrend) {
      cancelScheduledDetailLoad()
      shell.dataset.detailKind = 'trend'
      shell.style.removeProperty('--reading-pane-marker')
      sidenote.renderTrendSummary(activeTrend)
      return
    }

    shell.dataset.detailKind = 'none'
    updateDetail(null)
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

    cancelTrendHover()
    hoverTrendId = null
    selectedTrendId = null
    selectedPointId = point.id
    updateDetail(point, { load: true })

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

  function setSelectedTrend(id) {
    const summary = getTrendSummary(id)
    if (!summary || !isTrendEnabled(id)) {
      return
    }

    const isTogglingOff = selectedTrendId === id
    cancelTrendHover()
    hoverTrendId = null
    hoverPointId = null
    selectedPointId = null
    selectedTrendId = isTogglingOff ? null : id
    cancelScheduledDetailLoad()
    announceSelection(isTogglingOff ? null : summary)
    render()
  }

  function announceSelection(summary) {
    if (selectionAnnouncementTimer) {
      clearTimeout(selectionAnnouncementTimer)
    }

    selectionAnnouncementTimer = setTimeout(() => {
      selectionAnnouncementTimer = null
      if (!summary) {
        selectionStatus.textContent = 'Chart selection cleared.'
        return
      }

      const trend =
        summary.direction === 'up'
          ? `trending up ${Math.abs(summary.delta).toFixed(1)}`
          : summary.direction === 'down'
            ? `trending down ${Math.abs(summary.delta).toFixed(1)}`
            : 'no clear trend'
      selectionStatus.textContent = `${summary.label} trend selected. Mean ${summary.mean.toFixed(1)}, ${trend}, across ${summary.n} rated ${summary.n === 1 ? 'episode' : 'episodes'}.`
    }, SELECTION_ANNOUNCEMENT_DELAY_MS)
  }

  function moveEpisode(delta) {
    const currentPoint = ensureNavigablePoint()
    if (!currentPoint) {
      return
    }
    const points = getRatedPoints()
    const currentIndex = points.findIndex(
      (point) => point.id === currentPoint.id
    )
    const nextIndex = clamp(currentIndex + delta, 0, points.length - 1)
    setSelectedPoint(points[nextIndex])
  }

  function moveSeason(delta) {
    const activePoint = ensureNavigablePoint()
    if (!activePoint) {
      return
    }

    const seasonAnchors = getSeasonAnchors()
    const currentSeasonIndex = seasonAnchors.findIndex(
      (point) => point.season === activePoint.season
    )
    const nextSeasonIndex = clamp(
      currentSeasonIndex + delta,
      0,
      seasonAnchors.length - 1
    )
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
    const visibleEpisodes = Math.max(
      1,
      Math.round(width / MOBILE_POINT_SPACING)
    )
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
    setScrollLeftSuppressed(ratio * maxScrollLeft)
  }

  function updateViewportFromScroll() {
    const width = Math.max(bodyShell.clientWidth, 240)
    const contentWidth = getScrollableBodyWidth(width)
    const maxScrollLeft = Math.max(contentWidth - width, 0)
    const ratio = maxScrollLeft > 0 ? bodyShell.scrollLeft / maxScrollLeft : 0
    const currentWidth = viewport
      ? viewport.end - viewport.start + 1
      : Math.max(1, Math.round(width / MOBILE_POINT_SPACING))
    const maxStart = Math.max(1, model.xMax - currentWidth + 1)
    const start = 1 + ratio * (maxStart - 1)
    viewport = clampViewport(
      {
        start,
        end: start + currentWidth - 1
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

  function zoomViewport(scale, anchorRatio) {
    if (!viewport || !Number.isFinite(scale) || scale <= 0) {
      return
    }

    const span = viewport.end - viewport.start
    const maxSpan = Math.max(model.xMax - 1, 0)
    const minSpan = Math.min(MIN_VIEWPORT_SPAN, maxSpan)
    const nextSpan = clamp(span * scale, minSpan, maxSpan)
    const ratio = clamp(anchorRatio, 0, 1)
    const anchor = viewport.start + span * ratio

    viewport = clampViewport(
      {
        start: anchor - nextSpan * ratio,
        end: anchor + nextSpan * (1 - ratio)
      },
      model
    )
    render()
  }

  function getViewportCenter() {
    const fallbackViewport = createDefaultViewport(
      model,
      getCurrentChartWidth(),
      isMobile()
    )
    const currentViewport = viewport ?? fallbackViewport
    return (
      currentViewport.start + (currentViewport.end - currentViewport.start) / 2
    )
  }

  function getKeyboardViewportAnchor() {
    const selectedPoint = getPointById(selectedPointId)
    if (
      selectedPoint &&
      viewport &&
      selectedPoint.x >= viewport.start &&
      selectedPoint.x <= viewport.end
    ) {
      return selectedPoint.x
    }

    return getViewportCenter()
  }

  function getCurrentChartWidth() {
    const width = Math.max(container.clientWidth, 320)
    const axisWidth = isMobile() ? 40 : 56
    return Math.max(width - axisWidth - 16, 240)
  }

  function fitSeries() {
    viewport = clampViewport({ start: 1, end: model.xMax }, model)
    render()
    announceViewport()
  }

  function resetZoom() {
    resetViewportWidth(
      getCurrentChartWidth(),
      usesScrollableBody(),
      getKeyboardViewportAnchor()
    )
    announceViewport()
  }

  function zoomBy(scale) {
    if (!viewport) {
      return
    }

    const span = viewport.end - viewport.start
    const anchorRatio =
      span > 0
        ? clamp((getKeyboardViewportAnchor() - viewport.start) / span, 0, 1)
        : 0.5
    zoomViewport(scale, anchorRatio)
    announceViewport()
  }

  function announceViewport() {
    if (viewportAnnouncementTimer) {
      clearTimeout(viewportAnnouncementTimer)
    }

    viewportAnnouncementTimer = setTimeout(() => {
      viewportAnnouncementTimer = null
      viewportStatus.textContent = formatViewportAnnouncement(
        viewport,
        model.xMax
      )
    }, VIEWPORT_ANNOUNCEMENT_DELAY_MS)
  }

  function clearActiveSelection({ announce = false } = {}) {
    cancelTrendHover()
    hoverPointId = null
    selectedPointId = null
    hoverTrendId = null
    selectedTrendId = null
    if (announce) {
      announceSelection(null)
    }
    render()
  }

  function toggleSeriesTrend() {
    if (selectedTrendId === 'series') {
      setSelectedTrend('series')
      return true
    }
    if (!getMacroTrendline(model, viewport)) {
      return false
    }
    if (!getUiSettings().fullShowTrendline) {
      updateUiSettings({ fullShowTrendline: true })
    }
    setSelectedTrend('series')
    return true
  }

  function toggleSeasonTrend() {
    const activePoint = getActivePoint()
    const selectedTrend = getTrendSummary(selectedTrendId)
    const viewportCenter = viewport.start + (viewport.end - viewport.start) / 2
    const visibleTrends = getVisibleSeasonTrendlines(model, viewport)
    const nearestVisibleTrend = visibleTrends.sort(
      (left, right) =>
        Math.abs(
          (left.visibleStartX + left.visibleEndX) / 2 - viewportCenter
        ) -
        Math.abs(
          (right.visibleStartX + right.visibleEndX) / 2 - viewportCenter
        )
    )[0]
    const seasonNumber =
      selectedTrend?.kind === 'season'
        ? selectedTrend.seasonNumber
        : visibleTrends.some(
              (trendline) => trendline.seasonNumber === activePoint?.season
            )
          ? activePoint.season
          : nearestVisibleTrend?.seasonNumber

    if (seasonNumber == null || !getTrendSummary(`season:${seasonNumber}`)) {
      return false
    }
    if (!getUiSettings().seasonTrendlines) {
      updateUiSettings({ seasonTrendlines: true })
    }
    setSelectedTrend(`season:${seasonNumber}`)
    return true
  }

  function updateSeasons(nextSeasons) {
    if (destroyed) {
      return
    }

    model = buildChartModel(nextSeasons)
    if (!getPointById(selectedPointId)) {
      selectedPointId = null
    }
    if (!getPointById(hoverPointId)) {
      hoverPointId = null
    }
    if (!getTrendSummary(selectedTrendId)) {
      selectedTrendId = null
    }
    if (!getTrendSummary(hoverTrendId)) {
      hoverTrendId = null
    }

    for (const [episodeId, cachedPoint] of detailCache) {
      const point = getPointById(episodeId)
      if (!point) {
        detailCache.delete(episodeId)
        continue
      }

      detailCache.set(episodeId, mergeEpisodeDetails(point, cachedPoint))
    }

    if (viewport) {
      viewport = clampViewport(viewport, model)
    }
    render()
  }

  function resetViewportWidth(
    chartWidth,
    isScrollable,
    center = getViewportCenter()
  ) {
    const defaultViewport = createDefaultViewport(model, chartWidth, isMobile())
    const defaultWidth = defaultViewport.end - defaultViewport.start + 1
    const centeredStart = center - (defaultWidth - 1) / 2

    viewport = clampViewport(
      {
        start: centeredStart,
        end: centeredStart + defaultWidth - 1
      },
      model
    )

    if (isScrollable) {
      const contentWidth = getScrollableBodyWidth(chartWidth)
      const maxScrollLeft = Math.max(contentWidth - chartWidth, 0)
      const maxStart = Math.max(1, model.xMax - defaultWidth + 1)
      const ratio = maxStart > 1 ? (viewport.start - 1) / (maxStart - 1) : 0
      setScrollLeftSuppressed(ratio * maxScrollLeft)
    }

    render()
  }

  function getTrendInteractions() {
    const activeTrendId = getActiveTrendId()
    return {
      activeTrendId,
      summary: getTrendSummary(activeTrendId),
      hoverEnabled: finePointerQuery.matches,
      hitTolerance: coarsePointerQuery.matches ? 14 : 7,
      onHover: previewTrend,
      onSelect(trendline) {
        if (trendline) {
          setSelectedTrend(trendline.id)
        } else {
          clearActiveSelection()
        }
      },
      shouldSuppressClick
    }
  }

  function getPointInteractions() {
    return {
      activePointId: getActivePoint()?.id ?? null,
      hoverEnabled: finePointerQuery.matches,
      totalSeasons: model.totalSeasons,
      onHover(point) {
        cancelTrendHover()
        hoverTrendId = null
        hoverPointId = point.id
        updateDetail(point, { load: true })
        render()
      },
      onLeave: leaveHoveredPoint,
      onSelect(point) {
        hoverPointId = null
        setSelectedPoint(point, 'pointer')
      },
      shouldSuppressClick
    }
  }

  function renderDesktopChart(
    chartTheme,
    axisWidth,
    chartWidth,
    chartHeight,
    sparklineHeight
  ) {
    ensureViewport(chartWidth)
    const uiSettings = getUiSettings()

    const scaleOptions = {
      absoluteYAxis: uiSettings.absoluteYAxis,
      showSourceSpread: uiSettings.showSourceSpread
    }
    const mainScales = createMainScales(
      model,
      viewport,
      {
        width: chartWidth,
        height: chartHeight
      },
      scaleOptions
    )
    const sparklineScales = createSparklineScales(
      model,
      {
        width: chartWidth,
        height: sparklineHeight
      },
      scaleOptions
    )

    shell.dataset.scrollable = 'false'
    bodyShell.style.overflowX = 'hidden'
    bodyShell.style.touchAction = isMobile() ? 'none' : ''
    bodyShell.scrollLeft = 0

    axisSvg
      .attr('viewBox', `0 0 ${axisWidth} ${chartHeight}`)
      .attr('width', axisWidth)
      .attr('height', chartHeight)
    mainSvg
      .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`)
      .attr('width', chartWidth)
      .attr('height', chartHeight)
    mainSvg.style('width', '100%')

    axisSvg.selectAll('*').remove()
    renderRangeFrame(
      axisSvg,
      mainScales,
      { width: axisWidth, height: chartHeight },
      chartTheme
    )
    renderTrendlines(
      mainSvg,
      uiSettings.seasonTrendlines
        ? getVisibleSeasonTrendlines(model, viewport)
        : [],
      uiSettings.fullShowTrendline ? getMacroTrendline(model, viewport) : null,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      getTrendInteractions()
    )
    renderSourceSpreads(
      mainSvg,
      getVisiblePoints(model, viewport),
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      {
        visible: uiSettings.showSourceSpread,
        activePointId: getActivePoint()?.id ?? null
      }
    )
    renderSeasonLabels(
      mainSvg,
      getVisibleSeasonSpans(model, viewport),
      viewport,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme
    )
    renderCrosshair(
      mainSvg,
      getActivePoint(),
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      uiSettings.showSourceSpread
    )
    renderPoints(
      mainSvg,
      getVisiblePoints(model, viewport),
      mainScales,
      chartTheme,
      getPointInteractions()
    )

    renderSparkline(
      chartTheme,
      sparklineScales,
      chartWidth,
      sparklineHeight,
      (nextViewport) => {
        viewport = clampViewport(nextViewport, model)
        render()
      },
      () => resetViewportWidth(chartWidth, false)
    )
  }

  function renderScrollableMobileChart(
    chartTheme,
    axisWidth,
    chartWidth,
    chartHeight,
    sparklineHeight
  ) {
    const uiSettings = getUiSettings()
    const scaleOptions = {
      absoluteYAxis: uiSettings.absoluteYAxis,
      showSourceSpread: uiSettings.showSourceSpread
    }
    const contentWidth = getScrollableBodyWidth(chartWidth)
    const fullScales = createFullSeriesScales(
      model,
      {
        width: contentWidth,
        height: chartHeight
      },
      scaleOptions
    )
    updateViewportFromScroll()
    const sparklineScales = createSparklineScales(
      model,
      {
        width: chartWidth,
        height: sparklineHeight
      },
      scaleOptions
    )

    shell.dataset.scrollable = 'true'
    bodyShell.style.overflowX = 'auto'

    axisSvg
      .attr('viewBox', `0 0 ${axisWidth} ${chartHeight}`)
      .attr('width', axisWidth)
      .attr('height', chartHeight)
    mainSvg
      .attr('viewBox', `0 0 ${contentWidth} ${chartHeight}`)
      .attr('width', contentWidth)
      .attr('height', chartHeight)
    mainSvg.style('width', `${contentWidth}px`)

    axisSvg.selectAll('*').remove()
    renderRangeFrame(
      axisSvg,
      fullScales,
      { width: axisWidth, height: chartHeight },
      chartTheme
    )
    renderTrendlines(
      mainSvg,
      uiSettings.seasonTrendlines
        ? model.seasonTrendlines.map((trendline) => ({
            ...trendline,
            visibleStartX: trendline.startX,
            visibleEndX: trendline.endX,
            points: [
              {
                x: trendline.startX,
                y:
                  trendline.regression.slope * trendline.startX +
                  trendline.regression.intercept
              },
              {
                x: trendline.endX,
                y:
                  trendline.regression.slope * trendline.endX +
                  trendline.regression.intercept
              }
            ]
          }))
        : [],
      uiSettings.fullShowTrendline
        ? getMacroTrendline(model, { start: 1, end: model.xMax })
        : null,
      fullScales,
      { width: contentWidth, height: chartHeight },
      chartTheme,
      getTrendInteractions()
    )
    renderSourceSpreads(
      mainSvg,
      model.points,
      fullScales,
      { width: contentWidth, height: chartHeight },
      chartTheme,
      {
        visible: uiSettings.showSourceSpread,
        activePointId: getActivePoint()?.id ?? null
      }
    )
    renderSeasonLabels(
      mainSvg,
      model.seasonSpans,
      { start: 1, end: model.xMax },
      fullScales,
      { width: contentWidth, height: chartHeight },
      chartTheme
    )
    renderCrosshair(
      mainSvg,
      getActivePoint(),
      fullScales,
      { width: contentWidth, height: chartHeight },
      chartTheme,
      uiSettings.showSourceSpread
    )
    renderPoints(
      mainSvg,
      model.points,
      fullScales,
      chartTheme,
      getPointInteractions()
    )

    renderSparkline(
      chartTheme,
      sparklineScales,
      chartWidth,
      sparklineHeight,
      (nextViewport) => {
        viewport = clampViewport(nextViewport, model)
        const maxScrollLeft = Math.max(contentWidth - chartWidth, 0)
        const maxStart = Math.max(
          1,
          model.xMax - (viewport.end - viewport.start + 1) + 1
        )
        const ratio = maxStart > 1 ? (viewport.start - 1) / (maxStart - 1) : 0
        setScrollLeftSuppressed(ratio * maxScrollLeft)
        render()
      },
      () => resetViewportWidth(chartWidth, true)
    )
  }

  function renderSparkline(
    chartTheme,
    sparklineScales,
    width,
    height,
    onViewportChange,
    onViewportReset
  ) {
    if (!sparkline) {
      sparkline = createSparkline(sparklineSvg, {
        model,
        viewport,
        theme: chartTheme,
        dimensions: { width, height },
        scales: sparklineScales,
        onViewportChange,
        onViewportReset
      })
      return
    }

    sparkline.render({
      model,
      viewport,
      theme: chartTheme,
      dimensions: { width, height },
      scales: sparklineScales,
      onViewportChange,
      onViewportReset
    })
  }

  function render() {
    const chartTheme = getChartTheme()
    const width = Math.max(container.clientWidth, 320)
    const axisWidth = isMobile() ? 40 : 56
    const chartWidth = Math.max(width - axisWidth - 16, 240)
    const { chartHeight, sparklineHeight } = getChartDimensions()

    shell.style.setProperty('--axis-width', `${axisWidth}px`)
    shell.style.setProperty('--chart-height', `${chartHeight}px`)
    renderSourceStatus(sourceStatus, model, getUiSettings())

    if (usesScrollableBody()) {
      renderScrollableMobileChart(
        chartTheme,
        axisWidth,
        chartWidth,
        chartHeight,
        sparklineHeight
      )
    } else {
      renderDesktopChart(
        chartTheme,
        axisWidth,
        chartWidth,
        chartHeight,
        sparklineHeight
      )
    }

    const activePoint = getActivePoint()
    if (activePoint) {
      const scale = usesScrollableBody()
        ? createFullSeriesScales(model, {
            width: getScrollableBodyWidth(chartWidth),
            height: chartHeight
          }).xScale
        : createMainScales(model, viewport, {
            width: chartWidth,
            height: chartHeight
          }).xScale
      shell.style.setProperty(
        '--reading-pane-marker',
        `${scale(activePoint.x)}px`
      )
    }
    updateActiveDetail()
  }

  bodyShell.addEventListener('scroll', () => {
    if (!usesScrollableBody() || suppressScrollSync) {
      return
    }

    updateViewportFromScroll()
    const chartTheme = getChartTheme()
    const axisWidth = isMobile() ? 40 : 56
    const chartWidth = Math.max(container.clientWidth - axisWidth - 16, 240)
    const { sparklineHeight } = getChartDimensions()
    const sparklineScales = createSparklineScales(
      model,
      {
        width: chartWidth,
        height: sparklineHeight
      },
      {
        absoluteYAxis: getUiSettings().absoluteYAxis,
        showSourceSpread: getUiSettings().showSourceSpread
      }
    )

    sparkline?.render({
      model,
      viewport,
      theme: chartTheme,
      dimensions: { width: chartWidth, height: sparklineHeight },
      scales: sparklineScales,
      onViewportChange(nextViewport) {
        viewport = clampViewport(nextViewport, model)
        render()
      }
    })
  })

  function handleTrackpadPinch(event, surface) {
    if (!event.ctrlKey) {
      return false
    }

    event.preventDefault()
    if (!viewport || event.deltaY === 0) {
      return true
    }

    const surfaceRatio = getEventXRatio(event, surface)
    const anchorRatio =
      surface === sparklineSvg
        ? getSparklineViewportRatio(surfaceRatio)
        : surfaceRatio
    zoomViewport(getWheelZoomScale(event), anchorRatio)
    return true
  }

  function getSparklineViewportRatio(surfaceRatio) {
    const span = viewport.end - viewport.start
    if (span <= 0 || model.xMax <= 1) {
      return 0.5
    }

    const episodeX = 1 + surfaceRatio * (model.xMax - 1)
    return clamp((episodeX - viewport.start) / span, 0, 1)
  }

  function handleBodyWheel(event) {
    if (handleTrackpadPinch(event, bodyShell) || usesScrollableBody()) {
      return
    }

    const horizontalDelta =
      Math.abs(event.deltaX) > 0
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0
    if (!horizontalDelta) {
      return
    }

    const visibleEpisodes = Math.max(
      (viewport?.end ?? 1) - (viewport?.start ?? 1),
      1
    )
    const pixelsPerEpisode = Math.max(
      bodyShell.clientWidth / visibleEpisodes,
      1
    )
    const deltaEpisodes = horizontalDelta / pixelsPerEpisode

    event.preventDefault()
    panViewport(deltaEpisodes)
  }

  function handleSparklineWheel(event) {
    handleTrackpadPinch(event, sparklineSvg)
  }

  bodyShell.addEventListener('wheel', handleBodyWheel, { passive: false })
  sparklineSvg.addEventListener('wheel', handleSparklineWheel, {
    passive: false
  })

  let gesture = null
  let suppressClickUntil = 0
  let flingFrame = null
  const FLING_FRICTION = 0.95
  const FLING_MIN_VELOCITY = 0.3

  function stopFling() {
    if (flingFrame) {
      cancelAnimationFrame(flingFrame)
      flingFrame = null
    }
  }

  function shouldSuppressClick() {
    if (performance.now() >= suppressClickUntil) {
      suppressClickUntil = 0
      return false
    }

    suppressClickUntil = 0
    return true
  }

  function startFling(velocityPxPerMs) {
    stopFling()
    const chartWidth = Math.max(bodyShell.clientWidth, 240)
    const viewportWidth = viewport.end - viewport.start
    const pixelsPerEpisode = chartWidth / viewportWidth
    let velocity = (-velocityPxPerMs * 16) / pixelsPerEpisode

    function step() {
      velocity *= FLING_FRICTION
      if (Math.abs(velocity) < FLING_MIN_VELOCITY / pixelsPerEpisode) {
        flingFrame = null
        return
      }
      const prev = viewport
      viewport = clampViewport(
        {
          start: viewport.start + velocity,
          end: viewport.end + velocity
        },
        model
      )
      if (viewport.start === prev.start && viewport.end === prev.end) {
        flingFrame = null
        return
      }
      render()
      flingFrame = requestAnimationFrame(step)
    }

    flingFrame = requestAnimationFrame(step)
  }

  bodyShell.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || !isMobile() || !viewport) {
      return
    }

    if (!gesture) {
      const stoppedFling = Boolean(flingFrame)
      stopFling()
      suppressClickUntil = stoppedFling
        ? performance.now() + SUPPRESS_CLICK_DURATION_MS
        : 0
      clearTrendHover({ rerender: true })
      gesture = {
        type: 'pending',
        pointers: new Map([[event.pointerId, event.clientX]]),
        startX: event.clientX,
        startViewport: { ...viewport },
        prevX: event.clientX,
        prevTime: performance.now(),
        velocity: 0
      }
      return
    }

    gesture.pointers.set(event.pointerId, event.clientX)
    if (gesture.pointers.size >= 2) {
      const xs = Array.from(gesture.pointers.values())
      for (const pointerId of gesture.pointers.keys()) {
        bodyShell.setPointerCapture?.(pointerId)
      }
      gesture = {
        type: 'pinch',
        pointers: gesture.pointers,
        initialSpan: Math.max(Math.abs(xs[1] - xs[0]), 1),
        startViewport: { ...viewport }
      }
    }
  })

  bodyShell.addEventListener('pointermove', (event) => {
    if (
      !gesture ||
      event.pointerType !== 'touch' ||
      !gesture.pointers.has(event.pointerId)
    ) {
      return
    }

    gesture.pointers.set(event.pointerId, event.clientX)

    if (gesture.type === 'pinch') {
      event.preventDefault()
      const xs = Array.from(gesture.pointers.values())
      const currentSpan = Math.abs(xs[1] - xs[0])
      const scale = gesture.initialSpan / Math.max(currentSpan, 1)
      const startWidth =
        gesture.startViewport.end - gesture.startViewport.start + 1
      const startCenter = gesture.startViewport.start + (startWidth - 1) / 2
      const newWidth = Math.max(2, Math.round(startWidth * scale))

      viewport = clampViewport(
        {
          start: startCenter - (newWidth - 1) / 2,
          end: startCenter + (newWidth - 1) / 2
        },
        model
      )
      render()
      return
    }

    const now = performance.now()
    const dt = now - gesture.prevTime
    if (dt > 0) {
      const instantV = (event.clientX - gesture.prevX) / dt
      gesture.velocity = gesture.velocity * 0.4 + instantV * 0.6
    }
    gesture.prevX = event.clientX
    gesture.prevTime = now

    const deltaX = event.clientX - gesture.startX
    if (
      gesture.type === 'pending' &&
      Math.abs(deltaX) < TOUCH_DRAG_START_TOLERANCE_PX
    ) {
      return
    }

    event.preventDefault()
    if (gesture.type === 'pending') {
      bodyShell.setPointerCapture?.(event.pointerId)
    }
    gesture.type = 'pan'
    const chartWidth = Math.max(bodyShell.clientWidth, 240)
    const viewportWidth =
      gesture.startViewport.end - gesture.startViewport.start
    const pixelsPerEpisode = chartWidth / viewportWidth
    const deltaEpisodes = -deltaX / pixelsPerEpisode

    viewport = clampViewport(
      {
        start: gesture.startViewport.start + deltaEpisodes,
        end: gesture.startViewport.end + deltaEpisodes
      },
      model
    )
    render()
  })

  function endGesture(event) {
    if (!gesture || !gesture.pointers.has(event.pointerId)) {
      return
    }

    const wasPan = gesture.type === 'pan'
    const velocity = gesture.velocity
    if (bodyShell.hasPointerCapture?.(event.pointerId)) {
      bodyShell.releasePointerCapture(event.pointerId)
    }

    gesture.pointers.delete(event.pointerId)

    if (gesture.pointers.size === 0) {
      if (gesture.type !== 'pending') {
        suppressClickUntil =
          performance.now() + SUPPRESS_CLICK_DURATION_MS
      }
      gesture = null

      if (wasPan && Math.abs(velocity) > 0.15) {
        startFling(velocity)
      }
      return
    }

    if (gesture.type === 'pinch' && gesture.pointers.size === 1) {
      const [, x] = gesture.pointers.entries().next().value
      gesture = {
        type: 'pending',
        pointers: gesture.pointers,
        startX: x,
        startViewport: { ...viewport },
        prevX: x,
        prevTime: performance.now(),
        velocity: 0
      }
      suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
    }
  }

  bodyShell.addEventListener('pointerup', endGesture)
  bodyShell.addEventListener('pointercancel', endGesture)

  bodyShell.addEventListener('click', (event) => {
    if (shouldSuppressClick()) {
      return
    }

    if (event.target.closest('.episode-point, .episode-point-hit')) {
      return
    }

    clearActiveSelection()
  })

  const resizeObserver = new ResizeObserver(() => {
    render()
  })
  resizeObserver.observe(container)

  const settingsListener = () => {
    if (selectedTrendId && !isTrendEnabled(selectedTrendId)) {
      selectedTrendId = null
    }
    if (hoverTrendId && !isTrendEnabled(hoverTrendId)) {
      hoverTrendId = null
    }
    render()
  }
  document.addEventListener('graphtv:settings-change', settingsListener)

  render()

  return {
    moveEpisode,
    moveSeason,
    jumpBoundary,
    fitSeries,
    resetZoom,
    zoomBy,
    toggleSeriesTrend,
    toggleSeasonTrend,
    clearSelection() {
      if (!selectedPointId && !selectedTrendId) {
        return false
      }
      clearActiveSelection({ announce: true })
      return true
    },
    updateSeasons,
    getDebugState() {
      return {
        selectedPointId,
        hoverPointId,
        selectedTrendId,
        hoverTrendId,
        viewport,
        mobileScrollable: usesScrollableBody(),
        ratings: {
          primarySource: model.primaryRatingSource,
          minimumCoverage: model.minimumPrimaryCoverage,
          coverage: model.ratingSourceCoverage
        },
        episodeDetails: {
          loaded: detailCache.size,
          errors: detailErrors,
          loader: options.loadEpisodeDetails?.getDebugState?.() ?? null
        },
        uiSettings: getUiSettings()
      }
    },
    destroy() {
      destroyed = true
      cancelScheduledDetailLoad()
      cancelTrendHover()
      if (viewportAnnouncementTimer) {
        clearTimeout(viewportAnnouncementTimer)
      }
      if (selectionAnnouncementTimer) {
        clearTimeout(selectionAnnouncementTimer)
      }
      loadingDetailPointIds.clear()
      resizeObserver.disconnect()
      document.removeEventListener('graphtv:settings-change', settingsListener)
      bodyShell.removeEventListener('wheel', handleBodyWheel)
      sparklineSvg.removeEventListener('wheel', handleSparklineWheel)
      sparkline?.destroy()
      options.loadEpisodeDetails?.destroy?.()
      container.innerHTML = ''
    }
  }
}

function formatViewportAnnouncement(viewport, episodeCount) {
  if (viewport.start <= 1 && viewport.end >= episodeCount) {
    return `Whole series, ${episodeCount} ${episodeCount === 1 ? 'episode' : 'episodes'}`
  }

  const start = Math.max(1, Math.ceil(viewport.start))
  const end = Math.min(episodeCount, Math.floor(viewport.end))
  return `Episodes ${start}–${end} of ${episodeCount}`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getEventXRatio(event, element) {
  const bounds = element.getBoundingClientRect()
  const width = bounds.width || element.clientWidth
  if (!width) {
    return 0.5
  }

  return clamp((event.clientX - bounds.left) / width, 0, 1)
}

function getWheelZoomScale(event) {
  const deltaUnit =
    event.deltaMode === WHEEL_DELTA_LINE
      ? 0.05
      : event.deltaMode === WHEEL_DELTA_PAGE
        ? 1
        : 0.002
  const exponent = clamp(event.deltaY * deltaUnit * 10, -1, 1)
  return 2 ** exponent
}

function renderSourceStatus(root, model, settings) {
  if (!model.primaryRatingSource) {
    root.textContent = 'No usable episode ratings.'
    return
  }

  const otherSources = model.ratingSourceCoverage
    .filter((entry) => entry.source !== model.primaryRatingSource)
    .map((entry) => getRatingSourceLabel(entry.source))
  const spreadText =
    settings.showSourceSpread && otherSources.length > 0
      ? ` · source spread shows ${formatList(otherSources)}`
      : ''

  root.textContent = `Plotting ${getRatingSourceLabel(model.primaryRatingSource)}${spreadText} · Pinch or drag the overview to adjust the visible range.`
}

function formatList(values) {
  if (values.length < 2) {
    return values[0] ?? ''
  }
  if (values.length === 2) {
    return values.join(' and ')
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}
