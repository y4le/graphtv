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
  getVisibleSeasonTrendlines,
  resolveViewportFromDisplay
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
import { getSlotWidth } from './pointSize.js'
import { createChartGestureController } from './chartGestures.js'
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
const SCROLL_HOVER_SUPPRESSION_MS = 100
const MAX_DETAIL_ERRORS = 25
const MIN_VIEWPORT_SPAN = 4
const VIEWPORT_FOLLOW_EDGE_RATIO = 0.1
const VIEWPORT_ANNOUNCEMENT_DELAY_MS = 120
const VIEWPORT_BOUNDARY_EPSILON = 1e-9
const SELECTION_ANNOUNCEMENT_DELAY_MS = 120
const WHEEL_DELTA_LINE = 1
const WHEEL_DELTA_PAGE = 2
const CHART_HELP_DISMISSED_KEY = 'graphtv-chart-help-dismissed'

export function createChart(container, seasons, options = {}) {
  container.innerHTML = ''
  container.classList.add('chart-root')
  const usesExternalDetailRoot = Boolean(options.detailRoot)

  const shell = document.createElement('div')
  shell.className = 'chart-shell'
  shell.innerHTML = `
    <p class="chart-source-status" ${options.hideSourceStatus ? 'hidden' : ''}>
      <span data-chart-source-status-text aria-live="polite"></span>
      <button type="button" class="chart-source-dismiss" data-chart-source-dismiss>Dismiss</button>
    </p>
    <p class="chart-viewport-status visually-hidden" aria-live="polite" aria-atomic="true"></p>
    <p class="chart-selection-status visually-hidden" aria-live="polite" aria-atomic="true"></p>
    <div class="sparkline-shell" ${options.hideOverview ? 'hidden' : ''}>
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
  mainSvg.attr('aria-label', options.ariaLabel ?? 'Episode ratings chart')
  const bodyShell = shell.querySelector('.chart-body-shell')
  const sourceStatus = shell.querySelector('.chart-source-status')
  const sourceDismiss = shell.querySelector('[data-chart-source-dismiss]')
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
  let comparisonXMax = options.comparisonXMax ?? null
  let sharedRatings = options.sharedRatings ?? []
  let strictPrimaryRatingSource = Boolean(options.strictPrimaryRatingSource)
  let notifiedPrimaryRatingSource = Symbol('unreported-primary-rating-source')
  let model = createModel(currentSeasons)
  let show = options.show ?? null
  let viewport = null
  let episodeDensity = getUiSettings().episodeDensity
  let densityMetrics = null
  let selectedPointId = null
  let comparisonPointId = null
  let comparisonArmed = false
  let hoverPointId = null
  let scrubPointId = null
  let scrubX = null
  let comparisonCursorX = null
  let selectedTrendId = null
  let hoverTrendId = null
  let hoveredProviderRating = null
  let selectedProviderRating = null
  let hoveredComparisonRatingSource = null
  let selectedComparisonRatingSource = null
  let hasUserInteracted = false
  let sourceHelpDismissed = readSourceHelpDismissed()
  let sparkline = null
  let viewportAnnouncementTimer = null
  let selectionAnnouncementTimer = null
  let lastNotifiedViewport = null
  let trendHoverTimer = null
  let scrollHoverSuppressionTimer = null
  let suppressStationaryHover = false
  let pendingTrendHoverId = null
  let detailLoadTimer = null
  let scheduledDetailPoints = []
  let destroyed = false
  let gestureController = null
  const detailCache = new Map()
  const detailErrors = []
  const failedDetailPointIds = new Set()
  const loadingDetailPointIds = new Set()

  function createModel(nextSeasons) {
    const nextModel = buildChartModel(nextSeasons, {
      breakpointDetector,
      primaryRatingSource: preferredPrimaryRatingSource,
      strictPrimaryRatingSource
    })

    return Number.isFinite(comparisonXMax)
      ? { ...nextModel, xMax: Math.max(nextModel.xMax, comparisonXMax) }
      : nextModel
  }

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
    onStartComparison() {
      startComparison()
    },
    onCancelComparison() {
      cancelComparison()
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
    if (options.compact) {
      return {
        chartHeight: isMobile() ? 180 : 250,
        sparklineHeight: isMobile() ? 24 : 30
      }
    }

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

  function getComparisonAnchor() {
    return getPointById(selectedPointId)
  }

  function getComparisonPoint() {
    return getPointById(comparisonPointId)
  }

  function isComparisonCommitted() {
    const anchor = getComparisonAnchor()
    const point = getComparisonPoint()
    return Boolean(
      !comparisonArmed && anchor && point && anchor.id !== point.id
    )
  }

  function isComparisonMode() {
    return comparisonArmed || isComparisonCommitted()
  }

  function getOverviewSelection() {
    if (isComparisonMode()) {
      const points = [getComparisonAnchor(), getComparisonPoint()]
        .filter(Boolean)
        .filter(
          (point, index, candidates) =>
            candidates.findIndex((candidate) => candidate.id === point.id) ===
            index
        )
        .sort((left, right) => left.x - right.x)

      return {
        points,
        range:
          points.length === 2 ? { start: points[0].x, end: points[1].x } : null
      }
    }

    const point = getPointById(selectedPointId)
    return point ? { points: [point], range: null } : null
  }

  function clearComparisonState() {
    comparisonPointId = null
    comparisonArmed = false
  }

  function getActivePoint() {
    if (gestureController?.isScrubbing()) {
      return getPointById(scrubPointId)
    }
    if (isComparisonMode()) {
      return getComparisonPoint() ?? getComparisonAnchor()
    }
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

  function resolveComparisonProviderRatings(source) {
    const comparison = getComparisonSummary()
    if (!comparison || !source) {
      return []
    }

    return [comparison.earlier.point, comparison.later.point]
      .map((point) => {
        const rating = resolveProviderRating({ pointId: point.id, source })
        return rating ? { point, rating } : null
      })
      .filter(Boolean)
  }

  function getActiveProviderRatings() {
    if (isComparisonCommitted()) {
      const source =
        hoveredComparisonRatingSource ?? selectedComparisonRatingSource
      const ratings = resolveComparisonProviderRatings(source)
      return ratings.length === 2 ? ratings : []
    }

    const rating = getActiveProviderRating()
    const point = getPointById(rating?.pointId)
    return rating && point ? [{ point, rating }] : []
  }

  function getSelectedRatingSource(point) {
    return selectedProviderRating?.pointId === point?.id
      ? selectedProviderRating.source
      : null
  }

  function getSeriesRank(point, source = model.primaryRatingSource) {
    const ranking = model.seriesRankingsBySource.get(source)
    const rank = ranking?.rankByPointId.get(point?.id)
    return rank == null
      ? null
      : {
          rank,
          total: ranking.total,
          source
        }
  }

  function getSeriesRanks(point) {
    return Object.fromEntries(
      Array.from(model.seriesRankingsBySource.keys(), (source) => [
        source,
        getSeriesRank(point, source)
      ]).filter(([, rank]) => rank)
    )
  }

  function getComparisonSummary() {
    if (!isComparisonCommitted()) {
      return null
    }

    const endpoints = [getComparisonAnchor(), getComparisonPoint()].sort(
      (left, right) => left.x - right.x
    )
    const [earlierPoint, laterPoint] = endpoints
    const usesComparableRatings =
      earlierPoint.ratingSource === laterPoint.ratingSource
    const spanPoints = model.points.filter(
      (point) => point.x >= earlierPoint.x && point.x <= laterPoint.x
    )
    const spanRatedPoints = model.primaryRatedPoints.filter(
      (point) => point.x >= earlierPoint.x && point.x <= laterPoint.x
    )
    const outsideRatedPoints = model.primaryRatedPoints.filter(
      (point) => point.x < earlierPoint.x || point.x > laterPoint.x
    )
    const rankedSpanPoints = [...spanRatedPoints].sort(
      (left, right) => right.rating - left.rating || left.x - right.x
    )
    const earlierDate = Date.parse(earlierPoint.date)
    const laterDate = Date.parse(laterPoint.date)

    return {
      earlier: {
        point: earlierPoint,
        isAnchor: earlierPoint.id === selectedPointId,
        seriesRank: getSeriesRank(earlierPoint),
        seriesRanks: getSeriesRanks(earlierPoint)
      },
      later: {
        point: laterPoint,
        isAnchor: laterPoint.id === selectedPointId,
        seriesRank: getSeriesRank(laterPoint),
        seriesRanks: getSeriesRanks(laterPoint)
      },
      ratingDelta: usesComparableRatings
        ? laterPoint.rating - earlierPoint.rating
        : null,
      ratingSource: usesComparableRatings ? earlierPoint.ratingSource : null,
      airDateGapDays:
        Number.isFinite(earlierDate) && Number.isFinite(laterDate)
          ? Math.round(Math.abs(laterDate - earlierDate) / 86_400_000)
          : null,
      span: {
        episodeCount: spanPoints.length,
        ratedCount: spanRatedPoints.length,
        ratingSource: model.primaryRatingSource,
        top: rankedSpanPoints[0] ? { point: rankedSpanPoints[0] } : null,
        bottom: rankedSpanPoints.at(-1)
          ? { point: rankedSpanPoints.at(-1) }
          : null
      },
      spanContext:
        spanRatedPoints.length > 0 && outsideRatedPoints.length > 0
          ? {
              insideMean: meanPointRating(spanRatedPoints),
              outsideMean: meanPointRating(outsideRatedPoints),
              ratingSource: model.primaryRatingSource
            }
          : null
    }
  }

  function getComparisonDetailSummary() {
    const comparison = getComparisonSummary()
    if (!comparison) {
      return null
    }

    return {
      ...comparison,
      earlier: {
        ...comparison.earlier,
        point:
          detailCache.get(comparison.earlier.point.id) ??
          comparison.earlier.point,
        loadingDetails: loadingDetailPointIds.has(comparison.earlier.point.id)
      },
      later: {
        ...comparison.later,
        point:
          detailCache.get(comparison.later.point.id) ?? comparison.later.point,
        loadingDetails: loadingDetailPointIds.has(comparison.later.point.id)
      }
    }
  }

  function clearProviderRatingState() {
    hoveredProviderRating = null
    selectedProviderRating = null
    hoveredComparisonRatingSource = null
    selectedComparisonRatingSource = null
  }

  function notifyPrimaryRatingSource() {
    if (model.primaryRatingSource === notifiedPrimaryRatingSource) {
      return
    }

    notifiedPrimaryRatingSource = model.primaryRatingSource
    options.onPrimaryRatingSourceChange?.(model.primaryRatingSource)
  }

  function previewProviderRating(target) {
    if (!target) {
      if (!hoveredProviderRating && !hoveredComparisonRatingSource) {
        return
      }

      hoveredProviderRating = null
      hoveredComparisonRatingSource = null
      render()
      return
    }

    if (target?.comparison) {
      const nextSource =
        resolveComparisonProviderRatings(target.source).length === 2
          ? target.source
          : null
      if (nextSource === hoveredComparisonRatingSource) {
        return
      }

      hoveredProviderRating = null
      hoveredComparisonRatingSource = nextSource
      render()
      return
    }

    const nextTarget = resolveProviderRating(target)
    if (
      nextTarget?.pointId === hoveredProviderRating?.pointId &&
      nextTarget?.source === hoveredProviderRating?.source
    ) {
      return
    }

    hoveredComparisonRatingSource = null
    hoveredProviderRating = nextTarget
    render()
  }

  function selectProviderRating(target) {
    if (target?.comparison) {
      if (resolveComparisonProviderRatings(target.source).length !== 2) {
        return
      }

      selectedComparisonRatingSource =
        selectedComparisonRatingSource === target.source ? null : target.source
      render()
      return
    }

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
    if (
      isComparisonMode() ||
      gestureController?.isScrubbing() ||
      hoverPointId
    ) {
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

  function getSeasonTrendSummaries() {
    return model.seasonTrendlines
      .map((trendline) => getTrendSummary(trendline.id))
      .filter(Boolean)
  }

  function resolveDefaultSelection(settings = getUiSettings()) {
    clearComparisonState()
    selectedPointId = null
    selectedTrendId = null

    if (options.restingSelection === 'none') {
      return
    }

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

  function restoreInitialSelection(selection = options.initialSelection) {
    if (!selection) {
      return
    }

    if (selection === 'none') {
      clearProviderRatingState()
      clearComparisonState()
      selectedPointId = null
      selectedTrendId = null
      hasUserInteracted = true
      return
    }

    const comparisonCoordinates = /^s(\d+)e(\d+)-s(\d+)e(\d+)$/u.exec(selection)
    if (comparisonCoordinates) {
      const anchor = model.ratedPoints.find(
        (candidate) =>
          candidate.season === Number(comparisonCoordinates[1]) &&
          getEpisodeNumber(candidate) === Number(comparisonCoordinates[2])
      )
      const comparisonPoint = model.ratedPoints.find(
        (candidate) =>
          candidate.season === Number(comparisonCoordinates[3]) &&
          getEpisodeNumber(candidate) === Number(comparisonCoordinates[4])
      )
      if (!anchor || !comparisonPoint || anchor.id === comparisonPoint.id) {
        return
      }

      clearProviderRatingState()
      clearComparisonState()
      selectedPointId = anchor.id
      comparisonPointId = comparisonPoint.id
      selectedTrendId = null
      hasUserInteracted = true
      followViewportToX(comparisonPoint.x)
      return
    }

    const coordinate = /^s(\d+)(?:e(\d+))?$/u.exec(selection)
    if (coordinate?.[2]) {
      const point = model.ratedPoints.find(
        (candidate) =>
          candidate.season === Number(coordinate[1]) &&
          getEpisodeNumber(candidate) === Number(coordinate[2])
      )
      if (!point) {
        return
      }

      clearProviderRatingState()
      clearComparisonState()
      selectedPointId = point.id
      selectedTrendId = null
      hasUserInteracted = true
      followViewportToX(point.x)
      return
    }

    const trendId = coordinate
      ? `season:${Number(coordinate[1])}`
      : selection === 'breakpoint'
        ? 'series:breakpoint'
        : selection
    const summary = getTrendSummary(trendId)
    if (!summary) {
      return
    }
    if (summary.kind === 'season' && !getUiSettings().seasonTrendlines) {
      updateUiSettings({ seasonTrendlines: true })
    }

    clearProviderRatingState()
    selectedPointId = null
    selectedTrendId = summary.id
    hasUserInteracted = true
    if (summary.kind === 'season') {
      followSeasonSelection(summary)
    } else if (summary.kind === 'breakpoint') {
      setFullSeriesViewport()
    }
  }

  function getSelectionId() {
    const comparison = getComparisonSummary()
    if (comparison) {
      return `${formatEpisodeCode(comparison.earlier.point)}-${formatEpisodeCode(comparison.later.point)}`.toLowerCase()
    }
    const point = getPointById(selectedPointId)
    if (point) {
      return formatEpisodeCode(point).toLowerCase()
    }
    if (selectedTrendId?.startsWith('season:')) {
      return `s${selectedTrendId.slice(7).padStart(2, '0')}`
    }
    return selectedTrendId === 'series:breakpoint'
      ? 'breakpoint'
      : (selectedTrendId ?? 'none')
  }

  function notifySelectionChange() {
    const point = getPointById(selectedPointId)
    const selection = getSelectionId()
    options.onSelectionChange?.(selection)
    options.onSelectionContextChange?.({
      selection,
      x: point?.x ?? null,
      pointId: point?.id ?? null
    })
  }

  function notifyPointHoverChange(point = null) {
    options.onPointHoverContextChange?.({
      x: point?.x ?? null,
      pointId: point?.id ?? null
    })
  }

  function notifyViewportChange() {
    if (
      !viewport ||
      (lastNotifiedViewport &&
        lastNotifiedViewport.start === viewport.start &&
        lastNotifiedViewport.end === viewport.end)
    ) {
      return
    }

    lastNotifiedViewport = { ...viewport }
    options.onViewportChange?.({ ...viewport })
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

    const comparisonAnchor = getComparisonAnchor()
    const comparisonPoint = getComparisonPoint()
    if (comparisonArmed && comparisonAnchor) {
      return {
        mode: 'comparison-armed',
        label: `Compare ${formatEpisodeCode(comparisonAnchor)} with…`,
        meta: comparisonPoint
          ? `${formatEpisodeCode(comparisonPoint)} ready · Enter to compare`
          : 'Choose another episode',
        previousAvailable: points.length > 1,
        nextAvailable: points.length > 1,
        previousLabel: 'Preview previous episode for comparison',
        nextLabel: 'Preview next episode for comparison'
      }
    }

    const comparison = getComparisonSummary()
    if (comparison) {
      const rangeStart = formatEpisodeCode(comparison.earlier.point)
      const rangeEnd = formatEpisodeCode(comparison.later.point)
      return {
        mode: 'comparison',
        label: `${rangeStart} - ${rangeEnd}`,
        rangeStart,
        rangeEnd,
        meta: '',
        previousAvailable: false,
        nextAvailable: false
      }
    }

    const activePoint = getActivePoint()
    if (activePoint) {
      const index = model.ratedPointIndexById.get(activePoint.id) ?? -1
      const canNavigate = points.length > 1
      return {
        mode: 'point',
        label: formatEpisodeCode(activePoint),
        meta: `${index + 1} of ${points.length} rated ${points.length === 1 ? 'episode' : 'episodes'}`,
        previousAvailable: canNavigate,
        nextAvailable: canNavigate,
        previousLabel: index === 0 ? 'Last rated episode' : 'Previous episode',
        nextLabel:
          index === points.length - 1 ? 'First rated episode' : 'Next episode'
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
    // The full-series trend is always selectable: its summary is the resting
    // view of the chart even when the drawn line is switched off.
    const kind = getTrendSummary(id)?.kind
    if (kind === 'breakpoint' || kind === 'series') {
      return true
    }
    return settings.seasonTrendlines
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
      return false
    }

    hoverTrendId = null
    if (rerender) {
      render()
    }
    return true
  }

  function clearPointHover({ rerender = false } = {}) {
    if (!hoverPointId) {
      return false
    }

    const previousHoverPointId = hoverPointId
    hoverPointId = null
    notifyPointHoverChange()
    if (getActivePoint()?.id !== previousHoverPointId) {
      cancelScheduledDetailLoad()
    }

    const hitBatch = bodyShell.querySelector('.episode-point-hit-batch')
    if (hitBatch) {
      hitBatch.__hoveredPointId = null
    }
    if (rerender) {
      render()
    }
    return true
  }

  function clearChartHover({ rerender = false } = {}) {
    const pointCleared = clearPointHover()
    const trendCleared = clearTrendHover()
    bodyShell
      .querySelector('.chart-hit-surface')
      ?.style.removeProperty('cursor')

    if (rerender && (pointCleared || trendCleared)) {
      render()
    }

    return pointCleared || trendCleared
  }

  function previewTrend(trendline, { immediate = false } = {}) {
    const pointCleared = clearPointHover()
    if (
      !finePointerQuery.matches ||
      gestureController?.isActive() ||
      gestureController?.isFlinging()
    ) {
      const trendCleared = clearTrendHover()
      if (pointCleared || trendCleared) {
        render()
      }
      return
    }

    const nextId = trendline?.id ?? null
    if (!nextId) {
      const trendCleared = clearTrendHover()
      if (pointCleared || trendCleared) {
        render()
      }
      return
    }
    if (nextId === hoverTrendId) {
      if (pointCleared) {
        render()
      }
      return
    }
    if (!immediate && nextId === pendingTrendHoverId) {
      if (pointCleared) {
        render()
      }
      return
    }

    cancelTrendHover()
    if (immediate) {
      hoverTrendId = nextId
      cancelScheduledDetailLoad()
      render()
      return
    }

    if (pointCleared) {
      render()
    }
    pendingTrendHoverId = nextId
    trendHoverTimer = setTimeout(() => {
      trendHoverTimer = null
      pendingTrendHoverId = null
      if (
        destroyed ||
        gestureController?.isActive() ||
        gestureController?.isFlinging() ||
        !getTrendSummary(nextId)
      ) {
        return
      }

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
    scheduleDetailLoads([point])
  }

  function needsDetailLoad(point) {
    if (!options.loadEpisodeDetails) {
      return false
    }

    const currentDetails = detailCache.get(point.id) ?? point
    return options.loadEpisodeDetails.needsLoad
      ? options.loadEpisodeDetails.needsLoad(currentDetails)
      : !detailCache.has(point.id)
  }

  function scheduleDetailLoads(points) {
    const uniquePoints = points.filter(
      (point, index) =>
        points.findIndex((candidate) => candidate.id === point.id) === index
    )
    const scheduledPointIds = new Set(
      scheduledDetailPoints.map((point) => point.id)
    )
    const loadablePoints = uniquePoints.filter(
      (point) =>
        needsDetailLoad(point) &&
        !failedDetailPointIds.has(point.id) &&
        (!loadingDetailPointIds.has(point.id) ||
          scheduledPointIds.has(point.id))
    )
    if (
      detailLoadTimer &&
      scheduledDetailPoints.length === loadablePoints.length &&
      scheduledDetailPoints.every(
        (point, index) => point.id === loadablePoints[index].id
      )
    ) {
      return
    }
    cancelScheduledDetailLoad()

    scheduledDetailPoints = loadablePoints
    if (!scheduledDetailPoints.length) {
      return
    }

    scheduledDetailPoints.forEach((point) =>
      loadingDetailPointIds.add(point.id)
    )
    detailLoadTimer = setTimeout(() => {
      detailLoadTimer = null
      const pointsToLoad = scheduledDetailPoints
      scheduledDetailPoints = []
      pointsToLoad.forEach(loadPointDetails)
    }, DETAIL_LOAD_DELAY_MS)
  }

  async function loadPointDetails(point) {
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
      const comparison = getComparisonSummary()
      const isVisibleComparisonPoint = [
        comparison?.earlier.point.id,
        comparison?.later.point.id
      ].includes(point.id)
      if (
        !destroyed &&
        (getActivePoint()?.id === point.id || isVisibleComparisonPoint)
      ) {
        updateActiveDetail()
      }
    }
  }

  function cancelScheduledDetailLoad() {
    if (!detailLoadTimer) {
      return
    }

    clearTimeout(detailLoadTimer)
    detailLoadTimer = null
    scheduledDetailPoints.forEach((point) =>
      loadingDetailPointIds.delete(point.id)
    )
    scheduledDetailPoints = []
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
      selectedRatingSource: getSelectedRatingSource(point),
      seriesRank: getSeriesRank(point),
      comparisonMode:
        options.allowEpisodeComparison === false
          ? null
          : comparisonArmed && point.id === selectedPointId
            ? 'armed'
            : !isComparisonMode() && point.id === selectedPointId
              ? 'available'
              : null
    })
  }

  function updateComparisonDetail(comparison) {
    scheduleDetailLoads([comparison.earlier.point, comparison.later.point])
    if (
      hoveredComparisonRatingSource &&
      resolveComparisonProviderRatings(hoveredComparisonRatingSource).length !==
        2
    ) {
      hoveredComparisonRatingSource = null
    }
    if (
      selectedComparisonRatingSource &&
      resolveComparisonProviderRatings(selectedComparisonRatingSource)
        .length !== 2
    ) {
      selectedComparisonRatingSource = null
    }
    sidenote.renderComparison(getComparisonDetailSummary(), {
      selectedRatingSource: selectedComparisonRatingSource
    })
  }

  function updateActiveDetail() {
    sidenote.renderNavigator(getNavigatorViewModel())
    const comparison = getComparisonSummary()
    if (comparison) {
      shell.dataset.detailKind = 'comparison'
      shell.style.removeProperty('--reading-pane-marker')
      updateComparisonDetail(comparison)
      return
    }

    if (comparisonArmed) {
      shell.dataset.detailKind = 'comparison-armed'
      shell.style.removeProperty('--reading-pane-marker')
      updateDetail(getComparisonAnchor(), { load: true })
      return
    }

    const activePoint = getActivePoint()
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

  function startComparison() {
    const anchor = getComparisonAnchor()
    if (
      options.allowEpisodeComparison === false ||
      !anchor ||
      selectedTrendId
    ) {
      return false
    }

    hasUserInteracted = true
    clearProviderRatingState()
    clearComparisonState()
    cancelTrendHover()
    clearPointHover()
    hoverTrendId = null
    comparisonPointId = null
    comparisonArmed = true
    render()
    announceSelection({ comparisonPrompt: anchor })
    return true
  }

  function cancelComparison({ announce = true } = {}) {
    if (!isComparisonMode()) {
      return false
    }

    const anchor = getComparisonAnchor()
    clearProviderRatingState()
    clearComparisonState()
    render()
    if (announce && anchor) {
      announceSelection({ point: anchor })
    }
    notifySelectionChange()
    return true
  }

  function setComparisonPoint(point, { committed = true } = {}) {
    const anchor = getComparisonAnchor()
    if (!anchor || !point || point.id === anchor.id) {
      return false
    }

    hasUserInteracted = true
    clearProviderRatingState()
    clearComparisonState()
    cancelTrendHover()
    clearPointHover()
    hoverTrendId = null
    selectedTrendId = null
    comparisonPointId = point.id
    comparisonArmed = !committed
    followViewportToX(point.x)
    render()
    if (committed) {
      announceSelection({ comparison: getComparisonSummary() })
      notifySelectionChange()
    }
    return true
  }

  function commitComparison() {
    const point = getComparisonPoint()
    if (!comparisonArmed || !point) {
      return false
    }
    return setComparisonPoint(point)
  }

  function toggleComparison() {
    return isComparisonMode() ? cancelComparison() : startComparison()
  }

  function selectPointFromPointer(point, event) {
    if (comparisonArmed) {
      setComparisonPoint(point)
      return
    }

    if (
      options.allowEpisodeComparison !== false &&
      event?.shiftKey &&
      getComparisonAnchor()
    ) {
      if (point.id !== selectedPointId) {
        setComparisonPoint(point)
      } else {
        setSelectedPoint(point, 'pointer')
      }
      return
    }

    setSelectedPoint(point, 'pointer')
  }

  function setSelectedPoint(
    point,
    source = 'keyboard',
    { follow = true } = {}
  ) {
    if (!point) {
      return
    }

    hasUserInteracted = true
    clearProviderRatingState()
    clearComparisonState()

    if (source === 'keyboard') {
      clearPointHover()
    }

    cancelTrendHover()
    hoverTrendId = null
    selectedTrendId = null
    selectedPointId = point.id
    updateDetail(point, { load: true })
    announceSelection({ point })

    if (!follow) {
      // The caller has already placed the viewport around this point.
    } else if (source === 'keyboard') {
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
    notifySelectionChange()
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
    if (selectedTrendId === id && !selectedPointId) {
      // Re-selecting the current trend returns to the full-series trend; the
      // series trend itself is the resting state and stays put.
      if (id !== 'series') {
        selectSeriesTrend({ announce: true })
      }
      return
    }

    clearProviderRatingState()
    clearComparisonState()
    cancelTrendHover()
    hoverTrendId = null
    clearPointHover()
    selectedPointId = null
    selectedTrendId = id
    if (summary.kind === 'season') {
      followSeasonSelection(summary)
    }
    cancelScheduledDetailLoad()
    announceSelection({ summary })
    render()
    notifySelectionChange()
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

      if (selection.comparisonPrompt) {
        selectionStatus.textContent = `${formatEpisodeCode(selection.comparisonPrompt)} selected as the comparison anchor. Choose a second episode.`
        return
      }

      if (selection.comparison) {
        const comparison = selection.comparison
        const change = Number.isFinite(comparison.ratingDelta)
          ? ` Rating change ${formatSignedRatingDelta(comparison.ratingDelta)}.`
          : ' Ratings use different sources, so no change was calculated.'
        selectionStatus.textContent = `${formatEpisodeCode(comparison.earlier.point)} and ${formatEpisodeCode(comparison.later.point)} selected for comparison.${change}`
        return
      }

      if (selection.point) {
        const prefix = options.selectionLabel
          ? `${options.selectionLabel}, `
          : ''
        selectionStatus.textContent = `${prefix}${formatEpisodeCode(selection.point)} selected: ${selection.point.title}. Rating ${selection.point.rating.toFixed(1)}.`
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
    if (!Number.isInteger(delta) || delta === 0) {
      return
    }
    if (isComparisonCommitted()) {
      return
    }
    hasUserInteracted = true

    const points = getRatedPoints()
    if (points.length === 0) {
      return
    }

    const selectedPoint = getComparisonPoint() ?? getPointById(selectedPointId)
    if (!selectedPoint) {
      const scopePoints = getScopeRatedPoints(getTrendSummary(selectedTrendId))
      setSelectedPoint(delta < 0 ? scopePoints.at(-1) : scopePoints[0])
      return
    }

    const currentIndex = model.ratedPointIndexById.get(selectedPoint.id) ?? -1
    const nextPoint = points[modulo(currentIndex + delta, points.length)]
    if (nextPoint?.id !== selectedPoint.id) {
      if (comparisonArmed) {
        setComparisonPoint(nextPoint, { committed: false })
      } else {
        setSelectedPoint(nextPoint)
      }
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
    if (!Number.isInteger(delta) || delta === 0) {
      return
    }
    if (isComparisonCommitted()) {
      return
    }
    hasUserInteracted = true

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

    const departurePoint = getComparisonPoint() ?? getPointById(selectedPointId)
    const activePoint =
      departurePoint || getFirstRatedPointInScope(selectedTrend)
    if (!activePoint) {
      return
    }

    const seasonAnchors = getSeasonAnchors()
    const currentSeasonIndex = seasonAnchors.findIndex(
      (point) => point.season === activePoint.season
    )
    const nextSeasonIndex = modulo(
      currentSeasonIndex + delta,
      seasonAnchors.length
    )
    const arrivalPoint = getSeasonPointByEpisodeNumber(
      seasonAnchors[nextSeasonIndex].season,
      getEpisodeNumber(activePoint)
    )
    if (!arrivalPoint) {
      return
    }

    if (!departurePoint) {
      setSelectedPoint(arrivalPoint)
      return
    }

    if (arrivalPoint.id === departurePoint.id) {
      return
    }

    // Like Ctrl-D/Ctrl-U, step the viewport by the distance travelled so the
    // arrival episode (e.g. S03E08 from S02E08) keeps the same on-screen x.
    panViewport(arrivalPoint.x - departurePoint.x)
    const isVisible =
      arrivalPoint.x >= viewport.start && arrivalPoint.x <= viewport.end
    if (comparisonArmed) {
      setComparisonPoint(arrivalPoint, { committed: false })
    } else {
      setSelectedPoint(arrivalPoint, 'keyboard', { follow: !isVisible })
    }
  }

  function getSeasonPointByEpisodeNumber(seasonNumber, episodeNumber) {
    const seasonPoints = model.ratedPointsBySeason.get(seasonNumber) ?? []
    return seasonPoints.reduce((nearest, point) => {
      if (!nearest) {
        return point
      }
      const distance = Math.abs(getEpisodeNumber(point) - episodeNumber)
      const nearestDistance = Math.abs(
        getEpisodeNumber(nearest) - episodeNumber
      )
      return distance < nearestDistance ? point : nearest
    }, null)
  }

  function jumpBoundary(edge) {
    if (isComparisonCommitted()) {
      return
    }
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

    const departurePoint = getPointById(selectedPointId)
    const span = viewport.end - viewport.start
    const step = (Math.sign(direction) * span) / 2
    // Mirror Vim's Ctrl-D/Ctrl-U: the selection advances half a viewport to
    // the nearest rated episode, then the viewport follows by the distance the
    // selection actually travelled, so the arrival holds the departure's
    // on-screen x. Panning by the half span instead leaves behind whatever the
    // snap rounded off, walking the selection towards the left edge a little
    // on every press. Clamping still pins the viewport at either end of the
    // series while the selection carries on to the first or last episode.
    const arrivalPoint = departurePoint
      ? getNearestRatedPointToX(departurePoint.x + step, {
          // A half span usually falls midway between two episodes; landing on
          // the one further along keeps a half page down and back on the
          // departure episode.
          preferLater: step > 0
        })
      : null

    if (!arrivalPoint || arrivalPoint.id === departurePoint.id) {
      panViewport(step)
      announceViewport()
      return
    }

    panViewport(arrivalPoint.x - departurePoint.x)
    const isVisible =
      arrivalPoint.x >= viewport.start && arrivalPoint.x <= viewport.end
    setSelectedPoint(arrivalPoint, 'keyboard', { follow: !isVisible })
    announceViewport()
  }

  function getNearestRatedPointToX(x, { preferLater = false } = {}) {
    return getRatedPoints().reduce((nearest, point) => {
      if (!nearest) {
        return point
      }
      const distance = Math.abs(point.x - x)
      const nearestDistance = Math.abs(nearest.x - x)
      return distance < nearestDistance ||
        (preferLater && distance === nearestDistance)
        ? point
        : nearest
    }, null)
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

  function getHorizontalScaleOptions() {
    return {
      centerSparse: true,
      episodeDensity,
      isMobile: isMobile()
    }
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
      viewportStatus.textContent = options.formatViewportAnnouncement
        ? options.formatViewportAnnouncement(viewport, {
            xMax: model.xMax,
            totalEpisodes: model.points.length
          })
        : formatViewportAnnouncement(viewport, model.xMax)
    }, VIEWPORT_ANNOUNCEMENT_DELAY_MS)
  }

  function getRestingTrendId() {
    return options.restingSelection === 'none'
      ? null
      : getTrendSummary('series')
        ? 'series'
        : null
  }

  function isAtRestingSelection() {
    return !selectedPointId && selectedTrendId === getRestingTrendId()
  }

  // Single-show charts return to their full-series summary. Coordinated views
  // may reserve that resting state for page-level comparison context.
  function selectSeriesTrend({ announce = false } = {}) {
    hasUserInteracted = true
    clearProviderRatingState()
    clearComparisonState()
    cancelTrendHover()
    clearPointHover()
    selectedPointId = null
    hoverTrendId = null
    selectedTrendId = getRestingTrendId()
    cancelScheduledDetailLoad()
    if (announce) {
      const summary = getTrendSummary(selectedTrendId)
      announceSelection(summary ? { summary } : null)
    }
    render()
    notifySelectionChange()
  }

  function clearSelectionFromBackground() {
    hasUserInteracted = true
    if (options.onClearSelectionRequest?.() === true) {
      return
    }
    selectSeriesTrend()
  }

  function toggleSeriesTrend() {
    hasUserInteracted = true
    if (selectedTrendId === 'series' && !selectedPointId) {
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
    if (Object.hasOwn(context, 'comparisonXMax')) {
      comparisonXMax = context.comparisonXMax
    }
    if (Object.hasOwn(context, 'sharedRatings')) {
      sharedRatings = context.sharedRatings ?? []
    }
    if (Object.hasOwn(context, 'strictPrimaryRatingSource')) {
      strictPrimaryRatingSource = Boolean(context.strictPrimaryRatingSource)
    }

    const previousPoint = getPointById(selectedPointId)
    const previousComparisonPoint = getPointById(comparisonPointId)
    const wasComparisonArmed = comparisonArmed
    const previousTrend = getTrendSummary(selectedTrendId)
    const shouldRefreshDefaultViewport = Boolean(
      viewport && !hasUserInteracted && !options.externalViewportFollower
    )
    currentSeasons = nextSeasons
    model = createModel(currentSeasons)
    notifyPrimaryRatingSource()
    hoveredProviderRating = null
    hoveredComparisonRatingSource = null
    failedDetailPointIds.clear()
    if (hoverPointId && !getPointById(hoverPointId)) {
      clearPointHover()
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

    const anchorSurvived = Boolean(
      previousPoint && getPointById(previousPoint.id)?.id === selectedPointId
    )
    if (!anchorSurvived) {
      clearComparisonState()
    } else if (previousComparisonPoint) {
      const survivingComparisonPoint = getPointById(previousComparisonPoint.id)
      if (
        survivingComparisonPoint &&
        survivingComparisonPoint.id !== selectedPointId
      ) {
        comparisonPointId = survivingComparisonPoint.id
        comparisonArmed = wasComparisonArmed
      } else {
        comparisonPointId = null
        comparisonArmed = wasComparisonArmed
      }
    } else {
      comparisonPointId = null
      comparisonArmed = wasComparisonArmed
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
    if (
      selectedComparisonRatingSource &&
      resolveComparisonProviderRatings(selectedComparisonRatingSource)
        .length !== 2
    ) {
      selectedComparisonRatingSource = null
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

  function getTrendInteractions() {
    const activeTrendId = getActiveTrendId()
    const comparison = getComparisonSummary()
    return {
      activeTrendId,
      comparisonRange: comparison
        ? {
            start: comparison.earlier.point.x,
            end: comparison.later.point.x
          }
        : null,
      hoverEnabled: finePointerQuery.matches && !isComparisonMode(),
      hitTolerance: coarsePointerQuery.matches ? 14 : 7,
      onHover: previewTrend,
      onLeave() {
        clearTrendHover({ rerender: true })
      },
      onSelect(trendline) {
        if (trendline) {
          setSelectedTrend(trendline.id)
        } else {
          clearSelectionFromBackground()
        }
      },
      shouldSuppressClick: () =>
        gestureController?.shouldSuppressClick() ?? false
    }
  }

  function getPointInteractions(activeProviderRatings) {
    const comparison = getComparisonSummary()
    const selectedPointIds = comparison
      ? [comparison.earlier.point.id, comparison.later.point.id]
      : comparisonArmed
        ? [selectedPointId, comparisonPointId].filter(Boolean)
        : []
    return {
      activePointId: getActivePoint()?.id ?? null,
      selectedPointIds,
      comparisonRange: comparison
        ? {
            start: comparison.earlier.point.x,
            end: comparison.later.point.x
          }
        : null,
      activeRatingSource: activeProviderRatings[0]?.rating.source ?? null,
      hoverEnabled: finePointerQuery.matches && !isComparisonMode(),
      totalSeasons: model.totalSeasons,
      onHover(point) {
        if (gestureController?.isScrubbing()) {
          return
        }
        cancelTrendHover()
        hoverTrendId = null
        if (hoverPointId !== point.id) {
          hoverPointId = point.id
          notifyPointHoverChange(point)
        }
        updateDetail(point, { load: true })
        render()
      },
      onLeave(pointId) {
        if (hoverPointId === pointId) {
          clearPointHover({ rerender: true })
        }
      },
      onSelect(point, event) {
        clearPointHover()
        selectPointFromPointer(point, event)
      },
      shouldSuppressClick: () =>
        gestureController?.shouldSuppressClick() ?? false
    }
  }

  function getSeasonAxisInteractions() {
    const activeTrend = getTrendSummary(getActiveTrendId())
    const selectedTrend = getTrendSummary(selectedTrendId)
    const comparison = getComparisonSummary()
    return {
      activeSeasonNumber:
        activeTrend?.kind === 'season' ? activeTrend.seasonNumber : null,
      selectedSeasonNumber:
        selectedTrend?.kind === 'season' ? selectedTrend.seasonNumber : null,
      comparisonRange: comparison
        ? {
            start: comparison.earlier.point.x,
            end: comparison.later.point.x
          }
        : null,
      hoverEnabled: finePointerQuery.matches && !isComparisonMode(),
      isSelectable(seasonNumber) {
        return Boolean(getTrendSummary(`season:${seasonNumber}`))
      },
      onEnter(seasonNumber) {
        if (!suppressStationaryHover) {
          previewSeasonTrend(seasonNumber)
        }
      },
      onHover(seasonNumber) {
        previewSeasonTrend(seasonNumber)
      },
      onLeave(seasonNumber) {
        const trendId = `season:${seasonNumber}`
        if (hoverTrendId === trendId || pendingTrendHoverId === trendId) {
          clearTrendHover({ rerender: true })
        }
      },
      onSelect: selectSeasonTrend,
      shouldSuppressClick: () =>
        gestureController?.shouldSuppressClick() ?? false
    }
  }

  function previewSeasonTrend(seasonNumber) {
    previewTrend(
      seasonNumber == null ? null : getTrendSummary(`season:${seasonNumber}`),
      { immediate: true }
    )
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
    const comparison = getComparisonSummary()
    const selectedPoints = comparison
      ? [comparison.earlier.point, comparison.later.point]
      : activePoint
        ? [activePoint]
        : []
    const activeProviderRatings = getActiveProviderRatings()

    const scaleOptions = {
      absoluteYAxis: uiSettings.absoluteYAxis,
      showSourceSpread: uiSettings.showSourceSpread,
      ...getHorizontalScaleOptions()
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
        additionalRatings: [
          ...sharedRatings,
          ...activeProviderRatings.map(({ rating }) => rating.rating)
        ]
      }
    )
    const sparklineScales = createSparklineScales(
      model,
      {
        width: chartWidth,
        height: sparklineHeight
      },
      { ...scaleOptions, additionalRatings: sharedRatings }
    )
    const visiblePoints = getVisiblePoints(model, viewport)
    const [displayStart, displayEnd] = mainScales.xScale.domain()
    const displayViewport = { start: displayStart, end: displayEnd }

    // Preserve native vertical page scrolling while keeping horizontal pan and
    // the chart's custom pinch gesture available on every touch-capable layout.
    bodyShell.style.touchAction = 'pan-y'

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
      visiblePoints,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      {
        visible: uiSettings.showSourceSpread,
        activePointIds: selectedPoints.map((point) => point.id)
      }
    )
    renderCrosshair(
      mainSvg,
      selectedPoints,
      mainScales,
      { width: chartWidth, height: chartHeight },
      chartTheme,
      uiSettings.showSourceSpread,
      gestureController?.isScrubbing() ? scrubX : comparisonCursorX
    )
    renderPoints(
      mainSvg,
      visiblePoints,
      mainScales,
      chartTheme,
      getPointInteractions(activeProviderRatings)
    )
    renderProviderRatingPreview(
      mainSvg,
      visiblePoints,
      activeProviderRatings,
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

    publishDensityMetrics({
      chartSlotWidth: getSlotWidth(mainScales.xScale),
      sparklineSlotWidth: getSlotWidth(sparklineScales.xScale)
    })

    if (!options.hideOverview) {
      renderSparkline(
        chartTheme,
        sparklineScales,
        displayViewport,
        chartWidth,
        sparklineHeight,
        (nextDisplayViewport) => {
          hasUserInteracted = true
          viewport = clampViewport(
            resolveViewportFromDisplay(
              model,
              nextDisplayViewport,
              chartWidth,
              getHorizontalScaleOptions()
            ),
            model
          )
          render()
        },
        () => {
          hasUserInteracted = true
          resetViewportWidth(chartWidth)
        }
      )
    }
  }

  // Lets the mark scaling panel show where the current view sits on the ramp.
  function publishDensityMetrics(nextMetrics) {
    if (
      densityMetrics &&
      densityMetrics.chartSlotWidth === nextMetrics.chartSlotWidth &&
      densityMetrics.sparklineSlotWidth === nextMetrics.sparklineSlotWidth
    ) {
      return
    }

    densityMetrics = nextMetrics
    document.dispatchEvent(
      new CustomEvent('graphtv:chart-density', { detail: densityMetrics })
    )
  }

  function renderSparkline(
    chartTheme,
    sparklineScales,
    displayViewport,
    width,
    height,
    onViewportChange,
    onViewportReset
  ) {
    const selection = getOverviewSelection()
    if (!sparkline) {
      sparkline = createSparkline(sparklineSvg, {
        model,
        viewport,
        displayViewport,
        theme: chartTheme,
        dimensions: { width, height },
        scales: sparklineScales,
        selection,
        onViewportChange,
        onViewportReset
      })
      return
    }

    sparkline.render({
      model,
      viewport,
      displayViewport,
      theme: chartTheme,
      dimensions: { width, height },
      scales: sparklineScales,
      selection,
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
    if (!options.hideSourceStatus) {
      renderSourceStatus(sourceStatus, model, {
        helpDismissed: sourceHelpDismissed,
        touchOnly: coarsePointerQuery.matches && !finePointerQuery.matches
      })
    }

    renderChart(chartTheme, axisWidth, chartWidth, chartHeight, sparklineHeight)

    const activePoint = getActivePoint()
    if (activePoint) {
      const scale = createMainScales(
        model,
        viewport,
        {
          width: chartWidth,
          height: chartHeight
        },
        getHorizontalScaleOptions()
      ).xScale
      shell.style.setProperty(
        '--reading-pane-marker',
        `${scale(activePoint.x)}px`
      )
    }
    updateActiveDetail()
    notifyViewportChange()
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
  sourceDismiss.addEventListener('click', (event) => {
    sourceHelpDismissed = true
    persistSourceHelpDismissal()
    sourceStatus.hidden = true
    if (event.detail === 0) {
      mainSvg.node()?.focus({ preventScroll: true })
    }
  })

  function getScrubTarget(clientX) {
    if (!viewport) {
      return null
    }

    const chartWidth = getCurrentChartWidth()
    const { chartHeight } = getChartDimensions()
    const xScale = createMainScales(
      model,
      viewport,
      {
        width: chartWidth,
        height: chartHeight
      },
      getHorizontalScaleOptions()
    ).xScale
    const localX = getEventXRatio({ clientX }, bodyShell) * chartWidth
    const dataX = clamp(xScale.invert(localX), viewport.start, viewport.end)

    return {
      x: dataX,
      point: getVisibleRatedPoints(model, viewport).reduce((nearest, point) => {
        if (point.x < viewport.start || point.x > viewport.end) {
          return nearest
        }
        return !nearest ||
          Math.abs(point.x - dataX) < Math.abs(nearest.x - dataX)
          ? point
          : nearest
      }, null)
    }
  }

  function updateScrubPreview(clientX, { force = false } = {}) {
    const target = getScrubTarget(clientX)
    const nextPointId = target?.point?.id ?? null
    const nextX = target?.x ?? null
    if (!force && nextPointId === scrubPointId && nextX === scrubX) {
      return
    }

    scrubPointId = nextPointId
    scrubX = nextX
    render()
  }

  function clearScrubPreview() {
    scrubPointId = null
    scrubX = null
    cancelScheduledDetailLoad()
  }

  gestureController = createChartGestureController({
    bodyShell,
    getModel: () => model,
    getViewport: () => viewport,
    setViewport(nextViewport) {
      viewport = nextViewport
    },
    onInteraction() {
      hasUserInteracted = true
    },
    onClearTrendHover() {
      clearTrendHover({ rerender: true })
    },
    onPrepareScrub() {
      cancelTrendHover()
      clearPointHover()
      hoverTrendId = null
      hoveredProviderRating = null
    },
    onScrubPreview: updateScrubPreview,
    onClearScrubPreview: clearScrubPreview,
    onCommitScrub() {
      const point = getPointById(scrubPointId)
      clearScrubPreview()
      if (point) {
        setSelectedPoint(point, 'pointer', { follow: false })
      } else {
        render()
      }
    },
    onRender: render,
    onViewportSettled: announceViewport
  })
  bodyShell.addEventListener('click', (event) => {
    hasUserInteracted = true
    if (gestureController?.shouldSuppressClick()) {
      return
    }

    if (event.shiftKey) {
      return
    }

    if (event.target.closest('.episode-point, .episode-point-hit')) {
      return
    }

    clearSelectionFromBackground()
  })

  function handleDocumentMouseMove(event) {
    if (!finePointerQuery.matches || gestureController?.isScrubbing()) {
      return
    }

    const target = event.target
    const isInteractiveChartTarget =
      bodyShell.contains(target) &&
      target.closest?.(
        '.episode-point, .episode-point-hit, .episode-point-hit-batch, .season-axis-label, .chart-hit-surface'
      )
    if (isInteractiveChartTarget) {
      return
    }

    clearChartHover({ rerender: true })
  }

  document.addEventListener('mousemove', handleDocumentMouseMove)

  function handleDocumentScroll() {
    suppressStationaryHover = true
    if (scrollHoverSuppressionTimer) {
      clearTimeout(scrollHoverSuppressionTimer)
    }
    scrollHoverSuppressionTimer = setTimeout(() => {
      scrollHoverSuppressionTimer = null
      suppressStationaryHover = false
    }, SCROLL_HOVER_SUPPRESSION_MS)
  }

  window.addEventListener('scroll', handleDocumentScroll, { passive: true })

  const resizeObserver = new ResizeObserver(() => {
    render()
  })
  resizeObserver.observe(container)

  const settingsListener = () => {
    const nextEpisodeDensity = getUiSettings().episodeDensity
    const densityChanged = nextEpisodeDensity !== episodeDensity
    episodeDensity = nextEpisodeDensity
    let selectionChanged = false

    if (selectedTrendId && !isTrendEnabled(selectedTrendId)) {
      const previousTrend = getTrendSummary(selectedTrendId)
      selectedTrendId = null
      const nextPoint = getFirstRatedPointInScope(previousTrend)
      selectedPointId = nextPoint?.id ?? null
      hasUserInteracted = true
      selectionChanged = true
      if (nextPoint) {
        announceSelection({ point: nextPoint })
      }
    }
    if (hoverTrendId && !isTrendEnabled(hoverTrendId)) {
      hoverTrendId = null
    }

    if (densityChanged) {
      if (options.externalViewportFollower) {
        render()
        return
      }
      resetViewportWidth(getCurrentChartWidth(), getKeyboardViewportAnchor())
      if (selectionChanged) {
        notifySelectionChange()
      }
      return
    }
    render()
    if (selectionChanged) {
      notifySelectionChange()
    }
  }

  ensureViewport(getCurrentChartWidth())
  resolveDefaultSelection()
  restoreInitialSelection()
  render()
  notifyPrimaryRatingSource()
  document.addEventListener('graphtv:settings-change', settingsListener)

  return {
    getDensityMetrics: () => densityMetrics,
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
    toggleComparison,
    commitComparison,
    selectSeriesBreakpoint,
    setPrimaryRatingSource,
    cyclePrimaryRatingSource,
    selectNearestEpisode(x) {
      if (!Number.isFinite(x)) {
        return false
      }
      const point = getNearestRatedPointToX(x)
      if (!point) {
        return false
      }
      setSelectedPoint(point)
      return true
    },
    setComparisonCursor(x) {
      const nextX = Number.isFinite(x) ? x : null
      if (comparisonCursorX === nextX) {
        return false
      }
      comparisonCursorX = nextX
      render()
      return true
    },
    setViewport(nextViewport, { announce = false } = {}) {
      if (!nextViewport) {
        return false
      }
      const next = clampViewport(nextViewport, model)
      if (viewport?.start === next.start && viewport?.end === next.end) {
        return false
      }
      viewport = next
      render()
      if (announce) {
        announceViewport()
      }
      return true
    },
    clearSelection() {
      hasUserInteracted = true
      if (gestureController?.cancelScrub({ inert: true })) {
        return true
      }
      if (cancelComparison()) {
        return true
      }
      if (
        isAtRestingSelection() &&
        !hoverPointId &&
        !hoverTrendId &&
        !hoveredProviderRating &&
        !pendingTrendHoverId
      ) {
        return false
      }
      selectSeriesTrend({ announce: true })
      return true
    },
    updateSeasons,
    getSelectionContext() {
      const point = getPointById(selectedPointId)
      return {
        selection: getSelectionId(),
        x: point?.x ?? null,
        pointId: point?.id ?? null
      }
    },
    getSummary() {
      const voteCounts = model.primaryRatedPoints
        .map(
          (point) =>
            point.ratings?.find(
              (rating) => rating.source === model.primaryRatingSource
            )?.votes
        )
        .filter(Number.isFinite)
      return {
        totalEpisodes: model.points.length,
        ratedEpisodes: model.primaryRatedPoints.length,
        primarySource: model.primaryRatingSource,
        coverage: model.ratingSourceCoverage,
        medianVotes: medianNumber(voteCounts),
        series: model.trendSummaries.series ?? null,
        breakpoint: model.seriesBreakpoint ?? null
      }
    },
    getDebugState() {
      return {
        selectedPointId,
        comparison: {
          armed: comparisonArmed,
          pointId: comparisonPointId,
          committed: isComparisonCommitted()
        },
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
      gestureController?.destroy()
      cancelScheduledDetailLoad()
      cancelTrendHover()
      if (viewportAnnouncementTimer) {
        clearTimeout(viewportAnnouncementTimer)
      }
      if (selectionAnnouncementTimer) {
        clearTimeout(selectionAnnouncementTimer)
      }
      if (scrollHoverSuppressionTimer) {
        clearTimeout(scrollHoverSuppressionTimer)
      }
      loadingDetailPointIds.clear()
      failedDetailPointIds.clear()
      resizeObserver.disconnect()
      document.removeEventListener('graphtv:settings-change', settingsListener)
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      window.removeEventListener('scroll', handleDocumentScroll)
      bodyShell.removeEventListener('wheel', handleBodyWheel)
      sparklineSvg.removeEventListener('wheel', handleSparklineWheel)
      sparkline?.destroy()
      sidenote.destroy()
      options.loadEpisodeDetails?.destroy?.()
      container.innerHTML = ''
    }
  }
}

function getEpisodeNumber(point) {
  return point.episode ?? point.number
}

function formatEpisodeCode(point) {
  const episodeNumber = getEpisodeNumber(point)
  return `S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
}

function formatSignedRatingDelta(value) {
  const magnitude = Math.abs(value).toFixed(1)
  return value >= 0 ? `plus ${magnitude}` : `minus ${magnitude}`
}

function meanPointRating(points) {
  return points.reduce((sum, point) => sum + point.rating, 0) / points.length
}

function medianNumber(values) {
  if (values.length === 0) {
    return null
  }
  const ordered = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(ordered.length / 2)
  return ordered.length % 2
    ? ordered[midpoint]
    : (ordered[midpoint - 1] + ordered[midpoint]) / 2
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

function renderSourceStatus(
  root,
  model,
  { helpDismissed = false, touchOnly = false } = {}
) {
  const text = root.querySelector('[data-chart-source-status-text]')
  const dismiss = root.querySelector('[data-chart-source-dismiss]')
  root.hidden = false
  if (!model.primaryRatingSource) {
    dismiss.hidden = true
    setTextContent(text, 'No usable episode ratings.')
    return
  }

  dismiss.hidden = helpDismissed
  root.hidden = helpDismissed
  setTextContent(
    text,
    touchOnly
      ? 'Swipe to pan; hold, then drag to scan. Pinch to zoom.'
      : 'Drag chart to scan. Use the overview to pan or resize; Ctrl-scroll or pinch to zoom.'
  )
}

function setTextContent(element, value) {
  if (element.textContent !== value) {
    element.textContent = value
  }
}

function readSourceHelpDismissed() {
  try {
    return (
      globalThis.sessionStorage?.getItem(CHART_HELP_DISMISSED_KEY) === 'true'
    )
  } catch {
    return false
  }
}

function persistSourceHelpDismissal() {
  try {
    globalThis.sessionStorage?.setItem(CHART_HELP_DISMISSED_KEY, 'true')
  } catch {
    // The current chart still remembers the dismissal when storage is blocked.
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
