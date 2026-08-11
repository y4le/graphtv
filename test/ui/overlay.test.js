import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createOverlayController, openViewOptionsOverlay } from '../../src/ui/overlay.js'
import { getUiSettings, initializeTheme } from '../../src/viz/theme.js'

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
    const onButton = row.querySelector('[data-view-toggle="absoluteYAxis"][data-view-toggle-value="true"]')

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
    const offButton = row.querySelector('[data-view-toggle="showSourceSpread"][data-view-toggle-value="false"]')

    expect(row.textContent).toContain('Show source spread')
    expect(getUiSettings().showSourceSpread).toBe(true)
    expect(offButton.getAttribute('aria-pressed')).toBe('false')

    offButton.click()
    expect(getUiSettings().showSourceSpread).toBe(false)
    expect(offButton.getAttribute('aria-pressed')).toBe('true')

    row.focus()
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))
    expect(getUiSettings().showSourceSpread).toBe(true)
  })
})
