import {
  createEpisodeDetailLoader,
  getComparisonProviders,
  getProviderCatalog,
  parseShowRef,
  streamShowBundle
} from '../data/provider.js'
import {
  COMPARISON_SLOT_IDS,
  formatComparisonSelections,
  getComparisonEpisodeCount,
  getComparisonRatings,
  parseComparisonSelections,
  selectComparisonRatingSource
} from '../data/comparison.js'
import {
  getRatingSourceLabel,
  orderVisibleRatings
} from '../data/ratingProviders.js'
import { isUsableProviderRating } from '../data/stats.js'
import { buildUrl, getUrlParams, preserveDebugParams } from '../lib/url.js'
import { escapeHtml } from '../lib/html.js'
import { formatCompactNumber } from '../lib/number.js'
import { forwardAbort, isAbortError } from '../lib/abort.js'
import { createChart } from '../viz/ratingsChart.js'
import { createShowPicker } from '../ui/showPicker.js'
import { renderError, renderLoading, renderPublisherBrand } from './shared.js'

export async function renderComparisonPage(
  container,
  showRef,
  comparisonRef,
  options = {}
) {
  const {
    bundleStream = streamShowBundle,
    chartFactory = createChart,
    detailLoaderFactory = createEpisodeDetailLoader
  } = options
  const initialSelections = parseComparisonSelections(
    getUrlParams().get('select')
  )
  const initialSelectionBySlot = Object.fromEntries(
    initialSelections.map(({ slot, selection }) => [slot, selection])
  )
  const abortController = new AbortController()
  const stopForwardingAbort = forwardAbort(options.signal, abortController)
  const slots = {
    a: createSlotState('a', showRef),
    b: createSlotState('b', comparisonRef)
  }
  let destroyed = false
  let syncingViewport = false
  let syncingSelection = false
  let sharedViewport = null
  let activeSlot = initialSelections.at(-1)?.slot ?? 'a'
  let selectedSharedSource = null
  let comparePicker = null
  let pickerSlot = 'b'
  let preserveNextSelection = false
  let multiSelectArmed = false
  let hoveredComparisonPoint = null
  const activeDetailStates = {
    a: createComparisonDetailState(initialSelectionBySlot.a ?? 'series'),
    b: createComparisonDetailState(initialSelectionBySlot.b ?? 'series')
  }

  container.innerHTML = renderComparisonShell(showRef)
  const comparisonRoot = container.querySelector('.comparison-data')

  function activateSlot(slot) {
    if (!COMPARISON_SLOT_IDS.includes(slot)) {
      return
    }
    activeSlot = slot
    for (const candidate of COMPARISON_SLOT_IDS) {
      const lane = container.querySelector(
        `.comparison-lane[data-comparison-slot="${candidate}"]`
      )
      lane?.classList.toggle('is-active', candidate === slot)
    }
    updateComparisonReadingState()
  }

  function updateComparisonReadingState() {
    const resting = isComparisonRestingState(activeDetailStates[activeSlot])
    const selectedSlots = getSelectedEpisodeSlots(activeDetailStates)
    const headToHead = selectedSlots.length === 2
    const context = container.querySelector('.comparison-context')
    const detail = container.querySelector('.comparison-detail')
    const headToHeadRoot = container.querySelector('.comparison-head-to-head')
    const multiSelectAction = container.querySelector(
      '.cross-show-multiselect-action'
    )
    const readingPane = container.querySelector('.comparison-reading-pane')

    if (context) {
      context.hidden = !resting || headToHead
    }
    if (detail) {
      detail.hidden = resting || headToHead
    }
    if (headToHeadRoot) {
      headToHeadRoot.hidden = !headToHead
      headToHeadRoot.innerHTML = headToHead
        ? renderCrossShowEpisodeComparison(slots, activeDetailStates)
        : ''
    }
    if (readingPane) {
      readingPane.dataset.readingMode = headToHead
        ? 'head-to-head'
        : resting
          ? 'comparison'
          : 'selection'
    }
    if (multiSelectAction) {
      const otherSlot = activeSlot === 'a' ? 'b' : 'a'
      const canCompare =
        !headToHead && activeDetailStates[activeSlot]?.kind === 'point'
      multiSelectAction.hidden = !canCompare
      multiSelectAction.classList.toggle('is-armed', multiSelectArmed)
      const button = multiSelectAction.querySelector('button')
      const status = multiSelectAction.querySelector('span')
      if (button) {
        button.textContent = multiSelectArmed
          ? 'Cancel head-to-head'
          : `Compare with ${slots[otherSlot].show?.title ?? 'the other show'}`
      }
      if (status) {
        status.textContent = multiSelectArmed
          ? `Choose an episode from ${slots[otherSlot].show?.title ?? 'the other show'}.`
          : 'Shift-click also adds an episode from the other show.'
      }
    }
    for (const candidate of COMPARISON_SLOT_IDS) {
      const slotDetail = container.querySelector(
        `[data-comparison-detail="${candidate}"]`
      )
      if (slotDetail) {
        slotDetail.hidden = resting || headToHead || candidate !== activeSlot
      }
    }
  }

  function openComparePicker(slot = 'b') {
    if (!COMPARISON_SLOT_IDS.includes(slot)) {
      return false
    }
    pickerSlot = slot
    comparePicker?.destroy()
    const root = container.querySelector('.show-picker-root')
    const { provider } = parseShowRef(slots[slot].ref)
    comparePicker = createShowPicker(root, {
      provider,
      excludedRefs: COMPARISON_SLOT_IDS.map(
        (candidate) => slots[candidate].ref
      ),
      onSelect(nextShowRef) {
        const params = getUrlParams()
        if (pickerSlot === 'a') {
          params.set('show', nextShowRef)
        } else {
          params.set('vs', nextShowRef)
        }
        params.delete('select')
        window.location.href = buildUrl(params)
      },
      onClose() {
        container
          .querySelector(
            `[data-comparison-action="replace"][data-comparison-slot="${pickerSlot}"]`
          )
          ?.focus({ preventScroll: true })
      }
    })
    comparePicker.open()
    return true
  }

  function syncViewport(sourceSlot, nextViewport) {
    if (syncingViewport || destroyed) {
      return
    }
    sharedViewport = nextViewport
    syncingViewport = true
    for (const slot of COMPARISON_SLOT_IDS) {
      if (slot !== sourceSlot) {
        slots[slot].chart?.setViewport(nextViewport)
      }
    }
    syncingViewport = false
  }

  function syncSelection(slot, selection, selectionContext = {}) {
    if (syncingSelection || destroyed) {
      return
    }
    const otherSlot = slot === 'a' ? 'b' : 'a'
    const hadHeadToHead =
      getSelectedEpisodeSlots(activeDetailStates).length === 2
    const nextState = createComparisonDetailState(selection, selectionContext)
    const preserveOther =
      nextState.kind === 'point' &&
      activeDetailStates[otherSlot]?.kind === 'point' &&
      (hadHeadToHead || preserveNextSelection || multiSelectArmed)
    preserveNextSelection = false
    activeDetailStates[slot] = nextState

    syncingSelection = true
    if (nextState.kind === 'point' && !preserveOther) {
      activeDetailStates[otherSlot] = createComparisonDetailState('none')
      slots[otherSlot].chart?.clearSelection()
    } else if (
      nextState.kind !== 'point' &&
      !isComparisonRestingState(nextState)
    ) {
      activeDetailStates[otherSlot] = createComparisonDetailState('none')
      slots[otherSlot].chart?.clearSelection()
    }
    syncingSelection = false

    if (getSelectedEpisodeSlots(activeDetailStates).length === 2) {
      multiSelectArmed = false
    } else if (
      isComparisonRestingState(nextState) &&
      activeDetailStates[otherSlot]?.kind === 'point'
    ) {
      multiSelectArmed = false
      slot = otherSlot
    }

    activateSlot(slot)
    syncComparisonMarkers()
    syncSelectionUrl()
  }

  function clearAllComparisonSelections() {
    if (syncingSelection || destroyed) {
      return false
    }

    preserveNextSelection = false
    multiSelectArmed = false
    for (const slot of COMPARISON_SLOT_IDS) {
      activeDetailStates[slot] = createComparisonDetailState('none')
    }

    syncingSelection = true
    for (const slot of COMPARISON_SLOT_IDS) {
      slots[slot].chart?.clearSelection()
    }
    syncingSelection = false

    syncComparisonMarkers()
    syncSelectionUrl()
    activateSlot(activeSlot)
    return true
  }

  function syncSelectionUrl() {
    const params = getUrlParams()
    const serializedSelection = formatComparisonSelections(
      COMPARISON_SLOT_IDS.filter(
        (candidate) => !isComparisonRestingState(activeDetailStates[candidate])
      ).map((candidate) => ({
        slot: candidate,
        selection: activeDetailStates[candidate].selection
      }))
    )
    if (!serializedSelection) {
      params.delete('select')
    } else {
      params.set('select', serializedSelection)
    }
    window.history.replaceState(window.history.state, '', buildUrl(params))
  }

  function syncComparisonMarkers() {
    const selectedSlots = getSelectedEpisodeSlots(activeDetailStates)
    const singleSelection =
      selectedSlots.length === 1 ? activeDetailStates[selectedSlots[0]] : null
    for (const slot of COMPARISON_SLOT_IDS) {
      const cursorX = hoveredComparisonPoint
        ? slot === hoveredComparisonPoint.slot
          ? null
          : hoveredComparisonPoint.x
        : singleSelection && slot !== selectedSlots[0]
          ? singleSelection.x
          : null
      slots[slot].chart?.setComparisonCursor?.(cursorX)
    }
  }

  function syncPointHover(slot, hoverContext = {}) {
    if (destroyed) {
      return
    }

    if (Number.isFinite(hoverContext.x)) {
      hoveredComparisonPoint = { slot, x: hoverContext.x }
    } else if (hoveredComparisonPoint?.slot === slot) {
      hoveredComparisonPoint = null
    } else {
      return
    }
    syncComparisonMarkers()
  }

  function getResolvedComparisonState() {
    const availableBundles = Object.fromEntries(
      COMPARISON_SLOT_IDS.filter((slot) => slots[slot].bundle).map((slot) => [
        slot,
        slots[slot].bundle
      ])
    )
    const allReady = COMPARISON_SLOT_IDS.every((slot) => availableBundles[slot])
    const sourceState = allReady
      ? selectComparisonRatingSource({
          a: availableBundles.a.seasons,
          b: availableBundles.b.seasons
        })
      : null

    if (
      sourceState?.availableSources.length &&
      !sourceState.availableSources.includes(selectedSharedSource)
    ) {
      selectedSharedSource = sourceState.source
    }

    const xMax = Math.max(
      1,
      ...COMPARISON_SLOT_IDS.map((slot) =>
        getComparisonEpisodeCount(availableBundles[slot]?.seasons)
      )
    )
    const sourceBySlot = Object.fromEntries(
      COMPARISON_SLOT_IDS.map((slot) => [
        slot,
        allReady
          ? (selectedSharedSource ?? sourceState.fallbackSources[slot])
          : null
      ])
    )
    const sharedRatings = COMPARISON_SLOT_IDS.flatMap((slot) => {
      const bundle = availableBundles[slot]
      return bundle
        ? getComparisonRatings(bundle.seasons, sourceBySlot[slot])
        : []
    })

    return {
      allReady,
      comparable: Boolean(allReady && selectedSharedSource),
      sourceState,
      sourceBySlot,
      sharedRatings,
      xMax
    }
  }

  function syncCharts() {
    const comparison = getResolvedComparisonState()

    for (const slot of COMPARISON_SLOT_IDS) {
      const state = slots[slot]
      if (!state.bundle) {
        continue
      }
      const source = comparison.sourceBySlot[slot]
      const chartContext = {
        show: state.bundle.show,
        primaryRatingSource: source,
        comparisonXMax: comparison.xMax,
        sharedRatings: comparison.sharedRatings,
        strictPrimaryRatingSource: true
      }

      if (state.chart) {
        state.chart.updateSeasons(state.bundle.seasons, chartContext)
        continue
      }

      const chartRoot = container.querySelector(
        `[data-comparison-chart="${slot}"]`
      )
      const slotDetailRoot = container.querySelector(
        `[data-comparison-detail="${slot}"]`
      )
      const episodeDetailLoader = detailLoaderFactory({
        expectedSeriesId: state.bundle.show.externalIds.imdb,
        primarySource: state.bundle.primarySource
      })
      syncingViewport = true
      state.chart = chartFactory(chartRoot, state.bundle.seasons, {
        ...chartContext,
        detailRoot: slotDetailRoot,
        initialSelection: initialSelectionBySlot[slot],
        loadEpisodeDetails: episodeDetailLoader,
        allowEpisodeComparison: false,
        compact: true,
        restingSelection: 'none',
        hideSourceStatus: slot === 'b',
        externalViewportFollower: slot === 'b',
        ariaLabel: `Episode ratings, ${state.bundle.show.title}`,
        selectionLabel: state.bundle.show.title,
        formatViewportAnnouncement: (viewport) =>
          formatComparisonViewportAnnouncement(viewport, slots),
        onSelectionContextChange: ({ selection, ...selectionContext }) =>
          syncSelection(slot, selection, selectionContext),
        onPointHoverContextChange: (hoverContext) =>
          syncPointHover(slot, hoverContext),
        onClearSelectionRequest: clearAllComparisonSelections,
        onViewportChange: (viewport) => syncViewport(slot, viewport)
      })
      attachComparisonOverview(container, chartRoot, state)
      if (sharedViewport) {
        state.chart.setViewport(sharedViewport)
      } else {
        sharedViewport = state.chart.getDebugState?.().viewport ?? null
      }
      if (initialSelectionBySlot[slot]) {
        const selectionContext = state.chart.getSelectionContext?.() ?? {}
        activeDetailStates[slot] = createComparisonDetailState(
          selectionContext.selection ?? 'none',
          selectionContext
        )
        initialSelectionBySlot[slot] = null
        syncSelectionUrl()
      }
      syncingViewport = false
    }

    updateComparisonPresentation(container, slots, comparison)
    syncComparisonMarkers()
    activateSlot(activeSlot)
  }

  async function loadSlot(slot) {
    const state = slots[slot]
    try {
      const { provider } = parseShowRef(state.ref)
      const progress = bundleStream(state.ref, {
        compareProviders:
          options.compareProviders?.[slot] ?? getComparisonProviders(provider),
        providerLoader: options.providerLoader,
        signal: abortController.signal
      })
      state.iterator = progress[Symbol.asyncIterator]()

      while (true) {
        const next = await state.iterator.next()
        if (next.done) {
          state.complete = true
          state.resolveReady()
          break
        }
        const snapshot = next.value
        state.show = snapshot.show ?? snapshot.bundle?.show ?? state.show
        state.bundle = snapshot.bundle ?? state.bundle
        state.complete = Boolean(snapshot.complete)
        state.pendingProviders = snapshot.pendingProviders ?? []
        renderSlotState(container, state)
        updateComparisonPresentation(
          container,
          slots,
          getResolvedComparisonState()
        )
        if (state.bundle) {
          syncCharts()
          state.resolveReady()
          break
        }
      }

      while (!state.complete) {
        const next = await state.iterator.next()
        if (next.done) {
          state.complete = true
          break
        }
        const snapshot = next.value
        state.show = snapshot.show ?? snapshot.bundle?.show ?? state.show
        state.bundle = snapshot.bundle ?? state.bundle
        state.complete = Boolean(snapshot.complete)
        state.pendingProviders = snapshot.pendingProviders ?? []
        renderSlotState(container, state)
        syncCharts()
      }
    } catch (error) {
      if (!isAbortError(error) && !destroyed) {
        state.error = error
        state.complete = true
        renderSlotState(container, state)
        syncCharts()
        if (!state.chart && initialSelectionBySlot[slot]) {
          initialSelectionBySlot[slot] = null
          syncSelection(slot, 'none')
        }
      }
      state.resolveReady()
    }
  }

  function toggleCrossShowComparison() {
    const selectedSlots = getSelectedEpisodeSlots(activeDetailStates)
    if (multiSelectArmed) {
      multiSelectArmed = false
      updateComparisonReadingState()
      return true
    }
    if (selectedSlots.length === 2) {
      const removeSlot = activeSlot === 'a' ? 'b' : 'a'
      slots[removeSlot].chart?.clearSelection()
      return true
    }
    if (selectedSlots.length !== 1) {
      return false
    }
    activateSlot(selectedSlots[0])
    multiSelectArmed = true
    updateComparisonReadingState()
    return true
  }

  function handleComparisonClick(event) {
    const lane = event.target.closest?.(
      '.comparison-lane[data-comparison-slot]'
    )
    if (lane) {
      const nextSlot = lane.dataset.comparisonSlot
      const otherSlot = nextSlot === 'a' ? 'b' : 'a'
      const pointTarget = event.target.closest?.(
        '.episode-point, .episode-point-hit, .episode-point-hit-batch'
      )
      preserveNextSelection = Boolean(
        event.shiftKey &&
        pointTarget &&
        activeDetailStates[otherSlot]?.kind === 'point'
      )
      activateSlot(nextSlot)
    }

    if (event.type !== 'click') {
      return
    }

    const action = event.target.closest?.('[data-comparison-action]')
    if (!action) {
      return
    }
    const slot = action.dataset.comparisonSlot
    if (action.dataset.comparisonAction === 'head-to-head') {
      toggleCrossShowComparison()
      return
    }
    if (action.dataset.comparisonAction === 'remove-episode') {
      activateSlot(slot)
      slots[slot].chart?.clearSelection()
      return
    }
    if (action.dataset.comparisonAction === 'open-alone') {
      window.location.href = buildSingleShowHref(slots[slot].ref)
      return
    }
    if (action.dataset.comparisonAction === 'remove') {
      const survivor = slot === 'a' ? slots.b.ref : slots.a.ref
      window.location.href = buildSingleShowHref(survivor)
      return
    }
    if (action.dataset.comparisonAction === 'replace') {
      openComparePicker(slot)
      return
    }
    if (action.dataset.comparisonAction === 'retry') {
      const state = slots[slot]
      state.chart?.destroy()
      container
        .querySelector(
          `.comparison-overview-row[data-comparison-slot="${slot}"]`
        )
        ?.remove()
      state.chart = null
      state.bundle = null
      state.error = null
      state.complete = false
      const chartRoot = container.querySelector(
        `[data-comparison-chart="${slot}"]`
      )
      if (chartRoot) {
        chartRoot.innerHTML = renderLoading('Loading episode ratings…', {
          announce: false
        })
      }
      renderSlotState(container, state)
      void loadSlot(slot)
    }
  }

  comparisonRoot.addEventListener('pointerdown', handleComparisonClick)
  container.addEventListener('click', handleComparisonClick)
  renderSlotState(container, slots.a)
  renderSlotState(container, slots.b)

  const loadingTasks = COMPARISON_SLOT_IDS.map((slot) => loadSlot(slot))
  const whenSettled = Promise.all(loadingTasks)

  await Promise.all(COMPARISON_SLOT_IDS.map((slot) => slots[slot].ready))

  syncCharts()

  const comparisonController = {
    moveEpisode: (delta) => slots[activeSlot].chart?.moveEpisode(delta),
    moveSeason: (delta) => slots[activeSlot].chart?.moveSeason(delta),
    jumpBoundary: (edge) => slots[activeSlot].chart?.jumpBoundary(edge),
    panHalfViewport: (direction) =>
      slots[activeSlot].chart?.panHalfViewport(direction),
    fitSeries: () => slots[activeSlot].chart?.fitSeries(),
    resetZoom: () => slots[activeSlot].chart?.resetZoom(),
    zoomBy: (scale) => slots[activeSlot].chart?.zoomBy(scale),
    toggleSeriesTrend: () => slots[activeSlot].chart?.toggleSeriesTrend(),
    toggleSeasonTrend: () => slots[activeSlot].chart?.toggleSeasonTrend(),
    toggleSeriesBreakpoint: () =>
      slots[activeSlot].chart?.toggleSeriesBreakpoint(),
    toggleComparison: toggleCrossShowComparison,
    commitComparison: () => false,
    clearSelection() {
      if (multiSelectArmed) {
        multiSelectArmed = false
        updateComparisonReadingState()
        return true
      }
      const cleared = slots[activeSlot].chart?.clearSelection()
      if (
        !cleared &&
        !isComparisonRestingState(activeDetailStates[activeSlot])
      ) {
        syncSelection(activeSlot, 'none')
        return true
      }
      return cleared
    },
    cyclePrimaryRatingSource() {
      const comparison = getResolvedComparisonState()
      const sources = comparison.sourceState?.availableSources ?? []
      if (sources.length < 2) {
        return false
      }
      const index = sources.indexOf(selectedSharedSource)
      selectedSharedSource = sources[(index + 1) % sources.length]
      syncCharts()
      return true
    },
    switchLane(direction) {
      const nextSlot = direction < 0 ? 'a' : 'b'
      const previousSlot = activeSlot
      const anchorState = activeDetailStates[previousSlot]
      activateSlot(nextSlot)
      if (anchorState?.kind === 'point' && nextSlot !== previousSlot) {
        preserveNextSelection = true
        if (!slots[nextSlot].chart?.selectNearestEpisode?.(anchorState.x)) {
          preserveNextSelection = false
        }
      }
      return true
    },
    getDensityMetrics: () => slots[activeSlot].chart?.getDensityMetrics?.(),
    getDebugState: () => ({
      activeSlot,
      sharedViewport,
      selectedSharedSource,
      multiSelectArmed,
      selections: activeDetailStates,
      slots: Object.fromEntries(
        COMPARISON_SLOT_IDS.map((slot) => [
          slot,
          slots[slot].chart?.getDebugState?.() ?? null
        ])
      )
    })
  }

  return {
    kind: 'comparison',
    debugEnabled: true,
    chart: comparisonController,
    whenSettled,
    openComparePicker,
    focusInitial() {
      container
        .querySelector('.comparison-title')
        ?.focus({ preventScroll: true })
    },
    goBack() {
      window.location.href = buildSingleShowHref(slots.a.ref)
    },
    focusSearch() {
      window.location.href = buildSearchHref()
    },
    getCreditsContext() {
      return {
        providers: Array.from(
          new Set(
            COMPARISON_SLOT_IDS.flatMap((slot) =>
              getLoadedProviders(slots[slot].bundle)
            )
          )
        ),
        show: slots[activeSlot].show
      }
    },
    getDebugSections() {
      return [
        { title: 'Provider catalog', data: getProviderCatalog() },
        {
          title: 'Comparison state',
          data: {
            activeSlot,
            selectedSharedSource,
            slots: Object.fromEntries(
              COMPARISON_SLOT_IDS.map((slot) => [slot, slots[slot].bundle])
            )
          }
        },
        { title: 'Chart state', data: comparisonController.getDebugState() }
      ]
    },
    destroy() {
      destroyed = true
      stopForwardingAbort()
      abortController.abort()
      comparisonRoot.removeEventListener('pointerdown', handleComparisonClick)
      container.removeEventListener('click', handleComparisonClick)
      for (const slot of COMPARISON_SLOT_IDS) {
        void slots[slot].iterator?.return?.().catch(() => {})
        slots[slot].chart?.destroy()
      }
      comparePicker?.destroy()
    }
  }
}

function createSlotState(slot, ref) {
  let readyResolved = false
  let resolveReadyPromise
  const ready = new Promise((resolve) => {
    resolveReadyPromise = resolve
  })
  return {
    slot,
    ref,
    show: null,
    bundle: null,
    pendingProviders: [],
    complete: false,
    error: null,
    chart: null,
    iterator: null,
    ready,
    resolveReady() {
      if (!readyResolved) {
        readyResolved = true
        resolveReadyPromise()
      }
    }
  }
}

function renderComparisonShell(showRef) {
  return `
    <main class="document-shell results-document comparison-document">
      <header class="masthead results-masthead">
        <div class="masthead-navigation">${renderPublisherBrand()}</div>
        <div class="masthead-meta">
          <div class="masthead-actions" aria-label="Page actions">
            <button type="button" class="masthead-action" data-ui-action="compare">Change shows (c)</button>
            <button type="button" class="masthead-action" data-ui-action="view-options">Options (o)</button>
            <button type="button" class="masthead-action" data-ui-action="help">Help (?)</button>
            <a class="back-link masthead-action" href="${escapeHtml(buildSingleShowHref(showRef))}" aria-label="Back to ${escapeHtml(showRef)}">Back (q)</a>
          </div>
        </div>
      </header>
      <header class="comparison-heading">
        <p class="eyebrow">Show comparison</p>
        <h1 class="comparison-title" tabindex="-1">Loading comparison…</h1>
        <p class="comparison-subtitle">Episode ratings in run order</p>
      </header>
      <section class="show-picker-root" aria-label="Choose a comparison show" hidden></section>
      <section class="comparison-layout">
        <section class="comparison-data" aria-label="Compared episode ratings">
          <section class="comparison-overview" aria-label="Both shows overview" hidden></section>
          ${renderComparisonLane('a')}
          ${renderComparisonLane('b')}
          <section class="comparison-reading-pane" data-reading-mode="comparison">
            <section class="comparison-context" aria-label="Comparison context"></section>
            <section class="comparison-detail" aria-label="Selected rating details" hidden>
              ${COMPARISON_SLOT_IDS.map(
                (slot) =>
                  `<section data-comparison-detail="${slot}" hidden></section>`
              ).join('')}
              <p class="cross-show-multiselect-action" hidden>
                <button type="button" class="sidenote-compare-button" data-comparison-action="head-to-head">Compare episodes</button>
                <span></span>
              </p>
            </section>
            <section class="comparison-head-to-head" aria-label="Head-to-head episode comparison" hidden></section>
          </section>
        </section>
      </section>
    </main>
  `
}

function renderComparisonLane(slot) {
  return `
    <section class="comparison-lane ${slot === 'a' ? 'is-active' : ''}" data-comparison-slot="${slot}" aria-busy="true">
      <header class="comparison-lane-heading" data-comparison-heading="${slot}">
        <h2>${slot === 'a' ? 'First show' : 'Second show'}</h2>
      </header>
      <div class="comparison-chart-root" data-comparison-chart="${slot}">
        ${renderLoading('Loading show details…', { announce: false })}
      </div>
      <p class="comparison-lane-status" data-comparison-status="${slot}" role="status" aria-live="polite"></p>
    </section>
  `
}

function attachComparisonOverview(container, chartRoot, state) {
  const overview = container.querySelector('.comparison-overview')
  const sparklineShell = chartRoot.querySelector?.('.sparkline-shell')
  if (!overview || !sparklineShell || sparklineShell.dataset.comparisonSlot) {
    return
  }
  sparklineShell.dataset.comparisonSlot = state.slot
  sparklineShell.classList.add(
    'comparison-overview-row',
    `comparison-overview-row-${state.slot}`
  )
  const label = document.createElement('span')
  label.className = 'comparison-overview-label'
  label.textContent = state.show?.title ?? `Show ${state.slot.toUpperCase()}`
  label.title = label.textContent
  sparklineShell.prepend(label)
  const followingRow =
    state.slot === 'a'
      ? overview.querySelector('.comparison-overview-row-b')
      : null
  overview.insertBefore(sparklineShell, followingRow)
  overview.hidden = false
}

function renderSlotState(container, state) {
  const lane = container.querySelector(
    `.comparison-lane[data-comparison-slot="${state.slot}"]`
  )
  const heading = container.querySelector(
    `[data-comparison-heading="${state.slot}"]`
  )
  const chartRoot = container.querySelector(
    `[data-comparison-chart="${state.slot}"]`
  )
  const status = container.querySelector(
    `[data-comparison-status="${state.slot}"]`
  )

  lane?.setAttribute('aria-busy', String(!state.complete && !state.error))
  if (state.show && heading) {
    heading.innerHTML = `
      <h2>${escapeHtml(state.show.title)}</h2>
      <p>${escapeHtml(
        [state.show.year, `${state.show.totalSeasons} seasons`]
          .filter(Boolean)
          .join(' · ')
      )}</p>
    `
  }
  if (state.error && chartRoot && !state.chart) {
    chartRoot.innerHTML = `
      ${renderError(
        `${state.show?.title ?? 'This show'} could not be loaded: ${state.error.message}`
      )}
      <p class="comparison-error-actions">
        <button type="button" data-comparison-action="retry" data-comparison-slot="${state.slot}">Retry</button>
        <button type="button" data-comparison-action="replace" data-comparison-slot="${state.slot}">Replace</button>
        <button type="button" data-comparison-action="remove" data-comparison-slot="${state.slot}">Remove</button>
      </p>
    `
  }
  if (status) {
    status.textContent = state.error
      ? 'Comparison data unavailable.'
      : state.complete
        ? ''
        : state.bundle
          ? 'Loading additional ratings…'
          : 'Loading episode ratings…'
  }
}

function updateComparisonPresentation(container, slots, comparison) {
  const shows = COMPARISON_SLOT_IDS.map((slot) => slots[slot].show)
  const title = container.querySelector('.comparison-title')
  if (shows.every(Boolean)) {
    title.textContent = `${shows[0].title} · ${shows[1].title}`
    document.title = `${shows[0].title} · ${shows[1].title} · graphtv`
  } else if (shows.find(Boolean)) {
    title.textContent = `${shows.find(Boolean).title} · loading comparison…`
  }
  if (shows[0]) {
    container
      .querySelector('.back-link')
      ?.setAttribute('aria-label', `Back to ${shows[0].title}`)
  }

  const subtitle = container.querySelector('.comparison-subtitle')
  if (comparison.allReady) {
    if (comparison.comparable) {
      subtitle.textContent = `Shared ${getRatingSourceLabel(comparison.sourceBySlot.a)} ratings · episode order · shared scale`
    } else {
      subtitle.textContent =
        'Episode order · shared scale · rating sources differ'
    }
  } else if (COMPARISON_SLOT_IDS.some((slot) => slots[slot].bundle)) {
    subtitle.textContent = 'Loading the second show · scale provisional'
  }

  const context = container.querySelector('.comparison-context')
  context.innerHTML = `
    ${
      comparison.allReady && !comparison.comparable
        ? `<p class="comparison-caution">No rating source adequately covers both shows. The charts share a visual scale, but GraphTV does not calculate differences between unlike sources.</p>`
        : ''
    }
    <div class="comparison-identities">
      ${renderComparisonIdentity(slots.a, comparison.sourceBySlot.a)}
      <p class="comparison-identity-axis" aria-hidden="true">compared with</p>
      ${renderComparisonIdentity(slots.b, comparison.sourceBySlot.b)}
    </div>
    ${renderComparisonTable(slots)}
    ${
      comparison.allReady
        ? '<p class="comparison-method-note">Ratings reflect each show’s voting audience. Adjacent values provide context, not a winner.</p>'
        : ''
    }
  `
}

function renderComparisonIdentity(state, source) {
  if (!state.show) {
    return `<section class="comparison-identity comparison-identity-${state.slot}">${renderLoading('Loading show…', { announce: false })}</section>`
  }
  return `
    <section class="comparison-identity comparison-identity-${state.slot}">
      ${
        state.show.poster
          ? `<img src="${escapeHtml(state.show.poster)}" alt="" class="comparison-poster" />`
          : '<span class="comparison-poster-fallback">No art</span>'
      }
      <div>
        <h3>${escapeHtml(state.show.title)}</h3>
        <p>${escapeHtml(state.show.genres.join(' · '))}</p>
        ${source ? `<p>Plotted on ${escapeHtml(getRatingSourceLabel(source))}</p>` : ''}
        <p class="comparison-identity-actions">
          <button type="button" data-comparison-action="replace" data-comparison-slot="${state.slot}">Replace</button>
          <button type="button" data-comparison-action="remove" data-comparison-slot="${state.slot}">Remove</button>
          <button type="button" data-comparison-action="open-alone" data-comparison-slot="${state.slot}">Open alone</button>
        </p>
      </div>
    </section>
  `
}

function renderComparisonTable(slots) {
  if (!COMPARISON_SLOT_IDS.every((slot) => slots[slot].chart)) {
    return ''
  }
  const summaries = Object.fromEntries(
    COMPARISON_SLOT_IDS.map((slot) => [slot, slots[slot].chart.getSummary()])
  )
  const rows = [
    [
      'Rated episodes',
      (summary) => `${summary.ratedEpisodes}/${summary.totalEpisodes}`
    ],
    ['Mean rating', (summary) => formatNumber(summary.series?.mean)],
    [
      'Within-season variation',
      (summary) => formatNumber(summary.series?.ratingStandardDeviation)
    ],
    [
      'Trend per 10 episodes',
      (summary) => formatSigned(summary.series?.slope * 10)
    ],
    [
      'Median votes per episode',
      (summary) => formatCompactNumber(summary.medianVotes) || 'n/a'
    ],
    [
      'Regime change',
      (summary) =>
        summary.breakpoint?.highConfidence
          ? formatEpisodeCode(summary.breakpoint.breakpointPoint)
          : 'None detected'
    ]
  ]

  return `
    <table class="comparison-summary" aria-label="Series comparison">
      <colgroup>
        <col />
        <col class="comparison-summary-measure-column" />
        <col />
      </colgroup>
      <tbody>
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <td class="comparison-summary-a"><span class="visually-hidden">${escapeHtml(slots.a.show.title)}: </span>${value(summaries.a)}</td>
                <th scope="row" class="comparison-summary-measure">${label}</th>
                <td class="comparison-summary-b"><span class="visually-hidden">${escapeHtml(slots.b.show.title)}: </span>${value(summaries.b)}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
  `
}

function createComparisonDetailState(selection, selectionContext = {}) {
  if (!selection || selection === 'series' || selection === 'none') {
    return {
      kind: 'trend',
      selection: selection ?? 'none',
      trendId: 'series',
      trendKind: 'series'
    }
  }
  if (/^s\d+e\d+$/u.test(selection)) {
    return {
      kind: 'point',
      selection,
      x: Number.isFinite(selectionContext.x) ? selectionContext.x : null,
      pointId: selectionContext.pointId ?? null
    }
  }
  return { kind: 'trend', selection, trendId: selection }
}

function getSelectedEpisodeSlots(detailStates) {
  return COMPARISON_SLOT_IDS.filter(
    (slot) => detailStates[slot]?.kind === 'point'
  )
}

function isComparisonRestingState(detailState) {
  return (
    !detailState ||
    detailState.kind === 'none' ||
    (detailState.kind === 'trend' && detailState.trendId === 'series')
  )
}

function renderCrossShowEpisodeComparison(slots, detailStates) {
  const episodes = Object.fromEntries(
    COMPARISON_SLOT_IDS.map((slot) => [
      slot,
      findSelectedEpisode(slots[slot].bundle, detailStates[slot]?.selection)
    ])
  )
  if (!episodes.a || !episodes.b) {
    return renderLoading('Loading selected episodes…', { announce: false })
  }
  const sources = orderVisibleRatings([
    ...(episodes.a.ratings ?? []),
    ...(episodes.b.ratings ?? [])
  ])
    .map((rating) => rating.source)
    .filter((source, index, values) => values.indexOf(source) === index)

  return `
    <div class="cross-show-episode-headings">
      ${renderCrossShowEpisodeHeading(slots.a, episodes.a)}
      <p class="cross-show-episode-axis">head to head</p>
      ${renderCrossShowEpisodeHeading(slots.b, episodes.b)}
    </div>
    <table class="cross-show-episode-ratings">
      <caption>Episode ratings</caption>
      <colgroup>
        <col />
        <col class="cross-show-rating-source-column" />
        <col />
      </colgroup>
      <tbody>
        ${sources
          .map(
            (source) => `
              <tr>
                <td class="cross-show-rating-a">${renderCrossShowRating(episodes.a, source)}</td>
                <th scope="row">${escapeHtml(getRatingSourceLabel(source))}</th>
                <td class="cross-show-rating-b">${renderCrossShowRating(episodes.b, source)}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    <p class="cross-show-episode-note">Each episode keeps its own series context; only observed ratings are placed side by side.</p>
  `
}

function renderCrossShowEpisodeHeading(state, episode) {
  const date = episode.airdate ?? episode.releaseDate ?? null
  return `
    <article class="cross-show-episode cross-show-episode-${state.slot}">
      <p>${escapeHtml(state.show.title)} · ${formatEpisodeCode(episode)}</p>
      <h2>${escapeHtml(episode.title)}</h2>
      ${date ? `<p>${escapeHtml(date)}</p>` : ''}
      <button type="button" data-comparison-action="remove-episode" data-comparison-slot="${state.slot}">Remove</button>
    </article>
  `
}

function renderCrossShowRating(episode, source) {
  const rating = episode.ratings?.find(
    (candidate) =>
      candidate.source === source && isUsableProviderRating(candidate)
  )
  if (!rating) {
    return '<span class="cross-show-rating-unavailable">n/a</span>'
  }
  const votes = Number.isFinite(rating.votes)
    ? `<span>${escapeHtml(formatCompactNumber(rating.votes))} votes</span>`
    : ''
  return `<strong>${rating.rating.toFixed(1)}</strong>${votes}`
}

function findSelectedEpisode(bundle, selection) {
  const match = /^s(\d+)e(\d+)$/u.exec(selection ?? '')
  if (!match) {
    return null
  }
  const seasonNumber = Number(match[1])
  const episodeNumber = Number(match[2])
  return bundle?.seasons
    ?.find((season) => season.number === seasonNumber)
    ?.episodes?.find(
      (episode) => (episode.episode ?? episode.number) === episodeNumber
    )
}

function buildSingleShowHref(showRef) {
  const params = preserveDebugParams(new URLSearchParams())
  params.set('show', showRef)
  return buildUrl(params)
}

function buildSearchHref() {
  return buildUrl(preserveDebugParams(new URLSearchParams()))
}

function getLoadedProviders(bundle) {
  return (bundle?.sourceRecords ?? [])
    .map((record) => record.provider)
    .filter(Boolean)
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a'
}

function formatSigned(value) {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}`
}

function formatEpisodeCode(point) {
  const episode = point?.episode ?? point?.number
  return point && Number.isFinite(episode)
    ? `S${String(point.season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
    : 'None detected'
}

function formatComparisonViewportAnnouncement(viewport, slots) {
  const start = Math.max(1, Math.ceil(viewport.start))
  const end = Math.max(start, Math.floor(viewport.end))
  const showDescriptions = COMPARISON_SLOT_IDS.map((slot) => {
    const state = slots[slot]
    const episodeCount = getComparisonEpisodeCount(state.bundle?.seasons)
    return state.show
      ? `${state.show.title} has ${episodeCount} ${episodeCount === 1 ? 'episode' : 'episodes'}`
      : null
  }).filter(Boolean)
  return `Shared episode positions ${start}–${end}. ${showDescriptions.join('; ')}.`
}
