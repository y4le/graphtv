import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/data/provider.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    searchShows: vi.fn()
  }
})

import { POPULAR_SHOW_TITLES } from '../../src/data/popularShows.js'
import { searchShows } from '../../src/data/provider.js'
import {
  renderSearchMasthead,
  renderSearchPage,
  requestSearchFocusOnNextPage
} from '../../src/pages/search.js'
import {
  PLACEHOLDER_FADE_MS,
  PLACEHOLDER_ROTATION_MS
} from '../../src/ui/placeholderRotation.js'

let originalPath

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.sessionStorage.clear()
  vi.mocked(searchShows).mockReset()
  vi.mocked(searchShows).mockResolvedValue([])
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

    expect(
      masthead.firstElementChild.classList.contains('publisher-brand')
    ).toBe(true)
    expect(masthead.querySelector('.masthead-meta .publisher-brand')).toBeNull()
  })

  it('renders help and view shortcuts as actions while leaving search as a key hint', () => {
    const container = document.createElement('div')
    container.innerHTML = renderSearchMasthead()

    const actions = Array.from(
      container.querySelectorAll('.masthead-hint .shortcut-action')
    )

    expect(actions.map((action) => action.dataset.uiAction)).toEqual([
      'help',
      'view-options'
    ])
    expect(actions.every((action) => action.classList.contains('keycap'))).toBe(
      true
    )
    expect(
      container.querySelector('.masthead-hint kbd.keycap').textContent
    ).toBe('/')
    expect(
      Array.from(
        container.querySelectorAll('.masthead-actions .masthead-action')
      ).map((action) => action.dataset.uiAction)
    ).toEqual(['help', 'view-options'])
  })
})

describe('renderSearchPage', () => {
  function renderPage(path = '/') {
    window.history.replaceState({}, '', path)
    const container = document.createElement('div')
    document.body.replaceChildren(container)
    const page = renderSearchPage(container)

    return {
      clearButton: container.querySelector('.search-clear'),
      container,
      form: container.querySelector('.search-form'),
      input: container.querySelector('#search-query'),
      page,
      results: container.querySelector('.search-results-list'),
      status: container.querySelector('.results-status')
    }
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

  it('leaves the empty landing search unfocused so its placeholder can rotate', () => {
    vi.useFakeTimers()
    const { input, page } = renderPage()

    expect(input.hasAttribute('autofocus')).toBe(false)
    page.focusInitial()
    expect(document.activeElement).toBe(document.body)

    page.destroy()
  })

  it('leaves focus alone when the page opens with a query', () => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(
      () => {}
    )
    const { input, page } = renderPage('/?q=fringe')

    expect(input.hasAttribute('autofocus')).toBe(false)
    page.focusInitial()
    expect(document.activeElement).toBe(document.body)

    page.destroy()
  })

  it('restores focus when returning from a show page', () => {
    vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(
      () => {}
    )
    requestSearchFocusOnNextPage()
    const { input, page } = renderPage('/?q=fringe')

    expect(input.hasAttribute('autofocus')).toBe(false)
    page.focusInitial()
    expect(document.activeElement).toBe(input)
    expect(window.sessionStorage.getItem('graphtv-focus-search')).toBeNull()

    page.destroy()
  })

  it('renders a consistent clear affordance and mobile input hints', () => {
    const { clearButton, container, input, page } = renderPage()

    expect(clearButton.hidden).toBe(true)
    expect(clearButton.getAttribute('aria-label')).toBe(
      'Clear search and results'
    )
    expect(input.required).toBe(false)
    expect(input.getAttribute('enterkeyhint')).toBe('search')
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(container.querySelector('.search-form').getAttribute('role')).toBe(
      'search'
    )
    expect(container.querySelector('.provider-note')).toBeNull()

    input.value = 'wire'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(clearButton.hidden).toBe(false)

    page.destroy()
  })

  it('keeps committed results when the draft is deleted and resets them from Clear', async () => {
    vi.mocked(searchShows).mockResolvedValue([createSearchResult()])
    const { clearButton, container, form, input, page, results, status } =
      renderPage()

    input.value = 'wire'
    form.requestSubmit()
    await vi.waitFor(() => expect(results.children).toHaveLength(1))

    expect(status.textContent).toBe('')
    expect(container.querySelector('.search-document').classList).toContain(
      'search-document-has-results'
    )
    expect(new URL(window.location.href).searchParams.get('q')).toBe('wire')

    input.value = ''
    input.dispatchEvent(new Event('input', { bubbles: true }))

    expect(results.children).toHaveLength(1)
    expect(status.textContent).toBe('')
    expect(clearButton.hidden).toBe(false)
    expect(new URL(window.location.href).searchParams.get('q')).toBe('wire')

    clearButton.click()

    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(results.children).toHaveLength(0)
    expect(status.textContent).toBe('')
    expect(clearButton.hidden).toBe(true)
    expect(new URL(window.location.href).searchParams.has('q')).toBe(false)
    expect(container.querySelector('.search-document').classList).toContain(
      'search-document-empty'
    )
    expect(container.querySelector('.search-document').classList).not.toContain(
      'search-document-has-results'
    )

    page.destroy()
  })

  it('treats an empty or whitespace-only submission as the same full reset', async () => {
    vi.mocked(searchShows).mockResolvedValue([createSearchResult()])
    const { clearButton, form, input, page, results, status } = renderPage()

    input.value = 'wire'
    form.requestSubmit()
    await vi.waitFor(() => expect(results.children).toHaveLength(1))

    input.value = '   '
    input.focus()
    form.requestSubmit()

    expect(searchShows).toHaveBeenCalledOnce()
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(results.children).toHaveLength(0)
    expect(status.textContent).toBe('')
    expect(clearButton.hidden).toBe(true)
    expect(new URL(window.location.href).searchParams.has('q')).toBe(false)

    page.destroy()
  })

  it('exits insert mode on a committed submit and passes an abort signal', () => {
    const pending = createDeferred()
    vi.mocked(searchShows).mockReturnValue(pending.promise)
    const { form, input, page } = renderPage()

    input.value = 'wire'
    input.focus()
    form.requestSubmit()

    expect(document.activeElement).toBe(document.body)
    expect(searchShows).toHaveBeenCalledWith(
      'wire',
      'tvmaze',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )

    page.destroy()
  })

  it('ignores stale searches that finish out of order', async () => {
    const first = createDeferred()
    const second = createDeferred()
    vi.mocked(searchShows)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { form, input, page, results, status } = renderPage()

    input.value = 'alpha'
    form.requestSubmit()
    const firstSignal = vi.mocked(searchShows).mock.calls[0][2].signal

    input.value = 'bravo'
    form.requestSubmit()

    expect(firstSignal.aborted).toBe(true)
    second.resolve([createSearchResult({ id: 'tvmaze:2', title: 'Bravo' })])
    await vi.waitFor(() => expect(results.textContent).toContain('Bravo'))

    first.resolve([createSearchResult({ id: 'tvmaze:1', title: 'Alpha' })])
    await Promise.resolve()

    expect(results.textContent).toContain('Bravo')
    expect(results.textContent).not.toContain('Alpha')
    expect(status.textContent).toBe('')

    page.destroy()
  })

  it('prevents a cleared in-flight search from repopulating results', async () => {
    const pending = createDeferred()
    vi.mocked(searchShows).mockReturnValue(pending.promise)
    const { clearButton, form, input, page, results, status } = renderPage()

    input.value = 'wire'
    form.requestSubmit()
    const signal = vi.mocked(searchShows).mock.calls[0][2].signal
    clearButton.click()

    expect(signal.aborted).toBe(true)
    pending.resolve([createSearchResult()])
    await Promise.resolve()

    expect(results.children).toHaveLength(0)
    expect(status.textContent).toBe('')

    page.destroy()
  })

  it('keeps status semantics scoped and moves real focus with result selection', async () => {
    vi.mocked(searchShows).mockResolvedValue([
      createSearchResult(),
      createSearchResult({ id: 'tvmaze:2', title: 'The Wire UK', year: '2005' })
    ])
    const { container, form, input, page, results, status } = renderPage()

    input.value = 'wire'
    form.requestSubmit()
    await vi.waitFor(() => expect(results.children).toHaveLength(2))

    expect(
      container
        .querySelector('.search-results-section')
        .hasAttribute('aria-live')
    ).toBe(false)
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.getAttribute('aria-atomic')).toBe('true')
    expect(status.textContent).toBe('')
    expect(results.getAttribute('aria-label')).toBe(
      'Search results for wire: 2'
    )
    expect(results.querySelector('[aria-current]')).toBeNull()
    expect(results.querySelector('.search-result-meta').textContent).toBe(
      '2002 · Crime · Drama'
    )
    expect(results.querySelector('img').getAttribute('loading')).toBe('lazy')

    page.moveSelection(1)

    const links = results.querySelectorAll('.search-result-link')
    expect(document.activeElement).toBe(links[1])
    expect(links[0].tabIndex).toBe(-1)
    expect(links[1].tabIndex).toBe(0)

    page.destroy()
  })

  it('keeps the search form anchored for no-results and error states', async () => {
    const { container, form, input, page, status } = renderPage()

    input.value = 'missing'
    form.requestSubmit()
    await vi.waitFor(() =>
      expect(status.textContent).toContain('No shows found')
    )
    expect(container.querySelector('.search-document').classList).not.toContain(
      'search-document-empty'
    )

    vi.mocked(searchShows).mockRejectedValueOnce(
      new Error('Provider unavailable')
    )
    input.value = 'error'
    form.requestSubmit()
    await vi.waitFor(() =>
      expect(status.textContent).toBe('Provider unavailable')
    )
    expect(container.querySelector('.search-document').classList).not.toContain(
      'search-document-empty'
    )

    page.destroy()
  })
})

function createSearchResult(overrides = {}) {
  return {
    id: 'tvmaze:179',
    title: 'The Wire',
    year: '2002',
    genres: ['Crime', 'Drama', 'Thriller'],
    poster: 'https://example.com/wire.jpg',
    ...overrides
  }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
