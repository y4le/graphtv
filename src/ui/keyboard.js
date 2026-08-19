import {
  createChordTracker,
  hasCommandModifier,
  isEditableElement,
  isSuppressedInteractiveElement
} from '../lib/keyboard.js'

const KEYBOARD_ZOOM_STEP = 1.5
const MARK_DENSITY_TOGGLE_KEY = 'm'

export function createKeyboardController({
  page,
  overlayController,
  dockController = null
}) {
  const chordTracker = createChordTracker()
  let destroyed = false

  function runLazyAction(load, action) {
    void load()
      .then((module) => {
        if (!destroyed) {
          action(module)
        }
      })
      .catch((error) => {
        if (!destroyed) {
          console.error(error)
        }
      })
  }

  function openHelp() {
    runLazyAction(
      () => import('./helpOverlay.js'),
      ({ openHelpOverlay }) => openHelpOverlay(overlayController, page)
    )
  }

  function openViewOptions() {
    runLazyAction(
      () => import('./viewOptionsOverlay.js'),
      ({ openViewOptionsOverlay }) =>
        openViewOptionsOverlay(overlayController, {
          onOpenMarkDensity: canOpenMarkDensity()
            ? () => {
                overlayController.close()
                openMarkDensity()
              }
            : null
        })
    )
  }

  function openDebug() {
    runLazyAction(
      () => import('./debugOverlay.js'),
      ({ openDebugOverlay }) => openDebugOverlay(overlayController, page)
    )
  }

  function openMarkDensity() {
    runLazyAction(
      () => import('./densityPanel.js'),
      ({ openMarkDensityDock }) => openMarkDensityDock(dockController, page)
    )
  }

  function onKeyDown(event) {
    if (hasCommandModifier(event) && !isChartHalfViewportShortcut(event)) {
      chordTracker.reset()
      return
    }

    if (overlayController.isOpen()) {
      if (
        event.key === 'o' &&
        overlayController.getActiveId() === 'view-options'
      ) {
        event.preventDefault()
        overlayController.close()
      }
      return
    }

    const activeElement = document.activeElement
    const isSearchResultTarget = Boolean(
      page.kind === 'search' &&
      activeElement?.closest?.('[data-focus-zone="search-results"]')
    )
    const isLocalKeyboardTarget = Boolean(
      activeElement?.closest?.('[data-keyboard-local]')
    )
    const isChartKeyboardTarget = Boolean(
      page.kind === 'results' &&
      activeElement?.closest?.('[data-keyboard-chart]')
    )

    if (isEditableElement(activeElement)) {
      chordTracker.reset()
      if (event.key === 'Escape') {
        event.preventDefault()
        activeElement.blur()
      }
      return
    }

    if (
      (isSuppressedInteractiveElement(activeElement) ||
        isLocalKeyboardTarget) &&
      !isSearchResultTarget &&
      !isChartKeyboardTarget
    ) {
      chordTracker.reset()

      if (keyWorksFromInteractiveControl(event.key)) {
        const handledGlobally = handleGlobalAction(event.key, event)
        if (!handledGlobally && page.kind === 'results') {
          handleResultsAction(event.key, event)
        }
      }
      return
    }

    const normalizedKey = event.key
    const chordResult = chordTracker.press(normalizedKey)

    if (chordResult === 'pending') {
      event.preventDefault()
      return
    }

    const actionKey = chordResult ?? normalizedKey
    if (chordResult) {
      event.preventDefault()
    }

    if (handleGlobalAction(actionKey, event)) {
      return
    }

    if (page.kind === 'search') {
      handleSearchAction(actionKey, event)
      return
    }

    if (page.kind === 'results') {
      handleResultsAction(actionKey, event)
    }
  }

  function keyWorksFromInteractiveControl(key) {
    return [
      '/',
      '?',
      'F1',
      'Escape',
      'q',
      'o',
      'D',
      MARK_DENSITY_TOGGLE_KEY
    ].includes(key)
  }

  function isChartHalfViewportShortcut(event) {
    return Boolean(
      page.kind === 'results' &&
      page.chart &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === 'u' || event.key === 'd')
    )
  }

  function onClick(event) {
    const action = event.target.closest?.('[data-ui-action]')?.dataset.uiAction
    if (!action) {
      return
    }

    if (runUiAction(action)) {
      event.preventDefault()
    }
  }

  function runUiAction(action) {
    if (action === 'help') {
      openHelp()
      return true
    }

    if (action === 'view-options') {
      openViewOptions()
      return true
    }

    if (action === 'mark-density') {
      if (!canOpenMarkDensity()) {
        return false
      }
      openMarkDensity()
      return true
    }

    if (action === 'return-search' && page.kind === 'results') {
      page.goBack()
      return true
    }

    return false
  }

  function canOpenMarkDensity() {
    return Boolean(dockController) && page.kind === 'results'
  }

  function handleGlobalAction(key, event) {
    if (key === '?') {
      event.preventDefault()
      runUiAction('help')
      return true
    }

    if (key === 'F1') {
      event.preventDefault()
      runUiAction('help')
      return true
    }

    if (key === 'o') {
      event.preventDefault()
      runUiAction('view-options')
      return true
    }

    if (key === 'D') {
      event.preventDefault()
      openDebug()
      return true
    }

    if (key === '/') {
      event.preventDefault()
      page.focusSearch?.()
      return true
    }

    return false
  }

  function handleSearchAction(key, event) {
    if (key === 'j' || key === 'ArrowDown') {
      event.preventDefault()
      page.moveSelection(1)
      return
    }

    if (key === 'k' || key === 'ArrowUp') {
      event.preventDefault()
      page.moveSelection(-1)
      return
    }

    if (key === 'gg' || key === 'Home') {
      event.preventDefault()
      page.jumpSelection('start')
      return
    }

    if (key === 'G' || key === 'End') {
      event.preventDefault()
      page.jumpSelection('end')
      return
    }

    if (key === 'l' || key === 'Enter') {
      event.preventDefault()
      page.openSelection()
    }
  }

  function handleResultsAction(key, event) {
    if (key === 'q') {
      event.preventDefault()
      runUiAction('return-search')
      return
    }

    if (key === MARK_DENSITY_TOGGLE_KEY) {
      if (runUiAction('mark-density')) {
        event.preventDefault()
      }
      return
    }

    if (key === 'Escape') {
      if (page.chart?.clearSelection?.()) {
        event.preventDefault()
      }
      return
    }

    if (!page.chart) {
      return
    }

    if (isChartHalfViewportShortcut(event)) {
      event.preventDefault()
      page.chart.panHalfViewport(key === 'u' ? -1 : 1)
      return
    }

    if (key === 'ArrowLeft' || key === 'h') {
      event.preventDefault()
      page.chart.moveEpisode(-1)
      return
    }

    if (key === 'ArrowRight' || key === 'l') {
      event.preventDefault()
      page.chart.moveEpisode(1)
      return
    }

    if (key === 'k' || key === 'ArrowUp') {
      event.preventDefault()
      page.chart.moveSeason(-1)
      return
    }

    if (key === 'j' || key === 'ArrowDown') {
      event.preventDefault()
      page.chart.moveSeason(1)
      return
    }

    if (key === 'gg' || key === 'Home') {
      event.preventDefault()
      page.chart.jumpBoundary('start')
      return
    }

    if (key === 'G' || key === 'End') {
      event.preventDefault()
      page.chart.jumpBoundary('end')
      return
    }

    if (key === 'f') {
      event.preventDefault()
      page.chart.fitSeries()
      return
    }

    if (key === 'r') {
      event.preventDefault()
      page.chart.resetZoom()
      return
    }

    if (key === 'p') {
      event.preventDefault()
      page.chart.cyclePrimaryRatingSource()
      return
    }

    if (key === 't') {
      event.preventDefault()
      page.chart.toggleSeriesTrend()
      return
    }

    if (key === 'b') {
      event.preventDefault()
      page.chart.toggleSeriesBreakpoint()
      return
    }

    if (key === 'T') {
      event.preventDefault()
      page.chart.toggleSeasonTrend()
      return
    }

    if (key === '-') {
      event.preventDefault()
      page.chart.zoomBy(KEYBOARD_ZOOM_STEP)
      return
    }

    if (key === '=' || key === '+') {
      event.preventDefault()
      page.chart.zoomBy(1 / KEYBOARD_ZOOM_STEP)
    }
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onClick)

  return {
    destroy() {
      destroyed = true
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
    }
  }
}
