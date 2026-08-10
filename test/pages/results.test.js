import { describe, expect, it } from 'vitest'

import { renderResultsMasthead } from '../../src/pages/results.js'

describe('renderResultsMasthead', () => {
  it.each([false, true])('keeps the publisher signature first when interactive is %s', (interactive) => {
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive })

    const masthead = container.querySelector('.masthead')
    const navigation = masthead.firstElementChild

    expect(navigation.classList.contains('masthead-navigation')).toBe(true)
    expect(navigation.firstElementChild.classList.contains('publisher-brand')).toBe(true)
    expect(masthead.querySelector('.masthead-meta .publisher-brand')).toBeNull()
  })

  it('renders help, view, and return shortcuts as actions on the interactive page', () => {
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive: true })

    const actions = Array.from(
      container.querySelectorAll('.masthead-hint .shortcut-action')
    )

    expect(actions.map((action) => action.dataset.uiAction)).toEqual([
      'help',
      'view-options',
      'return-search'
    ])
  })
})
