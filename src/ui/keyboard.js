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

    if (isEditableElement(activeElement)) {
      chordTracker.reset()
      if (event.key === 'Escape') {
        event.preventDefault()
        activeElement.blur()
      }
      return
    }

    if (isSuppressedInteractiveElement(activeElement)) {
      chordTracker.reset()
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

  function handleGlobalAction(key, event) {
    if (key === '?') {
      event.preventDefault()
      openHelpOverlay(overlayController, page)
      return true
    }

    if (key === 'F1') {
      event.preventDefault()
      openHelpOverlay(overlayController, page)
      return true
    }

    if (key === 'v') {
      event.preventDefault()
      openViewOptionsOverlay(overlayController)
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
      page.goBack()
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

  return {
    destroy() {
      document.removeEventListener('keydown', onKeyDown)
    }
  }
}
