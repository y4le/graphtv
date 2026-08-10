import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POPULAR_SHOW_TITLES } from '../../src/data/popularShows.js'
import {
  renderSearchMasthead,
  renderSearchPage,
  requestSearchFocusOnNextPage
} from '../../src/pages/search.js'
import { PLACEHOLDER_FADE_MS, PLACEHOLDER_ROTATION_MS } from '../../src/ui/placeholderRotation.js'

let originalPath

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState({}, '', originalPath)
  window.sessionStorage.clear()
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
  function renderPage(path = '/') {
    window.history.replaceState({}, '', path)
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    const page = renderSearchPage(container)

    return { container, input: container.querySelector('#search-query'), page }
  }

  it('wires the rotating placeholder to a stable accessible name and lifecycle', () => {
    vi.useFakeTimers()
    const { container, input, page } = renderPage()

    expect(input.getAttribute('aria-label')).toBe('Show title')
    expect(POPULAR_SHOW_TITLES).toContain(input.placeholder)
    expect(container.querySelector('.results-status').textContent).toBe('')
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(PLACEHOLDER_ROTATION_MS + PLACEHOLDER_FADE_MS)
    expect(input.getAttribute('aria-label')).toBe('Show title')

    page.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('focuses the empty landing search on load', () => {
    vi.useFakeTimers()
    const { input, page } = renderPage()

    expect(input.hasAttribute('autofocus')).toBe(true)
    page.focusInitial()
    expect(document.activeElement).toBe(input)

    page.destroy()
  })

  it('leaves focus alone when the page opens with a query', () => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    const { input, page } = renderPage('/?q=fringe')

    expect(input.hasAttribute('autofocus')).toBe(false)
    page.focusInitial()
    expect(document.activeElement).toBe(document.body)

    page.destroy()
  })

  it('restores focus when returning from a show page', () => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    requestSearchFocusOnNextPage()
    const { input, page } = renderPage('/?q=fringe')

    expect(input.hasAttribute('autofocus')).toBe(false)
    page.focusInitial()
    expect(document.activeElement).toBe(input)
    expect(window.sessionStorage.getItem('graphtv-focus-search')).toBeNull()

    page.destroy()
  })
})
