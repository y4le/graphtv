import { createChordTracker, isEditableElement, isSuppressedInteractiveElement } from '../lib/keyboard.js'
import { openDebugOverlay, openHelpOverlay, openViewOptionsOverlay } from './overlay.js'

export function createKeyboardController({ page, overlayController }) {
  const chordTracker = createChordTracker()

  function onKeyDown(event) {
    if (overlayController.isOpen()) {
      if (event.key === 'v' && overlayController.getActiveId() === 'view-options') {
        event.preventDefault()
        overlayController.close()
      }
      return
    }

    const activeElement = document.activeElement
    const isSearchResultTarget = Boolean(
      page.kind === 'search' && activeElement?.closest?.('[data-focus-zone="search-results"]')
    )

    if (isEditableElement(activeElement)) {
      chordTracker.reset()
      if (event.key === 'Escape') {
        event.preventDefault()
        activeElement.blur()
      }
      return
    }

    if (isSuppressedInteractiveElement(activeElement) && !isSearchResultTarget) {
      chordTracker.reset()

      if (keyWorksFromInteractiveControl(event.key)) {
        handleGlobalAction(event.key, event)
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
    return key === '/' || key === '?' || key === 'F1'
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

    if (key === 'v') {
      event.preventDefault()
      runUiAction('view-options')
      return true
    }

    if (key === 'd' || key === 'D') {
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

    if (key === 'k' || key === 'b' || (event.key === 'ArrowUp' && !event.ctrlKey) || (event.key === 'ArrowLeft' && event.ctrlKey)) {
      event.preventDefault()
      page.chart.moveSeason(-1)
      return
    }

    if (key === 'j' || key === 'w' || (event.key === 'ArrowDown' && !event.ctrlKey) || (event.key === 'ArrowRight' && event.ctrlKey)) {
      event.preventDefault()
      page.chart.moveSeason(1)
      return
    }

    if (key === 'gg' || key === 'Home' || key === '0') {
      event.preventDefault()
      page.chart.jumpBoundary('start')
      return
    }

    if (key === 'G' || key === 'End' || key === '$') {
      event.preventDefault()
      page.chart.jumpBoundary('end')
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
