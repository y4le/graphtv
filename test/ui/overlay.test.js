import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createOverlayController,
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

    expect(row.textContent).toContain('Rating source spread')
    expect(getUiSettings().showSourceSpread).toBe(true)
    expect(offButton.getAttribute('aria-pressed')).toBe('false')

    offButton.click()
    expect(getUiSettings().showSourceSpread).toBe(false)
    expect(offButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(getUiSettings().showSourceSpread).toBe(true)
  })

  it('supports spatial value editing and focused direct accelerators', () => {
    updateUiSettings({ theme: 'light', palette: 'monotone' })
    const overlayController = createOverlayController()
    openViewOptionsOverlay(overlayController)

    const themeRow = document.querySelector('[data-option="theme"]')
    const paletteRow = document.querySelector('[data-option="palette"]')
    const yAxisRow = document.querySelector('[data-option="absolute-y-axis"]')

    themeRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    )
    expect(getUiSettings().theme).toBe('dark')

    paletteRow.focus()
    paletteRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'l', bubbles: true })
    )
    expect(getUiSettings().palette).toBe('subtle')

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
      Array(6).fill('KBD')
    )
    expect(keycaps.every((keycap) => keycap.classList.contains('keycap'))).toBe(
      true
    )
    expect(keycaps.map((keycap) => keycap.textContent)).toEqual([
      't',
      'c',
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
    openHelpOverlay(overlayController, { kind: 'results' })

    const keycaps = Array.from(document.querySelectorAll('.help-key'))
    const keycapLabels = keycaps.map((keycap) => keycap.textContent)

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
      expect.arrayContaining(['f', 'r', '-', '=', '+'])
    )
    expect(keycapLabels).not.toEqual(
      expect.arrayContaining(['b', 'w', '0', '$', 'd'])
    )
  })

  it('documents collection navigation on the search page', () => {
    const overlayController = createOverlayController()
    openHelpOverlay(overlayController, { kind: 'search' })

    const helpText = document.querySelector('.help-sections').textContent

    expect(helpText).toContain('Browse collections')
    expect(helpText).toContain('Scroll collection backward')
    expect(helpText).toContain('Scroll collection forward')
  })
})
