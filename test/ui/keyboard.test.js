import { afterEach, describe, expect, it, vi } from 'vitest'

import { createKeyboardController } from '../../src/ui/keyboard.js'
import { createOverlayController } from '../../src/ui/overlay.js'
import { getUiSettings } from '../../src/viz/theme.js'

let keyboardController

afterEach(() => {
  keyboardController?.destroy()
  keyboardController = undefined
  document.body.replaceChildren()
})

describe('createKeyboardController', () => {
  it('gives shortcut actions the same effects as their matching keys', () => {
    document.body.innerHTML = `
      <button type="button" data-ui-action="help">?</button>
      <button type="button" data-ui-action="view-options">v</button>
      <button type="button" data-ui-action="return-search">q</button>
    `

    const overlayController = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: () => false,
      getActiveId: () => null
    }
    const page = {
      kind: 'results',
      chart: null,
      goBack: vi.fn()
    }
    keyboardController = createKeyboardController({ page, overlayController })

    document.querySelector('[data-ui-action="help"]').click()
    expect(overlayController.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'help' })
    )
    pressKey('?')
    expect(overlayController.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'help' })
    )
    expect(overlayController.open).toHaveBeenCalledTimes(2)

    document.querySelector('[data-ui-action="view-options"]').click()
    expect(overlayController.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'view-options' })
    )
    pressKey('v')
    expect(overlayController.open).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'view-options' })
    )
    expect(overlayController.open).toHaveBeenCalledTimes(4)

    document.querySelector('[data-ui-action="return-search"]').click()
    pressKey('q')
    expect(page.goBack).toHaveBeenCalledTimes(2)
  })

  it('keeps help and search shortcuts available from native controls', () => {
    document.body.innerHTML = '<button type="button">Focused action</button>'
    const overlayController = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: () => false,
      getActiveId: () => null
    }
    const page = {
      kind: 'search',
      focusSearch: vi.fn()
    }
    keyboardController = createKeyboardController({ page, overlayController })
    document.querySelector('button').focus()

    pressKey('?')
    expect(overlayController.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'help' })
    )

    pressKey('/')
    expect(page.focusSearch).toHaveBeenCalledOnce()
  })

  it('routes result navigation keys while a result link has focus', () => {
    document.body.innerHTML = `
      <ol data-focus-zone="search-results">
        <li><a href="#result">Result</a></li>
      </ol>
    `
    const overlayController = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: () => false,
      getActiveId: () => null
    }
    const page = {
      kind: 'search',
      moveSelection: vi.fn()
    }
    keyboardController = createKeyboardController({ page, overlayController })
    document.querySelector('a').focus()

    pressKey('j')

    expect(page.moveSelection).toHaveBeenCalledWith(1)
  })

  it('does not leak local widget keys into search-result navigation', () => {
    document.body.innerHTML = `
      <ul tabindex="0" data-keyboard-local><li>Collection</li></ul>
    `
    const page = {
      kind: 'search',
      jumpSelection: vi.fn(),
      moveSelection: vi.fn(),
      openSelection: vi.fn()
    }
    keyboardController = createKeyboardController({
      page,
      overlayController: createClosedOverlayController()
    })
    document.querySelector('[data-keyboard-local]').focus()

    for (const key of ['Home', 'End', 'ArrowDown', 'j', 'G', 'Enter']) {
      pressKey(key)
    }

    expect(page.jumpSelection).not.toHaveBeenCalled()
    expect(page.moveSelection).not.toHaveBeenCalled()
    expect(page.openSelection).not.toHaveBeenCalled()
  })

  it('closes view options with v without reopening it as the event bubbles', () => {
    const overlayController = createOverlayController()
    keyboardController = createKeyboardController({
      page: { kind: 'search' },
      overlayController
    })

    pressKey('v')
    expect(overlayController.getActiveId()).toBe('view-options')

    const initialYAxis = getUiSettings().absoluteYAxis
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'y',
        bubbles: true,
        cancelable: true
      })
    )
    expect(getUiSettings().absoluteYAxis).toBe(!initialYAxis)
    expect(document.activeElement.dataset.option).toBe('absolute-y-axis')

    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
        cancelable: true
      })
    )

    expect(overlayController.isOpen()).toBe(false)
  })

  it('uses the simplified chart navigation and viewport bindings', () => {
    const chart = {
      fitSeries: vi.fn(),
      jumpBoundary: vi.fn(),
      moveEpisode: vi.fn(),
      moveSeason: vi.fn(),
      resetZoom: vi.fn(),
      clearSelection: vi.fn(),
      toggleSeasonTrend: vi.fn(),
      toggleSeriesTrend: vi.fn(),
      zoomBy: vi.fn()
    }
    keyboardController = createKeyboardController({
      page: { kind: 'results', chart },
      overlayController: createClosedOverlayController()
    })

    pressKey('ArrowLeft')
    pressKey('l')
    pressKey('ArrowUp')
    pressKey('j')
    pressKey('Home')
    pressKey('G')
    pressKey('f')
    pressKey('r')
    pressKey('-')
    pressKey('=')
    pressKey('+', { shiftKey: true })
    pressKey('t')
    pressKey('T', { shiftKey: true })
    pressKey('Escape')

    expect(chart.moveEpisode.mock.calls).toEqual([[-1], [1]])
    expect(chart.moveSeason.mock.calls).toEqual([[-1], [1]])
    expect(chart.jumpBoundary.mock.calls).toEqual([['start'], ['end']])
    expect(chart.fitSeries).toHaveBeenCalledOnce()
    expect(chart.resetZoom).toHaveBeenCalledOnce()
    expect(chart.zoomBy.mock.calls).toEqual([[1.5], [1 / 1.5], [1 / 1.5]])
    expect(chart.toggleSeriesTrend).toHaveBeenCalledOnce()
    expect(chart.toggleSeasonTrend).toHaveBeenCalledOnce()
    expect(chart.clearSelection).toHaveBeenCalledOnce()

    for (const removedKey of ['b', 'w', '0', '$']) {
      pressKey(removedKey)
    }

    expect(chart.moveSeason).toHaveBeenCalledTimes(2)
    expect(chart.jumpBoundary).toHaveBeenCalledTimes(2)
  })

  it('leaves browser and operating-system shortcuts untouched', () => {
    const chart = {
      fitSeries: vi.fn(),
      moveEpisode: vi.fn(),
      resetZoom: vi.fn(),
      zoomBy: vi.fn()
    }
    const overlayController = createClosedOverlayController()
    keyboardController = createKeyboardController({
      page: {
        kind: 'results',
        chart,
        debugEnabled: true,
        getDebugSections: () => []
      },
      overlayController
    })

    const reload = pressKey('r', { ctrlKey: true })
    const addressBar = pressKey('l', { metaKey: true })
    const browserZoom = pressKey('-', { ctrlKey: true })
    const browserBookmark = pressKey('d', { ctrlKey: true })
    pressKey('d')

    expect(reload.defaultPrevented).toBe(false)
    expect(addressBar.defaultPrevented).toBe(false)
    expect(browserZoom.defaultPrevented).toBe(false)
    expect(browserBookmark.defaultPrevented).toBe(false)
    expect(chart.resetZoom).not.toHaveBeenCalled()
    expect(chart.moveEpisode).not.toHaveBeenCalled()
    expect(chart.zoomBy).not.toHaveBeenCalled()
    expect(overlayController.open).not.toHaveBeenCalled()

    pressKey('D', { shiftKey: true })
    expect(overlayController.open).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'debug' })
    )
  })
})

function createClosedOverlayController() {
  return {
    open: vi.fn(),
    close: vi.fn(),
    isOpen: () => false,
    getActiveId: () => null
  }
}

function pressKey(key, options = {}) {
  const event = new window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options
  })
  document.dispatchEvent(event)
  return event
}
