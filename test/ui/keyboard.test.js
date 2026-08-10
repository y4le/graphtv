import { afterEach, describe, expect, it, vi } from 'vitest'

import { createKeyboardController } from '../../src/ui/keyboard.js'
import { createOverlayController } from '../../src/ui/overlay.js'

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
    expect(overlayController.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'help' }))

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

  it('closes view options with v without reopening it as the event bubbles', () => {
    const overlayController = createOverlayController()
    keyboardController = createKeyboardController({
      page: { kind: 'search' },
      overlayController
    })

    pressKey('v')
    expect(overlayController.getActiveId()).toBe('view-options')

    document.activeElement.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'v',
        bubbles: true,
        cancelable: true
      })
    )

    expect(overlayController.isOpen()).toBe(false)
  })
})

function pressKey(key) {
  document.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true
    })
  )
}
