import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POPULAR_SHOW_TITLES } from '../../src/data/popularShows.js'
import { renderSearchMasthead, renderSearchPage } from '../../src/pages/search.js'
import { PLACEHOLDER_FADE_MS, PLACEHOLDER_ROTATION_MS } from '../../src/ui/placeholderRotation.js'

let originalPath

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState({}, '', originalPath)
  document.body.replaceChildren()
})

describe('renderSearchMasthead', () => {
  it('keeps the publisher signature first and outside the right-aligned metadata', () => {
    const container = document.createElement('div')
    container.innerHTML = renderSearchMasthead()

    const masthead = container.querySelector('.masthead')

    expect(masthead.firstElementChild.classList.contains('publisher-brand')).toBe(true)
    expect(masthead.querySelector('.masthead-meta .publisher-brand')).toBeNull()
  })
})

describe('renderSearchPage', () => {
  it('wires the rotating placeholder to a stable accessible name and lifecycle', () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', '/')
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    const page = renderSearchPage(container)
    const input = container.querySelector('#search-query')

    expect(input.getAttribute('aria-label')).toBe('Show title')
    expect(input.hasAttribute('autofocus')).toBe(true)
    expect(POPULAR_SHOW_TITLES).toContain(input.placeholder)
    expect(container.querySelector('.results-status').textContent).toBe('')
    expect(vi.getTimerCount()).toBe(1)

    page.focusInitial()
    expect(document.activeElement).toBe(input)

    vi.advanceTimersByTime(PLACEHOLDER_ROTATION_MS + PLACEHOLDER_FADE_MS)
    expect(input.getAttribute('aria-label')).toBe('Show title')

    page.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })
})
