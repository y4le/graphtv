import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDockController } from '../../src/ui/dock.js'

let dockController

afterEach(() => {
  dockController?.destroy()
  dockController = undefined
  document.body.replaceChildren()
  document.documentElement.style.removeProperty('--dock-height')
})

describe('createDockController', () => {
  it('opens a non-modal region that leaves the page interactive', () => {
    document.body.innerHTML =
      '<main id="app"><button type="button">Chart</button></main>'
    const app = document.querySelector('#app')
    dockController = createDockController()

    dockController.open({
      id: 'panel',
      title: 'Panel',
      content:
        '<input type="range" data-first><button type="button">Go</button>'
    })

    const region = document.querySelector('.dock-root [role="region"]')
    expect(region.getAttribute('aria-labelledby')).toBe('dock-title')
    expect(document.querySelector('#dock-title').textContent).toBe('Panel')
    expect(app.hasAttribute('inert')).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(document.querySelector('[data-first]'))
    expect(dockController.isOpen()).toBe(true)
    expect(dockController.getActiveId()).toBe('panel')
    expect(
      document.documentElement.style.getPropertyValue('--dock-height')
    ).toMatch(/^\d+px$/)

    // Focus can leave the dock: it never traps.
    app.querySelector('button').focus()
    expect(document.activeElement).toBe(app.querySelector('button'))
  })

  it('closes on Escape or its toggle key and restores focus only if it held it', () => {
    document.body.innerHTML =
      '<main id="app"><button type="button" id="origin">Origin</button></main>'
    const origin = document.querySelector('#origin')
    origin.focus()
    const onClose = vi.fn()
    dockController = createDockController()

    dockController.open({
      id: 'panel',
      title: 'Panel',
      toggleKey: 'm',
      content: '<input type="range" data-first><input type="text" data-text>',
      onClose
    })
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    expect(dockController.isOpen()).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(origin)
    expect(
      document.documentElement.style.getPropertyValue('--dock-height')
    ).toBe('')

    dockController.open({
      id: 'panel',
      title: 'Panel',
      toggleKey: 'm',
      content: '<input type="range" data-first><input type="text" data-text>'
    })
    const textField = document.querySelector('[data-text]')
    textField.focus()
    textField.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true })
    )
    expect(dockController.isOpen()).toBe(true)

    document.querySelector('[data-first]').focus()
    document.activeElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'm', bubbles: true })
    )
    expect(dockController.isOpen()).toBe(false)

    dockController.open({ id: 'panel', title: 'Panel', content: '' })
    origin.focus()
    const bystander = document.createElement('button')
    document.body.appendChild(bystander)
    bystander.focus()
    dockController.close()
    expect(document.activeElement).toBe(bystander)
  })

  it('toggles by id and replaces a different open panel', () => {
    dockController = createDockController()
    const closeA = vi.fn()

    expect(
      dockController.toggle({
        id: 'a',
        title: 'A',
        content: '',
        onClose: closeA
      })
    ).toBe(true)
    expect(dockController.toggle({ id: 'b', title: 'B', content: '' })).toBe(
      true
    )
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(dockController.getActiveId()).toBe('b')
    expect(dockController.toggle({ id: 'b', title: 'B', content: '' })).toBe(
      false
    )
    expect(dockController.isOpen()).toBe(false)
  })

  it('renders header actions and destroys cleanly', () => {
    dockController = createDockController()
    const onClose = vi.fn()
    dockController.open({
      id: 'panel',
      title: 'Panel',
      actions: '<button type="button" data-action>Reset</button>',
      content: '<p>Body</p>',
      onClose
    })

    expect(
      document.querySelector('.dock-header-actions [data-action]')
    ).not.toBeNull()
    document.querySelector('[data-dock-close]').click()
    expect(onClose).toHaveBeenCalledTimes(1)

    dockController.open({ id: 'panel', title: 'Panel', content: '', onClose })
    dockController.destroy()
    dockController.destroy()
    expect(document.querySelector('.dock-root')).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(() =>
      dockController.open({ id: 'again', title: 'Again', content: '' })
    ).toThrow('destroyed dock controller')
  })
})
