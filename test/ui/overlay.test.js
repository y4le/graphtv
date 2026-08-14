import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOverlayController,
  openDebugOverlay,
  openHelpOverlay,
  openViewOptionsOverlay
} from '../../src/ui/overlay.js'
import {
  getUiSettings,
  initializeTheme,
  updateUiSettings
} from '../../src/viz/theme.js'

beforeEach(() => {
  window.localStorage.clear()
  initializeTheme()
})

afterEach(() => {
  document.body.replaceChildren()
})

describe('view options overlay', () => {
  it('offers mouse, keyboard, and persisted control of the absolute y-axis', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="absolute-y-axis"]')
    const onButton = row.querySelector(
      '[data-view-toggle="absoluteYAxis"][data-view-toggle-value="true"]'
    )

    expect(row.textContent).toContain('Absolute y-axis (0–10)')
    expect(onButton.getAttribute('aria-pressed')).toBe('false')

    onButton.click()
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(onButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }))
    expect(getUiSettings().absoluteYAxis).toBe(false)
  })

  it('offers a default-on source spread control', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="source-spread"]')
    const offButton = row.querySelector(
      '[data-view-toggle="showSourceSpread"][data-view-toggle-value="false"]'
    )
    const infoButton = row.querySelector('[data-view-option-info]')
    const tooltip = row.querySelector('[role="tooltip"]')

    expect(row.textContent).toContain('Rating source spread')
    expect(infoButton.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(tooltip.textContent).toContain(
      'a vertical mark shows the range between their scores'
    )
    expect(tooltip.hidden).toBe(true)

    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('true')
    expect(tooltip.hidden).toBe(false)
    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)

    infoButton.focus()
    expect(tooltip.hidden).toBe(false)
    infoButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(tooltip.hidden).toBe(true)
    expect(overlayController.getActiveId()).toBe('view-options')

    expect(getUiSettings().showSourceSpread).toBe(true)
    expect(offButton.getAttribute('aria-pressed')).toBe('false')

    offButton.click()
    expect(getUiSettings().showSourceSpread).toBe(false)
    expect(offButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(getUiSettings().showSourceSpread).toBe(true)
  })

  it('offers a persisted episode-density choice', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const row = document.querySelector('[data-option="episode-density"]')
    const values = Array.from(row.querySelectorAll('.view-value'))
    const denseButton = row.querySelector(
      '[data-view-episode-density="dense"]'
    )

    expect(values.map((value) => value.textContent)).toEqual([
      'Roomy',
      'Balanced',
      'Dense',
      'Full series'
    ])
    expect(
      row.querySelector('[data-view-episode-density="balanced"]')
        .getAttribute('aria-pressed')
    ).toBe('true')

    denseButton.click()
    expect(getUiSettings().episodeDensity).toBe('dense')
    expect(denseButton.getAttribute('aria-pressed')).toBe('true')
    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .episodeDensity
    ).toBe('dense')

    row.focus()
    row.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
    )
    expect(getUiSettings().episodeDensity).toBe('balanced')

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    expect(getUiSettings().episodeDensity).toBe('dense')
  })

  it('supports spatial value editing and focused direct accelerators', () => {
    updateUiSettings({ theme: 'light', palette: 'monotone' })
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const themeRow = document.querySelector('[data-option="theme"]')
    const paletteRow = document.querySelector('[data-option="palette"]')
    const yAxisRow = document.querySelector('[data-option="absolute-y-axis"]')
    const yAxisValues = Array.from(yAxisRow.querySelectorAll('.view-value'))

    expect(
      Array.from(paletteRow.querySelectorAll('.view-value'), (value) =>
        value.textContent
      )
    ).toEqual(['Mono', 'Alternating', 'Rainbow', 'Zigzag', 'Maximin'])
    expect(yAxisValues.map((value) => value.textContent)).toEqual(['Off', 'On'])

    themeRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(getUiSettings().theme).toBe('dark')

    paletteRow.focus()
    paletteRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'l', bubbles: true })
    )
    expect(getUiSettings().palette).toBe('alternating')

    yAxisRow.focus()
    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(yAxisValues[1].getAttribute('aria-pressed')).toBe('true')

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'h', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(false)
    expect(yAxisValues[0].getAttribute('aria-pressed')).toBe('true')

    paletteRow.focus()
    paletteRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
    expect(document.activeElement).toBe(yAxisRow)

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true, repeat: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)

    yAxisRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'y', bubbles: true, ctrlKey: true })
    )
    expect(getUiSettings().absoluteYAxis).toBe(true)
  })

  it('renders each shortcut hint as a shared keycap', () => {
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const keycaps = Array.from(document.querySelectorAll('.view-option-hint'))

    expect(keycaps.map((keycap) => keycap.tagName)).toEqual(
      Array(7).fill('KBD')
    )
    expect(keycaps.every((keycap) => keycap.classList.contains('keycap'))).toBe(
      true
    )
    expect(keycaps.map((keycap) => keycap.textContent)).toEqual([
      't',
      'c',
      'd',
      's',
      'f',
      'r',
      'y'
    ])
  })
})

describe('keyboard help overlay', () => {
  it('renders shortcuts as keycaps and uses glyphs for arrow keys', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, {
      kind: 'results',
      debugEnabled: true
    })

    const keycaps = Array.from(document.querySelectorAll('.help-key'))
    const keycapLabels = keycaps.map((keycap) => keycap.textContent)

    expect(document.querySelector('.overlay-title').textContent).toBe(
      'Keyboard shortcuts'
    )
    expect(document.querySelector('.overlay-help-results')).not.toBeNull()
    expect(document.querySelector('.help-sections-results')).not.toBeNull()
    expect(document.querySelector('[data-overlay-close]').textContent).toBe('×')
    expect(keycaps.every((keycap) => keycap.classList.contains('keycap'))).toBe(
      true
    )
    expect(keycapLabels).toEqual(
      expect.arrayContaining(['←', '→', '↑', '↓', 'Home', 'End'])
    )
    expect(document.querySelector('.help-sections').textContent).not.toMatch(
      /Arrow(?:Left|Right|Up|Down)/
    )
    expect(
      document.querySelector('.help-key[aria-label="Left arrow"]').textContent
    ).toBe('←')
    expect(keycapLabels).toEqual(
      expect.arrayContaining([
        'o',
        'f',
        'r',
        '-',
        '=',
        '+',
        't',
        'b',
        'T',
        'Escape'
      ])
    )
    expect(keycapLabels).not.toEqual(
      expect.arrayContaining(['w', '0', '$', 'd'])
    )
    expect(document.querySelector('.help-sections').textContent).toContain(
      'Select best breakpoint (ignores confidence threshold)'
    )
    expect(document.querySelector('[data-help-action="debug"]')).toMatchObject({
      tagName: 'BUTTON'
    })
    expect(
      document
        .querySelector('[data-help-action="debug"]')
        .classList.contains('shortcut-action')
    ).toBe(true)
  })

  it('opens the debug menu when the D keycap is pressed', () => {
    const overlayController = createOverlayController()
    const page = {
      kind: 'results',
      debugEnabled: true,
      getDebugSections: () => []
    }
    openHelpOverlay(overlayController, page)

    expect(overlayController.getActiveId()).toBe('help')

    document.querySelector('[data-help-action="debug"]').click()

    expect(overlayController.getActiveId()).toBe('debug')
    expect(document.querySelector('[data-debug-clear-caches]')).not.toBeNull()
  })

  it('keeps the D keycap non-interactive when debug data is unavailable', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, {
      kind: 'results',
      debugEnabled: false
    })

    expect(document.querySelector('[data-help-action="debug"]')).toBeNull()
    expect(
      Array.from(document.querySelectorAll('.help-key')).find(
        (keycap) => keycap.textContent === 'D'
      ).tagName
    ).toBe('KBD')
  })

  it('keeps collection navigation out of the search-page help menu', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, { kind: 'search' })

    const helpText = document.querySelector('.help-sections').textContent

    expect(document.querySelector('.overlay-help-search')).not.toBeNull()
    expect(document.querySelector('.help-sections-search')).not.toBeNull()
    expect(document.querySelectorAll('.help-section')).toHaveLength(2)
    expect(helpText).not.toContain('Browse collections')
    expect(helpText).not.toContain('Scroll collection backward')
    expect(helpText).not.toContain('Scroll collection forward')
  })
})

describe('debug overlay', () => {
  it('clears provider caches and reloads the page', async () => {
    let finishClearing
    const clearCaches = vi.fn(
      () =>
        new Promise((resolve) => {
          finishClearing = resolve
        })
    )
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { clearCaches, reloadPage }
    )

    const button = document.querySelector('[data-debug-clear-caches]')
    const status = document.querySelector('[data-debug-cache-status]')

    expect(document.querySelector('.debug-data-actions h3')).toBeNull()
    expect(button.nextElementSibling.textContent).toContain(
      'View settings are kept'
    )
    expect(
      document.querySelector('[data-debug-full-reset]').nextElementSibling
        .textContent
    ).toContain('Requires confirmation')

    button.click()

    expect(clearCaches).toHaveBeenCalledTimes(1)
    expect(button.disabled).toBe(true)
    expect(document.querySelector('[data-debug-full-reset]').disabled).toBe(
      true
    )
    expect(button.textContent).toBe('Clearing…')
    expect(status.textContent).toContain('Clearing cached provider responses')

    finishClearing()
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))

    expect(button.textContent).toBe('Caches cleared')
    expect(status.textContent).toBe('Caches cleared. Reloading…')
  })

  it('reports cache clearing failures and allows retrying', async () => {
    const clearCaches = vi.fn().mockRejectedValue(new Error('Storage blocked'))
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { clearCaches, reloadPage }
    )

    const button = document.querySelector('[data-debug-clear-caches]')
    const status = document.querySelector('[data-debug-cache-status]')
    button.click()

    await vi.waitFor(() => expect(button.disabled).toBe(false))

    expect(button.textContent).toBe('Clear caches')
    expect(status.textContent).toBe(
      'Could not clear browser data: Storage blocked'
    )
    expect(status.dataset.state).toBe('error')
    expect(reloadPage).not.toHaveBeenCalled()
  })

  it('confirms a full reset before clearing all app data and reloading', async () => {
    const confirmFullReset = vi.fn().mockReturnValue(true)
    const fullReset = vi.fn().mockResolvedValue()
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { confirmFullReset, fullReset, reloadPage }
    )

    const resetButton = document.querySelector('[data-debug-full-reset]')
    const status = document.querySelector('[data-debug-cache-status]')
    resetButton.click()

    expect(confirmFullReset).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(reloadPage).toHaveBeenCalledTimes(1))

    expect(fullReset).toHaveBeenCalledTimes(1)
    expect(resetButton.textContent).toBe('Full reset complete')
    expect(status.textContent).toBe('Full reset complete. Reloading…')
  })

  it('leaves browser data untouched when a full reset is cancelled', () => {
    const confirmFullReset = vi.fn().mockReturnValue(false)
    const fullReset = vi.fn()
    const reloadPage = vi.fn()
    const overlayController = createOverlayController()

    openDebugOverlay(
      overlayController,
      {
        debugEnabled: true,
        getDebugSections: () => []
      },
      { confirmFullReset, fullReset, reloadPage }
    )

    document.querySelector('[data-debug-full-reset]').click()

    expect(confirmFullReset).toHaveBeenCalledTimes(1)
    expect(fullReset).not.toHaveBeenCalled()
    expect(reloadPage).not.toHaveBeenCalled()
  })
})
