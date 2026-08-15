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
  getVisibleSeriesBreakpoint,
  getVisibleSeasonTrendlines
} from './scales.js'
import {
  renderCrosshair,
  renderPoints,
  renderProviderRatingPreview,
  renderRangeFrame,
  renderSeasonAxis,
  renderSourceSpreads,
  renderSeriesBreakpoint,
  renderTrendlines
} from './marks.js'
import { createSidenote } from './sidenote.js'
import { createSparkline } from './sparkline.js'
import { getChartTheme, getUiSettings, updateUiSettings } from './theme.js'
import {
  RATING_SOURCE_PRIORITY,
  createCachedSeriesBreakpointDetector,
  isUsableProviderRating
} from '../data/stats.js'

const MOBILE_QUERY = '(max-width: 767px)'
const MOBILE_LANDSCAPE_QUERY = '(max-width: 767px) and (orientation: landscape)'
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const COARSE_POINTER_QUERY = '(pointer: coarse)'
const DETAIL_LOAD_DELAY_MS = 250
const TREND_HOVER_DELAY_MS = 100
const MAX_DETAIL_ERRORS = 25
const TOUCH_DRAG_START_TOLERANCE_PX = 9
const MIN_VIEWPORT_SPAN = 4
const VIEWPORT_FOLLOW_EDGE_RATIO = 0.1
const VIEWPORT_ANNOUNCEMENT_DELAY_MS = 120
const VIEWPORT_BOUNDARY_EPSILON = 1e-9
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
        <svg class="ratings-chart" role="group" aria-label="Episode ratings chart" tabindex="-1"></svg>
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

  const breakpointDetector =
    options.breakpointDetector ?? createCachedSeriesBreakpointDetector()
  let currentSeasons = seasons
  let preferredPrimaryRatingSource = options.primaryRatingSource ?? null
  let notifiedPrimaryRatingSource = Symbol('unreported-primary-rating-source')
  let model = buildChartModel(currentSeasons, {
    breakpointDetector,
    primaryRatingSource: preferredPrimaryRatingSource
  })
  let show = options.show ?? null
  let viewport = null
  let episodeDensity = getUiSettings().episodeDensity
  let selectedPointId = null
  let hoverPointId = null
  let selectedTrendId = null
  let hoverTrendId = null
  let hoveredProviderRating = null
  let selectedProviderRating = null
  let hasUserInteracted = false
  let sparkline = null
  let viewportAnnouncementTimer = null
  let selectionAnnouncementTimer = null
  let trendHoverTimer = null
  let pendingTrendHoverId = null
  let detailLoadTimer = null
  let scheduledDetailPointId = null
  let destroyed = false
  const detailCache = new Map()
  const detailErrors = []
  const failedDetailPointIds = new Set()
  const loadingDetailPointIds = new Set()

  const sidenote = createSidenote({
    root: options.detailRoot ?? readingPane,
    onInteract() {
      hasUserInteracted = true
    },
    onNavigate(delta) {
      navigateDetail(delta)
    },
    onPreviewRating(target) {
      previewProviderRating(target)
    },
    onSelectRating(target) {
      selectProviderRating(target)
    },
    onSelectPoint(pointId) {
      setSelectedPoint(getPointById(pointId), 'pointer')
    },
    onSelectSeasonTrend(seasonNumber) {
      selectSeasonTrend(seasonNumber)
    },
    onSelectSeriesBreakpoint() {
      selectSeriesBreakpoint()
    }
  })

  function isMobile() {
    return mediaQuery.matches
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
    return id ? (model.pointById.get(id) ?? null) : null
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

  function resolveProviderRating(target) {
    if (!target?.pointId || !target.source) {
      return null
    }

    const point =
      detailCache.get(target.pointId) ?? getPointById(target.pointId)
    const rating = point?.ratings?.find(
      (candidate) =>
        candidate.source === target.source && isUsableProviderRating(candidate)
    )

    return rating
      ? {
          ...rating,
          pointId: target.pointId,
          source: rating.source
        }
      : null
  }

  function getActiveProviderRating() {
    const activePoint = getActivePoint()
    if (!activePoint) {
      return null
    }

    const target =
      hoveredProviderRating?.pointId === activePoint.id
        ? hoveredProviderRating
        : selectedProviderRating?.pointId === activePoint.id
          ? selectedProviderRating
          : null

    return resolveProviderRating(target)
  }

  function getSelectedRatingSource(point) {
    return selectedProviderRating?.pointId === point?.id
      ? selectedProviderRating.source
      : null
  }

  function clearProviderRatingState() {
    hoveredProviderRating = null
    selectedProviderRating = null
  }

  function notifyPrimaryRatingSource() {
    if (model.primaryRatingSource === notifiedPrimaryRatingSource) {
      return
    }

    notifiedPrimaryRatingSource = model.primaryRatingSource
    options.onPrimaryRatingSourceChange?.(model.primaryRatingSource)
  }

  function previewProviderRating(target) {
    const nextTarget = resolveProviderRating(target)
    if (
      nextTarget?.pointId === hoveredProviderRating?.pointId &&
      nextTarget?.source === hoveredProviderRating?.source
    ) {
      return
    }

    hoveredProviderRating = nextTarget
    render()
  }

  function selectProviderRating(target) {
    const rating = resolveProviderRating(target)
    const point = getPointById(rating?.pointId)
    if (!rating || point?.id !== getActivePoint()?.id) {
      return
    }

    selectedProviderRating =
      rating.source === point.ratingSource
        ? null
        : { pointId: rating.pointId, source: rating.source }
    render()
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

  function getScopeRatedPoints(summary) {
    // Model collections are shared read-only views in every branch.
    if (summary?.kind === 'season') {
      return model.ratedPointsBySeason.get(summary.seasonNumber) ?? []
    }

    if (summary?.kind === 'breakpoint') {
      return model.primaryRatedPoints
    }

    return model.ratedPoints
  }

  function getFirstRatedPointInScope(summary) {
    return getScopeRatedPoints(summary)[0] ?? model.ratedPoints[0] ?? null
  }

  function getSeriesNavigationStop() {
    const summary = getTrendSummary('series')
    return summary && isTrendEnabled('series') ? summary : null
  }

  function getSeasonTrendSummaries() {
    return model.seasonTrendlines
      .map((trendline) => getTrendSummary(trendline.id))
      .filter(Boolean)
  }

  function resolveDefaultSelection(settings = getUiSettings()) {
    selectedPointId = null
    selectedTrendId = null

    if (settings.fullShowTrendline && getTrendSummary('series')) {
      selectedTrendId = 'series'
      return
    }

    if (settings.seasonTrendlines) {
      const firstSeasonSummary = Object.values(model.trendSummaries)
        .filter((summary) => summary.kind === 'season')
        .sort((left, right) => left.seasonNumber - right.seasonNumber)[0]
      if (firstSeasonSummary) {
        selectedTrendId = firstSeasonSummary.id
        return
      }
    }

    selectedPointId = model.ratedPoints[0]?.id ?? null
  }

  function getNavigatorViewModel() {
    const points = getRatedPoints()
    if (points.length === 0) {
      return {
        mode: 'empty',
        label: 'No rated episodes',
        meta: '',
        previousAvailable: false,
        nextAvailable: false
      }
    }

    const activePoint = getActivePoint()
    if (activePoint) {
      const index = model.ratedPointIndexById.get(activePoint.id) ?? -1
      const hasSeriesStop = Boolean(getSeriesNavigationStop())
      const canNavigate = points.length > 1 || hasSeriesStop
      return {
        mode: 'point',
        label: formatEpisodeCode(activePoint),
        meta: `${index + 1} of ${points.length} rated ${points.length === 1 ? 'episode' : 'episodes'}`,
        previousAvailable: canNavigate,
        nextAvailable: canNavigate,
        previousLabel:
          index === 0
            ? hasSeriesStop
              ? 'Full series trend'
              : 'Last rated episode'
            : 'Previous episode',
        nextLabel:
          index === points.length - 1
            ? hasSeriesStop
              ? 'Full series trend'
              : 'First rated episode'
            : 'Next episode'
      }
    }

    const summary = getTrendSummary(getActiveTrendId())
    const scopePoints = getScopeRatedPoints(summary)
    if (summary?.kind === 'season') {
      const seasonTrends = getSeasonTrendSummaries()
      const canNavigateTrends = seasonTrends.length > 1
      const canNavigateEpisodes = scopePoints.length > 0
      return {
        mode: 'season',
        navigationKind: canNavigateTrends ? 'season' : 'episode',
        label: `Season ${summary.seasonNumber}`,
        meta: `${scopePoints.length} rated ${scopePoints.length === 1 ? 'episode' : 'episodes'} in Season ${summary.seasonNumber}`,
        previousAvailable: canNavigateTrends || canNavigateEpisodes,
        nextAvailable: canNavigateTrends || canNavigateEpisodes,
        previousLabel: canNavigateTrends
          ? 'Previous season trendline'
          : `Last rated episode of Season ${summary.seasonNumber}`,
        nextLabel: canNavigateTrends
          ? 'Next season trendline'
          : `First rated episode of Season ${summary.seasonNumber}`
      }
    }

    if (summary?.kind === 'breakpoint') {
      return {
        mode: 'breakpoint',
        label: 'Series Breakpoint',
        meta: `${scopePoints.length} rated ${scopePoints.length === 1 ? 'episode' : 'episodes'}`,
        previousAvailable: scopePoints.length > 0,
        nextAvailable: scopePoints.length > 0,
        previousLabel: 'Last rated episode',
        nextLabel: 'First rated episode'
      }
    }

    return {
      mode: summary?.kind === 'series' ? 'series' : 'browse',
      label: summary?.kind === 'series' ? 'Full Series' : 'Browse episodes',
      meta: `${scopePoints.length} rated ${scopePoints.length === 1 ? 'episode' : 'episodes'}`,
      previousAvailable: scopePoints.length > 0,
      nextAvailable: scopePoints.length > 0,
      previousLabel: 'Last rated episode',
      nextLabel: 'First rated episode'
    }
  }

  function isTrendEnabled(id, settings = getUiSettings()) {
    if (getTrendSummary(id)?.kind === 'breakpoint') {
      return true
    }
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
    if (scheduledDetailPointId === point.id) {
      return
    }
    cancelScheduledDetailLoad()

    if (
      !options.loadEpisodeDetails ||
      detailCache.has(point.id) ||
      failedDetailPointIds.has(point.id) ||
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
          failedDetailPointIds.add(point.id)
          detailErrors.push({ episodeId: point.id, reason: error.message })
          if (detailErrors.length > MAX_DETAIL_ERRORS) {
            detailErrors.shift()
          }
        }
      } finally {
        loadingDetailPointIds.delete(point.id)
        if (!destroyed && getActivePoint()?.id === point.id) {
          const currentPoint = getPointById(point.id)
          sidenote.renderPoint(detailCache.get(point.id) ?? currentPoint, {
            show,
            selectedRatingSource: getSelectedRatingSource(currentPoint)
          })
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
      sidenote.renderRestingState({
        empty: model.ratedPoints.length === 0,
        trendlinesAvailable: Object.values(model.trendSummaries).some(
          (summary) =>
            summary.kind !== 'breakpoint' && isTrendEnabled(summary.id)
        )
      })
      shell.style.removeProperty('--reading-pane-marker')
      return
    }

    if (load) {
      scheduleDetailLoad(point)
    }
    sidenote.renderPoint(detailCache.get(point.id) ?? point, {
      loadingDetails: loadingDetailPointIds.has(point.id),
      show,
      selectedRatingSource: getSelectedRatingSource(point)
    })
  }

  function updateActiveDetail() {
    const activePoint = getActivePoint()
    sidenote.renderNavigator(getNavigatorViewModel())
    if (activePoint) {
      shell.dataset.detailKind = 'point'
      updateDetail(activePoint, { load: true })
      return
    }

    const activeTrend = getTrendSummary(getActiveTrendId())
    if (activeTrend) {
      cancelScheduledDetailLoad()
      shell.dataset.detailKind = 'trend'
      shell.style.removeProperty('--reading-pane-marker')
      sidenote.renderTrendSummary(
        activeTrend.kind === 'series'
          ? {
              ...activeTrend,
              plottingContext: getPlottingContext(model, getUiSettings())
            }
          : activeTrend,
        { show }
      )
      return
    }

    shell.dataset.detailKind = 'none'
    updateDetail(null)
  }

  function ensureViewport(width) {
    const defaultViewport = getDefaultViewport(width)

    if (!viewport) {
      viewport = defaultViewport
      return
    }

    viewport = clampViewport(viewport, model)
  }

  function getDefaultViewport(width) {
    return createDefaultViewport(model, width, isMobile(), episodeDensity)
  }

  function setSelectedPoint(point, source = 'keyboard') {
    if (!point) {
      return
    }

    hasUserInteracted = true
    clearProviderRatingState()

    if (source === 'keyboard') {
      hoverPointId = null
    }

    cancelTrendHover()
    hoverTrendId = null
    selectedTrendId = null
    selectedPointId = point.id
    updateDetail(point, { load: true })
    announceSelection({ point })

    if (source === 'keyboard') {
      followViewportToX(point.x)
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

  function followViewportToX(x) {
    const span = viewport.end - viewport.start
    const edgeInset = span * VIEWPORT_FOLLOW_EDGE_RATIO
    const leftFollowEdge = viewport.start + edgeInset
    const rightFollowEdge = viewport.end - edgeInset
    let offset = 0

    if (x < leftFollowEdge) {
      offset = x - leftFollowEdge
    } else if (x > rightFollowEdge) {
      offset = x - rightFollowEdge
    }

    if (offset === 0) {
      return
    }

    viewport = clampViewport(
      {
        start: viewport.start + offset,
        end: viewport.end + offset
      },
      model
    )
  }

  function followSeasonSelection(summary) {
    const seasonSpan = model.seasonSpans.find(
      (span) => span.seasonNumber === summary.seasonNumber
    )
    if (!seasonSpan) {
      return
    }

    followViewportToX(seasonSpan.end)
    followViewportToX(seasonSpan.start)
  }

  function setSelectedTrend(id) {
    const summary = getTrendSummary(id)
    if (!summary || !isTrendEnabled(id)) {
      return
    }

    hasUserInteracted = true
    clearProviderRatingState()

    const isTogglingOff = selectedTrendId === id
    cancelTrendHover()
    hoverTrendId = null
    hoverPointId = null
    selectedPointId = null
    selectedTrendId = isTogglingOff ? null : id
    if (!isTogglingOff && summary.kind === 'season') {
      followSeasonSelection(summary)
    }
    cancelScheduledDetailLoad()
    announceSelection(isTogglingOff ? null : { summary })
    render()
  }

  function selectSeasonTrend(seasonNumber) {
    const id = `season:${seasonNumber}`
    if (!getTrendSummary(id)) {
      return
    }

    if (!getUiSettings().seasonTrendlines) {
      updateUiSettings({ seasonTrendlines: true })
    }
    setSelectedTrend(id)
  }

  function selectSeriesBreakpoint({ allowBelowThreshold = false } = {}) {
    const summary = model.seriesBreakpoint
    if (!summary || (!summary.highConfidence && !allowBelowThreshold)) {
      return false
    }
    setFullSeriesViewport()
    setSelectedTrend(summary.id)
    announceViewport()
    return true
  }

  function toggleSeriesBreakpoint() {
    hasUserInteracted = true
    const summary = model.seriesBreakpoint
    if (!summary) {
      return false
    }
    if (selectedTrendId === summary.id) {
      setSelectedTrend(summary.id)
      return true
    }
    return selectSeriesBreakpoint({ allowBelowThreshold: true })
  }

  function announceSelection(selection) {
    if (selectionAnnouncementTimer) {
      clearTimeout(selectionAnnouncementTimer)
    }

    selectionAnnouncementTimer = setTimeout(() => {
      selectionAnnouncementTimer = null
      if (!selection) {
        selectionStatus.textContent = 'Chart selection cleared.'
        return
      }

      if (selection.point) {
        selectionStatus.textContent = `${formatEpisodeCode(selection.point)} selected: ${selection.point.title}. Rating ${selection.point.rating.toFixed(1)}.`
        return
      }

      const { summary } = selection

      if (summary.kind === 'breakpoint') {
        const confidence = summary.highConfidence
          ? 'High confidence'
          : 'Confidence below automatic threshold'
        selectionStatus.textContent = `Series breakpoint selected before ${formatEpisodeCode(summary.breakpointPoint)}. ${confidence} rating drop of ${summary.drop.toFixed(1)} points.`
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
    hasUserInteracted = true
    if (!Number.isInteger(delta) || delta === 0) {
      return
    }

    const points = getRatedPoints()
    if (points.length === 0) {
      return
    }

    const selectedPoint = getPointById(selectedPointId)
    if (!selectedPoint) {
      const scopePoints = getScopeRatedPoints(getTrendSummary(selectedTrendId))
      setSelectedPoint(delta < 0 ? scopePoints.at(-1) : scopePoints[0])
      return
    }

    const currentIndex = model.ratedPointIndexById.get(selectedPoint.id) ?? -1
    const seriesStop = getSeriesNavigationStop()
    const sequenceLength = points.length + (seriesStop ? 1 : 0)
    const currentSequenceIndex = currentIndex + (seriesStop ? 1 : 0)
    const nextSequenceIndex = modulo(
      currentSequenceIndex + delta,
      sequenceLength
    )

    if (seriesStop && nextSequenceIndex === 0) {
      setSelectedTrend('series')
      return
    }

    const nextPoint = points[nextSequenceIndex - (seriesStop ? 1 : 0)]
    if (nextPoint?.id !== selectedPoint.id) {
      setSelectedPoint(nextPoint)
    }
  }

  function navigateDetail(delta) {
    const selectedTrend = getTrendSummary(selectedTrendId)
    if (selectedTrend?.kind === 'season') {
      if (getSeasonTrendSummaries().length > 1) {
        moveSeason(delta)
      } else {
        moveEpisode(delta)
      }
      return
    }

    moveEpisode(delta)
  }

  function moveSeason(delta) {
    hasUserInteracted = true
    if (!Number.isInteger(delta) || delta === 0) {
      return
    }

    const selectedTrend = getTrendSummary(selectedTrendId)
    if (selectedTrend?.kind === 'season') {
      const seasonTrends = getSeasonTrendSummaries()
      const currentIndex = seasonTrends.findIndex(
        (summary) => summary.id === selectedTrend.id
      )
      const nextTrend =
        seasonTrends[modulo(currentIndex + delta, seasonTrends.length)]
      if (nextTrend?.id !== selectedTrend.id) {
        setSelectedTrend(nextTrend.id)
      }
      return
    }

    const activePoint =
      getPointById(selectedPointId) || getFirstRatedPointInScope(selectedTrend)
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
    hasUserInteracted = true
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

  function panHalfViewport(direction) {
    hasUserInteracted = true
    if (!viewport || !Number.isFinite(direction) || direction === 0) {
      return
    }

    const span = viewport.end - viewport.start
    panViewport((Math.sign(direction) * span) / 2)

    announceViewport()
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
    const fallbackViewport = getDefaultViewport(getCurrentChartWidth())
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
    hasUserInteracted = true
    setFullSeriesViewport()
    render()
    announceViewport()
  }

  function setFullSeriesViewport() {
    viewport = clampViewport({ start: 1, end: model.xMax }, model)
  }

  function resetZoom() {
    hasUserInteracted = true
    resetViewportWidth(getCurrentChartWidth(), getKeyboardViewportAnchor())
    announceViewport()
  }

  function zoomBy(scale) {
    hasUserInteracted = true
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
    hasUserInteracted = true
    clearProviderRatingState()
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
    hasUserInteracted = true
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
    hasUserInteracted = true
    const activePoint = getActivePoint()
    const selectedTrend = getTrendSummary(selectedTrendId)
    if (selectedTrend) {
      const firstSeasonTrend = getSeasonTrendSummaries()[0]
      if (!firstSeasonTrend) {
        return false
      }
      if (!getUiSettings().seasonTrendlines) {
        updateUiSettings({ seasonTrendlines: true })
      }
      if (selectedTrend.id !== firstSeasonTrend.id) {
        setSelectedTrend(firstSeasonTrend.id)
      }
      return true
    }

    const viewportCenter = viewport.start + (viewport.end - viewport.start) / 2
    const visibleTrends = getVisibleSeasonTrendlines(model, viewport)
    const nearestVisibleTrend = visibleTrends.sort(
      (left, right) =>
        Math.abs((left.visibleStartX + left.visibleEndX) / 2 - viewportCenter) -
        Math.abs((right.visibleStartX + right.visibleEndX) / 2 - viewportCenter)
    )[0]
    const seasonNumber = visibleTrends.some(
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

  function updateSeasons(nextSeasons, context = {}) {
    if (destroyed) {
      return
    }

    if (Object.hasOwn(context, 'show')) {
      show = context.show
    }
    if (Object.hasOwn(context, 'primaryRatingSource')) {
      preferredPrimaryRatingSource = context.primaryRatingSource
    }

    const previousPoint = getPointById(selectedPointId)
    const previousTrend = getTrendSummary(selectedTrendId)
    const shouldRefreshDefaultViewport = Boolean(viewport && !hasUserInteracted)
    currentSeasons = nextSeasons
    model = buildChartModel(currentSeasons, {
      breakpointDetector,
      primaryRatingSource: preferredPrimaryRatingSource
    })
    notifyPrimaryRatingSource()
    hoveredProviderRating = null
    failedDetailPointIds.clear()
    if (!getPointById(hoverPointId)) {
      hoverPointId = null
    }
    if (!getTrendSummary(hoverTrendId)) {
      hoverTrendId = null
    }

    if (!hasUserInteracted) {
      resolveDefaultSelection()
    } else if (previousPoint) {
      const survivingPointIndex = model.ratedPointIndexById.get(
        previousPoint.id
      )
      const survivingPoint = Number.isInteger(survivingPointIndex)
        ? model.ratedPoints[survivingPointIndex]
        : null
      const nearestPoint = model.ratedPoints.reduce((nearest, point) => {
        if (!nearest) {
          return point
        }
        return Math.abs(point.x - previousPoint.x) <
          Math.abs(nearest.x - previousPoint.x)
          ? point
          : nearest
      }, null)
      selectedPointId = (survivingPoint ?? nearestPoint)?.id ?? null
      selectedTrendId = null
    } else if (previousTrend) {
      const survivingTrend = getTrendSummary(previousTrend.id)
      if (survivingTrend && isTrendEnabled(survivingTrend.id)) {
        selectedTrendId = survivingTrend.id
        selectedPointId = null
      } else {
        selectedTrendId = null
        selectedPointId = getFirstRatedPointInScope(previousTrend)?.id ?? null
      }
    }

    for (const [episodeId, cachedPoint] of detailCache) {
      const point = getPointById(episodeId)
      if (!point) {
        detailCache.delete(episodeId)
        continue
      }

      detailCache.set(episodeId, mergeEpisodeDetails(point, cachedPoint))
    }

    if (
      selectedProviderRating &&
      (selectedProviderRating.pointId !== selectedPointId ||
        !resolveProviderRating(selectedProviderRating))
    ) {
      selectedProviderRating = null
    }

    if (shouldRefreshDefaultViewport) {
      viewport = getDefaultViewport(getCurrentChartWidth())
    } else if (viewport) {
      viewport = clampViewport(viewport, model)
    }
    render()
  }

  function setPrimaryRatingSource(source) {
    const isAvailable = model.ratingSourceCoverage.some(
      (entry) => entry.source === source && entry.ratedEpisodes > 0
    )
    if (!isAvailable) {
      return false
    }

    hasUserInteracted = true
    clearProviderRatingState()
    preferredPrimaryRatingSource = source
    if (source === model.primaryRatingSource) {
      render()
      return true
    }

    updateSeasons(currentSeasons, { primaryRatingSource: source })
    return model.primaryRatingSource === source
  }

  function cyclePrimaryRatingSource() {
    const availableSources = new Set(
      model.ratingSourceCoverage
        .filter((entry) => entry.ratedEpisodes > 0)
        .map((entry) => entry.source)
    )
    const orderedSources = RATING_SOURCE_PRIORITY.filter((source) =>
      availableSources.delete(source)
    )

    for (const { source } of model.ratingSourceCoverage) {
      if (availableSources.delete(source)) {
        orderedSources.push(source)
      }
    }

    if (orderedSources.length < 2) {
      return false
    }

    const currentIndex = orderedSources.indexOf(model.primaryRatingSource)
    const nextSource =
      orderedSources[(currentIndex + 1) % orderedSources.length]
    return setPrimaryRatingSource(nextSource)
  }

  function resetViewportWidth(chartWidth, center = getViewportCenter()) {
    const defaultViewport = getDefaultViewport(chartWidth)
    const defaultWidth = defaultViewport.end - defaultViewport.start + 1
    const centeredStart = center - (defaultWidth - 1) / 2

    viewport = clampViewport(
      {
        start: centeredStart,
        end: centeredStart + defaultWidth - 1
      },
      model
    )

    render()
  }

  function getTrendInteractions(densityPointCount) {
    const activeTrendId = getActiveTrendId()
    return {
      activeTrendId,
      densityPointCount,
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

  function getPointInteractions(activeProviderRating) {
    return {
      activePointId: getActivePoint()?.id ?? null,
      activeRatingSource: activeProviderRating?.source ?? null,
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

  function getSeasonAxisInteractions() {
    const selectedTrend = getTrendSummary(selectedTrendId)
    return {
      activeSeasonNumber:
        selectedTrend?.kind === 'season' ? selectedTrend.seasonNumber : null,
      isSelectable(seasonNumber) {
        return Boolean(getTrendSummary(`season:${seasonNumber}`))
      },
      onSelect: selectSeasonTrend,
      shouldSuppressClick
    }
  }

  function renderChart(
    chartTheme,
    axisWidth,
    chartWidth,
    chartHeight,
    sparklineHeight
  ) {
    ensureViewport(chartWidth)
    const uiSettings = getUiSettings()
    const activePoint = getActivePoint()
    const activeProviderRating = getActiveProviderRating()

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
      {
        ...scaleOptions,
        additionalRatings: activeProviderRating
          ? [activeProviderRating.rating]
          : []
      }
    )
    const sparklineScales = createSparklineScales(
      model,
      {
        width: chartWidth,
        height: sparklineHeight
      },
      scaleOptions
    )
    const visiblePoints = getVisiblePoints(model, viewport)
    const visibleRatedPoints = getVisibleRatedPoints(model, viewport)

    bodyShell.style.touchAction = isMobile() ? 'none' : ''

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
      getTrendInteractions(visibleRatedPoints.length)
    )
    renderSourceSpreads(
      mainSvg,
      visiblePoints,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      {
        visible: uiSettings.showSourceSpread,
        activePointId: activePoint?.id ?? null
      }
    )
    renderCrosshair(
      mainSvg,
      activePoint,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      uiSettings.showSourceSpread
    )
    renderPoints(
      mainSvg,
      visiblePoints,
      mainScales,
      chartTheme,
      getPointInteractions(activeProviderRating)
    )
    renderProviderRatingPreview(
      mainSvg,
      visiblePoints,
      activePoint,
      activeProviderRating,
      mainScales,
      chartTheme
    )
    renderSeriesBreakpoint(
      mainSvg,
      selectedTrendId === model.seriesBreakpoint?.id
        ? getVisibleSeriesBreakpoint(model, viewport)
        : null,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme
    )
    renderSeasonAxis(
      mainSvg,
      model.seasonSpans,
      viewport,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      getSeasonAxisInteractions()
    )

    renderSparkline(
      chartTheme,
      sparklineScales,
      chartWidth,
      sparklineHeight,
      (nextViewport) => {
        hasUserInteracted = true
        viewport = clampViewport(nextViewport, model)
        render()
      },
      () => {
        hasUserInteracted = true
        resetViewportWidth(chartWidth)
      }
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
    const defaultViewport = getDefaultViewport(chartWidth)

    shell.style.setProperty('--axis-width', `${axisWidth}px`)
    shell.style.setProperty('--chart-height', `${chartHeight}px`)
    renderSourceStatus(sourceStatus, model, defaultViewport)

    renderChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight)

    const activePoint = getActivePoint()
    if (activePoint) {
      const scale = createMainScales(model, viewport, {
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
    if (handleTrackpadPinch(event, bodyShell)) {
      hasUserInteracted = true
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

    hasUserInteracted = true
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
    if (handleTrackpadPinch(event, sparklineSvg)) {
      hasUserInteracted = true
    }
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
        announceViewport()
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
        announceViewport()
        return
      }
      render()
      flingFrame = requestAnimationFrame(step)
    }

    flingFrame = requestAnimationFrame(step)
  }

  bodyShell.addEventListener('pointerdown', (event) => {
    hasUserInteracted = true
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
        velocity: 0,
        viewportChanged: stoppedFling
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
        startViewport: { ...viewport },
        viewportChanged: gesture.viewportChanged
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

      const previousViewport = viewport
      viewport = clampViewport(
        {
          start: startCenter - (newWidth - 1) / 2,
          end: startCenter + (newWidth - 1) / 2
        },
        model
      )
      gesture.viewportChanged ||=
        viewport.start !== previousViewport.start ||
        viewport.end !== previousViewport.end
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

    const previousViewport = viewport
    viewport = clampViewport(
      {
        start: gesture.startViewport.start + deltaEpisodes,
        end: gesture.startViewport.end + deltaEpisodes
      },
      model
    )
    gesture.viewportChanged ||=
      viewport.start !== previousViewport.start ||
      viewport.end !== previousViewport.end
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
      const { viewportChanged } = gesture
      const wasDrag = gesture.type !== 'pending'
      if (wasDrag || viewportChanged) {
        suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
      }
      gesture = null

      const shouldFling = wasPan && Math.abs(velocity) > 0.15
      if (shouldFling) {
        startFling(velocity)
      } else if (viewportChanged) {
        announceViewport()
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
        velocity: 0,
        viewportChanged: gesture.viewportChanged
      }
      suppressClickUntil = performance.now() + SUPPRESS_CLICK_DURATION_MS
    }
  }

  bodyShell.addEventListener('pointerup', endGesture)
  bodyShell.addEventListener('pointercancel', endGesture)

  bodyShell.addEventListener('click', (event) => {
    hasUserInteracted = true
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
    const nextEpisodeDensity = getUiSettings().episodeDensity
    const densityChanged = nextEpisodeDensity !== episodeDensity
    episodeDensity = nextEpisodeDensity

    if (selectedTrendId && !isTrendEnabled(selectedTrendId)) {
      const previousTrend = getTrendSummary(selectedTrendId)
      selectedTrendId = null
      const nextPoint = getFirstRatedPointInScope(previousTrend)
      selectedPointId = nextPoint?.id ?? null
      hasUserInteracted = true
      if (nextPoint) {
        announceSelection({ point: nextPoint })
      }
    }
    if (hoverTrendId && !isTrendEnabled(hoverTrendId)) {
      hoverTrendId = null
    }

    if (densityChanged) {
      resetViewportWidth(getCurrentChartWidth(), getKeyboardViewportAnchor())
      return
    }
    render()
  }
  document.addEventListener('graphtv:settings-change', settingsListener)

  ensureViewport(getCurrentChartWidth())
  resolveDefaultSelection()
  render()
  notifyPrimaryRatingSource()

  return {
    moveEpisode,
    moveSeason,
    jumpBoundary,
    panHalfViewport,
    fitSeries,
    resetZoom,
    zoomBy,
    toggleSeriesTrend,
    toggleSeasonTrend,
    toggleSeriesBreakpoint,
    selectSeriesBreakpoint,
    setPrimaryRatingSource,
    cyclePrimaryRatingSource,
    clearSelection() {
      hasUserInteracted = true
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
        providerRating: {
          active: getActiveProviderRating(),
          selected: selectedProviderRating
        },
        hasUserInteracted,
        navigator: getNavigatorViewModel(),
        viewport,
        ratings: {
          primarySource: model.primaryRatingSource,
          minimumCoverage: model.minimumPrimaryCoverage,
          coverage: model.ratingSourceCoverage
        },
        breakpoint: model.seriesBreakpointCandidate
          ? {
              highConfidence: model.seriesBreakpointCandidate.highConfidence,
              score: model.seriesBreakpointCandidate.score,
              pValue: model.seriesBreakpointCandidate.pValue,
              splitIndex: model.seriesBreakpointCandidate.splitIndex
            }
          : null,
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
      stopFling()
      cancelScheduledDetailLoad()
      cancelTrendHover()
      if (viewportAnnouncementTimer) {
        clearTimeout(viewportAnnouncementTimer)
      }
      if (selectionAnnouncementTimer) {
        clearTimeout(selectionAnnouncementTimer)
      }
      loadingDetailPointIds.clear()
      failedDetailPointIds.clear()
      resizeObserver.disconnect()
      document.removeEventListener('graphtv:settings-change', settingsListener)
      bodyShell.removeEventListener('wheel', handleBodyWheel)
      sparklineSvg.removeEventListener('wheel', handleSparklineWheel)
      sparkline?.destroy()
      sidenote.destroy()
      options.loadEpisodeDetails?.destroy?.()
      container.innerHTML = ''
    }
  }
}

function formatEpisodeCode(point) {
  const episodeNumber = point.episode ?? point.number
  return `S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
}

function formatViewportAnnouncement(viewport, episodeCount) {
  if (viewport.start <= 1 && viewport.end >= episodeCount) {
    return `Whole series, ${episodeCount} ${episodeCount === 1 ? 'episode' : 'episodes'}`
  }

  const start = Math.max(
    1,
    Math.ceil(viewport.start - VIEWPORT_BOUNDARY_EPSILON)
  )
  const end = Math.min(
    episodeCount,
    Math.floor(viewport.end + VIEWPORT_BOUNDARY_EPSILON)
  )
  return `Episodes ${start}–${end} of ${episodeCount}`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor
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

function renderSourceStatus(root, model, defaultViewport) {
  root.hidden = false
  if (!model.primaryRatingSource) {
    setTextContent(root, 'No usable episode ratings.')
    return
  }

  root.hidden = defaultViewport.start <= 1 && defaultViewport.end >= model.xMax
  setTextContent(root, 'Drag the overview window to pan; resize it to zoom.')
}

function setTextContent(element, value) {
  if (element.textContent !== value) {
    element.textContent = value
  }
}

function getPlottingContext(model, settings) {
  if (!model.primaryRatingSource) {
    return null
  }

  const otherSources = model.ratingSourceCoverage
    .filter((entry) => entry.source !== model.primaryRatingSource)
    .map((entry) => entry.source)

  return {
    source: model.primaryRatingSource,
    spreadSources: settings.showSourceSpread ? otherSources : []
  }
}
