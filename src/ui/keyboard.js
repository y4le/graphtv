import {
  createChordTracker,
  hasCommandModifier,
  isEditableElement,
  isSuppressedInteractiveElement
} from '../lib/keyboard.js'
import {
  openDebugOverlay,
  openHelpOverlay,
  openViewOptionsOverlay
} from './overlay.js'

const KEYBOARD_ZOOM_STEP = 1.5

export function createKeyboardController({ page, overlayController }) {
  const chordTracker = createChordTracker()

  function onKeyDown(event) {
    if (hasCommandModifier(event)) {
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
    return ['/', '?', 'F1', 'Escape', 'q'].includes(key)
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
      openHelpOverlay(overlayController, page)
      return true
    }

    if (action === 'view-options') {
      openViewOptionsOverlay(overlayController)
      return true
    }

    if (action === 'return-search' && page.kind === 'results') {
      page.goBack()
      return true
    }

    return false
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
      openDebugOverlay(overlayController, page)
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

    if (key === 'Escape') {
      if (page.chart?.clearSelection?.()) {
        event.preventDefault()
      }
      return
    }

    if (!page.chart) {
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
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick)
    }
  }
}
