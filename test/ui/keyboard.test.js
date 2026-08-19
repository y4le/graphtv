import { afterEach, describe, expect, it, vi } from 'vitest'

import { createKeyboardController } from '../../src/ui/keyboard.js'
import { createOverlayController } from '../../src/ui/overlay.js'
import { createDockController } from '../../src/ui/dock.js'
import { getUiSettings } from '../../src/viz/theme.js'

let keyboardController

afterEach(() => {
  keyboardController?.destroy()
  keyboardController = undefined
  document.body.replaceChildren()
})

describe('createKeyboardController', () => {
  it('gives shortcut actions the same effects as their matching keys', async () => {
    document.body.innerHTML = `
      <button type="button" data-ui-action="help">?</button>
      <button type="button" data-ui-action="view-options">o</button>
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
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'help' })
      )
    )
    pressKey('?')
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledTimes(2)
    )

    document.querySelector('[data-ui-action="view-options"]').click()
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 'view-options' })
      )
    )
    pressKey('v')
    expect(overlayController.open).toHaveBeenCalledTimes(3)
    pressKey('o')
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledTimes(4)
    )

    document.querySelector('[data-ui-action="return-search"]').click()
    pressKey('q')
    expect(page.goBack).toHaveBeenCalledTimes(2)
  })

  it('keeps global shortcuts available from native controls', async () => {
    document.body.innerHTML = '<button type="button">Focused action</button>'
    const overlayController = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: () => false,
      getActiveId: () => null
    }
    const page = {
      kind: 'search',
      debugEnabled: true,
      focusSearch: vi.fn(),
      getDebugSections: vi.fn(() => [])
    }
    keyboardController = createKeyboardController({ page, overlayController })
    document.querySelector('button').focus()

    pressKey('?')
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'help' })
      )
    )

    pressKey('/')
    expect(page.focusSearch).toHaveBeenCalledOnce()

    pressKey('o')
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'view-options' })
      )
    )

    pressKey('D')
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'debug' })
      )
    )
  })

  it('drops a lazy overlay action when the controller is destroyed', async () => {
    await import('../../src/ui/helpOverlay.js')
    const overlayController = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: () => false,
      getActiveId: () => null
    }
    keyboardController = createKeyboardController({
      page: { kind: 'search' },
      overlayController
    })

    pressKey('?')
    keyboardController.destroy()
    keyboardController = undefined
    await Promise.resolve()
    await Promise.resolve()

    expect(overlayController.open).not.toHaveBeenCalled()
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

  it('keeps only global result shortcuts available from an SVG button', () => {
    document.body.innerHTML = `
      <svg>
        <text role="button" tabindex="0">Chart info</text>
      </svg>
    `
    const chart = {
      clearSelection: vi.fn(() => true),
      jumpBoundary: vi.fn(),
      moveEpisode: vi.fn()
    }
    const goBack = vi.fn()
    keyboardController = createKeyboardController({
      page: { kind: 'results', chart, goBack },
      overlayController: createClosedOverlayController()
    })
    document.querySelector('[role="button"]').focus()

    pressKey('G')
    pressKey('ArrowRight')
    pressKey('Escape')
    pressKey('q')

    expect(chart.jumpBoundary).not.toHaveBeenCalled()
    expect(chart.moveEpisode).not.toHaveBeenCalled()
    expect(chart.clearSelection).toHaveBeenCalledOnce()
    expect(goBack).toHaveBeenCalledOnce()
  })

  it('keeps chart navigation available from a season-axis label', () => {
    document.body.innerHTML = `
      <svg>
        <text role="button" tabindex="0" data-keyboard-chart="true">Season 1</text>
      </svg>
    `
    const chart = {
      moveSeason: vi.fn()
    }
    keyboardController = createKeyboardController({
      page: { kind: 'results', chart },
      overlayController: createClosedOverlayController()
    })
    document.querySelector('[data-keyboard-chart]').focus()

    pressKey('j')
    pressKey('ArrowDown')
    pressKey('k')
    pressKey('ArrowUp')

    expect(chart.moveSeason.mock.calls).toEqual([[1], [1], [-1], [-1]])
  })

  it('closes view options with o without reopening it as the event bubbles', async () => {
    const overlayController = createOverlayController()
    keyboardController = createKeyboardController({
      page: { kind: 'search' },
      overlayController
    })

    pressKey('o')
    await vi.waitFor(() =>
      expect(overlayController.getActiveId()).toBe('view-options')
    )

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
        key: 'o',
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
      panHalfViewport: vi.fn(),
      resetZoom: vi.fn(),
      clearSelection: vi.fn(),
      cyclePrimaryRatingSource: vi.fn(),
      toggleSeasonTrend: vi.fn(),
      toggleSeriesBreakpoint: vi.fn(),
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
    const halfBack = pressKey('u', { ctrlKey: true })
    const halfForward = pressKey('d', { ctrlKey: true })
    pressKey('f')
    pressKey('r')
    pressKey('p')
    pressKey('-')
    pressKey('=')
    pressKey('+', { shiftKey: true })
    pressKey('t')
    pressKey('b')
    pressKey('T', { shiftKey: true })
    pressKey('Escape')

    expect(chart.moveEpisode.mock.calls).toEqual([[-1], [1]])
    expect(chart.moveSeason.mock.calls).toEqual([[-1], [1]])
    expect(chart.jumpBoundary.mock.calls).toEqual([['start'], ['end']])
    expect(chart.panHalfViewport.mock.calls).toEqual([[-1], [1]])
    expect(halfBack.defaultPrevented).toBe(true)
    expect(halfForward.defaultPrevented).toBe(true)
    expect(chart.fitSeries).toHaveBeenCalledOnce()
    expect(chart.resetZoom).toHaveBeenCalledOnce()
    expect(chart.cyclePrimaryRatingSource).toHaveBeenCalledOnce()
    expect(chart.zoomBy.mock.calls).toEqual([[1.5], [1 / 1.5], [1 / 1.5]])
    expect(chart.toggleSeriesTrend).toHaveBeenCalledOnce()
    expect(chart.toggleSeriesBreakpoint).toHaveBeenCalledOnce()
    expect(chart.toggleSeasonTrend).toHaveBeenCalledOnce()
    expect(chart.clearSelection).toHaveBeenCalledOnce()

    for (const removedKey of ['w', '0', '$']) {
      pressKey(removedKey)
    }

    expect(chart.moveSeason).toHaveBeenCalledTimes(2)
    expect(chart.jumpBoundary).toHaveBeenCalledTimes(2)
  })

  it('leaves browser and operating-system shortcuts untouched', async () => {
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
    const browserBookmark = pressKey('d', { metaKey: true })
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
    await vi.waitFor(() =>
      expect(overlayController.open).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'debug' })
      )
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

describe('mark scaling dock shortcuts', () => {
  let dockController

  afterEach(() => {
    dockController?.destroy()
    dockController = undefined
  })

  it('toggles the mark scaling dock with m on the results page only', async () => {
    document.body.innerHTML = `
      <main id="app"><button type="button" data-ui-action="mark-density">m</button></main>
    `
    const overlayController = createOverlayController()
    dockController = createDockController()
    const chart = { getDensityMetrics: () => null }
    keyboardController = createKeyboardController({
      page: { kind: 'results', chart, goBack: vi.fn() },
      overlayController,
      dockController
    })

    expect(pressKey('m').defaultPrevented).toBe(true)
    await vi.waitFor(() =>
      expect(dockController.getActiveId()).toBe('mark-density')
    )
    expect(document.querySelector('#app').hasAttribute('inert')).toBe(false)

    // Chart shortcuts keep working while the dock is open and focus is
    // back on the page.
    document.activeElement.blur()
    expect(document.activeElement).toBe(document.body)
    expect(dockController.isOpen()).toBe(true)

    pressKey('m')
    await vi.waitFor(() => expect(dockController.isOpen()).toBe(false))

    document.querySelector('[data-ui-action="mark-density"]').click()
    await vi.waitFor(() => expect(dockController.isOpen()).toBe(true))

    // Pressing m while a dock slider has focus closes it without reopening.
    document.querySelector('[data-density-thumb]').focus()
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'm',
        bubbles: true,
        cancelable: true
      })
    )
    await vi.waitFor(() => expect(dockController.isOpen()).toBe(false))
  })

  it('ignores m on the search page and without a dock controller', () => {
    dockController = createDockController()
    keyboardController = createKeyboardController({
      page: { kind: 'search' },
      overlayController: createOverlayController(),
      dockController
    })
    expect(pressKey('m').defaultPrevented).toBe(false)
    expect(dockController.isOpen()).toBe(false)
    keyboardController.destroy()

    keyboardController = createKeyboardController({
      page: { kind: 'results', chart: null, goBack: vi.fn() },
      overlayController: createOverlayController()
    })
    expect(pressKey('m').defaultPrevented).toBe(false)
  })

  it('opens the dock from the view options row and closes the overlay', async () => {
    document.body.innerHTML = '<main id="app"></main>'
    const overlayController = createOverlayController()
    dockController = createDockController()
    keyboardController = createKeyboardController({
      page: { kind: 'results', chart: null, goBack: vi.fn() },
      overlayController,
      dockController
    })

    pressKey('o')
    await vi.waitFor(() =>
      expect(overlayController.getActiveId()).toBe('view-options')
    )
    const row = document.querySelector('[data-option="mark-density"]')
    expect(row).not.toBeNull()

    row.focus()
    row.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'm',
        bubbles: true,
        cancelable: true
      })
    )
    await vi.waitFor(() =>
      expect(dockController.getActiveId()).toBe('mark-density')
    )
    expect(overlayController.isOpen()).toBe(false)
    expect(document.querySelector('#app').hasAttribute('inert')).toBe(false)
  })
})

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
