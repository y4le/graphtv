import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { renderResultsMasthead } from '../../src/pages/results.js'

let originalPath

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
})

afterEach(() => {
  window.history.replaceState({}, '', originalPath)
})

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
    expect(
      Array.from(container.querySelectorAll('.masthead-actions .masthead-action')).map(
        (action) => action.dataset.uiAction
      )
    ).toEqual(['help', 'view-options'])
  })

  it('links back to a blank search page without preserving any query parameters', () => {
    window.history.replaceState(
      {},
      '',
      '/graphtv/?show=tvmaze%3A2790&q=the+good+place&api=omdb&debug=1'
    )
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive: true })

    const target = new URL(container.querySelector('.back-link').href)

    expect(target.pathname).toBe('/graphtv/')
    expect(target.search).toBe('')
    expect(target.hash).toBe('')
  })
})
