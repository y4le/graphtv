import {
  getActiveProvider,
  getProviderCatalog,
  searchShows
} from '../data/provider.js'
import { SHOW_INDEX } from '../data/showIndexData.js'
import { buildUrl, getUrlParams, preserveDebugParams } from '../lib/url.js'
import { escapeHtml } from '../lib/html.js'
import { createPlaceholderRotation } from '../ui/placeholderRotation.js'
import { renderShowIndex } from '../ui/showIndex.js'
import {
  renderEmpty,
  renderError,
  renderLoading,
  renderPublisherBrand
} from './shared.js'

export function renderSearchMasthead() {
  return `
    <header class="masthead">
      ${renderPublisherBrand()}
      <div class="masthead-meta">
        <div class="masthead-actions" aria-label="Page actions">
          <button type="button" class="masthead-action" data-ui-action="view-options">Options <span class="action-key">(o)</span></button>
          <button type="button" class="masthead-action" data-ui-action="help">Help <span class="action-key">(?)</span></button>
        </div>
      </div>
    </header>
  `
}

export function renderSearchPage(container) {
  const params = getUrlParams()
  const provider = getActiveProvider(params)
  const query = params.get('q') ?? ''
  const debugEnabled = true
  const state = {
    committedQuery: query,
    requestId: 0,
    abortController: null,
    results: [],
    selectedIndex: -1
  }

  container.innerHTML = `
    <main class="document-shell document-shell-search">
      ${renderSearchMasthead()}
      <div class="search-landing-content">
        <section class="search-document ${query ? '' : 'search-document-empty'}">
          <h1 class="visually-hidden">GraphTV</h1>
          <form class="search-form" role="search" aria-label="Search shows">
            <div class="search-row">
              <div class="search-field">
                <input
                  id="search-query"
                  name="q"
                  type="search"
                  value="${escapeHtml(query)}"
                  aria-label="Show title"
                  aria-controls="search-results"
                  placeholder="The Americans"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                  enterkeyhint="search"
                />
                <button
                  type="button"
                  class="search-clear"
                  aria-label="Clear search and results"
                  ${query ? '' : 'hidden'}
                ><span aria-hidden="true">×</span></button>
              </div>
              <button type="submit" class="search-submit">Plot</button>
            </div>
          </form>
          <section class="search-results-section" aria-busy="${query ? 'true' : 'false'}">
            <div class="results-status" aria-live="polite" aria-atomic="true">${query ? renderLoading('Searching…', { announce: false }) : ''}</div>
            <ol
              id="search-results"
              class="search-results-list"
              data-focus-zone="search-results"
              aria-label="Search results"
            ></ol>
          </section>
        </section>
        ${renderShowIndex({
          buildHref: (showId) => buildShowLink(showId, { includeQuery: false })
        })}
      </div>
    </main>
  `

  const form = container.querySelector('.search-form')
  const input = container.querySelector('#search-query')
  const clearButton = container.querySelector('.search-clear')
  const resultsStatus = container.querySelector('.results-status')
  const resultsSection = container.querySelector('.search-results-section')
  const resultsRoot = container.querySelector('.search-results-list')
  const searchDocument = container.querySelector('.search-document')
  const placeholderRotation = createPlaceholderRotation(input)

  function syncEmptyLayout(isEmpty) {
    searchDocument.classList.toggle('search-document-empty', isEmpty)
  }

  function syncResultsLayout(hasResults) {
    searchDocument.classList.toggle('search-document-has-results', hasResults)
  }

  function syncClearControl() {
    clearButton.hidden =
      input.value.length === 0 && state.committedQuery.length === 0
  }

  function updateSearchUrl(nextQuery) {
    const nextParams = preserveDebugParams(new URLSearchParams())

    if (nextQuery) {
      nextParams.set('q', nextQuery)
    }
    if (provider !== 'tvmaze') {
      nextParams.set('api', provider)
    }

    window.history.replaceState({}, '', buildUrl(nextParams))
  }

  function invalidateActiveRequest() {
    state.requestId += 1
    state.abortController?.abort()
    state.abortController = null
  }

  function resetSearch({ focus = true } = {}) {
    invalidateActiveRequest()
    input.value = ''
    state.committedQuery = ''
    state.results = []
    state.selectedIndex = -1
    resultsRoot.replaceChildren()
    resultsRoot.setAttribute('aria-label', 'Search results')
    resultsStatus.replaceChildren()
    resultsSection.setAttribute('aria-busy', 'false')
    updateSearchUrl('')
    syncEmptyLayout(true)
    syncResultsLayout(false)
    syncClearControl()
    placeholderRotation.restart()

    if (focus) {
      input.focus({ preventScroll: true })
    }
  }

  function selectResult(index, { focus = true } = {}) {
    if (state.results.length === 0) {
      return
    }

    state.selectedIndex = clamp(index, 0, state.results.length - 1)
    syncResultSelection(resultsRoot, state.selectedIndex, { focus })
  }

  input.addEventListener('input', syncClearControl)
  clearButton.addEventListener('click', () => resetSearch())

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(form)
    const nextQuery = String(formData.get('q') || '').trim()

    if (document.activeElement === input) {
      input.blur()
    }

    if (!nextQuery) {
      resetSearch()
      return
    }

    state.abortController?.abort()
    const requestId = ++state.requestId
    const abortController = new AbortController()
    state.abortController = abortController
    state.committedQuery = nextQuery
    input.value = nextQuery
    state.results = []
    state.selectedIndex = -1
    updateSearchUrl(nextQuery)
    syncClearControl()
    resultsStatus.innerHTML = renderLoading('Searching…', {
      announce: false
    })
    resultsRoot.replaceChildren()
    resultsRoot.setAttribute('aria-label', `Search results for ${nextQuery}`)
    resultsSection.setAttribute('aria-busy', 'true')
    syncEmptyLayout(false)
    syncResultsLayout(false)

    try {
      const results = await searchShows(nextQuery, provider, {
        signal: abortController.signal
      })

      if (requestId !== state.requestId) {
        return
      }

      if (results.length === 0) {
        resultsStatus.innerHTML = renderEmpty(
          `No shows found for “${nextQuery}”.`
        )
        return
      }

      state.results = results
      state.selectedIndex = 0
      resultsStatus.replaceChildren()
      resultsRoot.setAttribute(
        'aria-label',
        `Search results for ${nextQuery}: ${results.length}`
      )
      renderResultsList(resultsRoot, state.results, state.selectedIndex)
      syncEmptyLayout(false)
      syncResultsLayout(true)
    } catch (error) {
      if (requestId !== state.requestId || error?.name === 'AbortError') {
        return
      }

      resultsStatus.innerHTML = renderError(
        error?.message || 'Search failed. Try again.'
      )
    } finally {
      if (requestId === state.requestId) {
        state.abortController = null
        resultsSection.setAttribute('aria-busy', 'false')
      }
    }
  })

  if (query) {
    form.requestSubmit()
  }

  return {
    kind: 'search',
    debugEnabled,
    focusInitial() {
      input.focus({ preventScroll: true })
    },
    focusSearch() {
      input.focus({ preventScroll: true })
      input.select()
    },
    moveSelection(delta) {
      selectResult(state.selectedIndex + delta)
    },
    jumpSelection(edge) {
      selectResult(edge === 'start' ? 0 : state.results.length - 1)
    },
    openSelection() {
      const active = resultsRoot.querySelector(
        '.search-result-item.is-selected .search-result-link'
      )
      if (active) {
        active.click()
      }
    },
    getCreditsContext() {
      return {
        providers: Array.from(new Set([provider, SHOW_INDEX.source])),
        show: null
      }
    },
    getDebugSections() {
      return [
        {
          title: 'Search route',
          data: { provider, query: state.committedQuery }
        },
        {
          title: 'Provider catalog',
          data: getProviderCatalog()
        },
        {
          title: 'Search state',
          data: {
            results: state.results.length,
            selectedIndex: state.selectedIndex
          }
        },
        {
          title: 'Landing index',
          data: {
            builtAt: SHOW_INDEX.builtAt,
            source: SHOW_INDEX.source,
            sections: SHOW_INDEX.sections.map(({ id, rows }) => ({
              id,
              count: rows.length
            }))
          }
        }
      ]
    },
    destroy() {
      invalidateActiveRequest()
      placeholderRotation.destroy()
    }
  }
}

function renderResultsList(root, results, selectedIndex) {
  root.innerHTML = results
    .map(
      (show, index) => `
        <li class="search-result-item ${index === selectedIndex ? 'is-selected' : ''}" data-result-index="${index}">
          <a href="${escapeHtml(buildShowLink(show.id))}" class="search-result-link" tabindex="${index === selectedIndex ? '0' : '-1'}">
            ${show.poster ? `<img src="${escapeHtml(show.poster)}" alt="" class="search-result-poster" loading="lazy" decoding="async" />` : '<span class="search-result-rule" aria-hidden="true"></span>'}
            <span class="search-result-copy">
              <span class="search-result-title">${escapeHtml(show.title)}</span>
              <span class="search-result-meta">${escapeHtml(formatSearchResultMeta(show))}</span>
            </span>
          </a>
        </li>
      `
    )
    .join('')
}

function syncResultSelection(root, selectedIndex, { focus = false } = {}) {
  const items = Array.from(root.querySelectorAll('.search-result-item'))

  for (const [index, item] of items.entries()) {
    const isSelected = index === selectedIndex
    item.classList.toggle('is-selected', isSelected)
    item.querySelector('.search-result-link').tabIndex = isSelected ? 0 : -1
  }

  if (!focus) {
    return
  }

  const active = items[selectedIndex]?.querySelector('.search-result-link')
  active?.focus({ preventScroll: true })
  active?.scrollIntoView?.({
    block: 'nearest',
    behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
  })
}

function formatSearchResultMeta(show) {
  return [show.year || 'Unknown year', ...(show.genres ?? []).slice(0, 2)]
    .filter(Boolean)
    .join(' · ')
}

export function buildShowLink(showId, { includeQuery = true } = {}) {
  const params = preserveDebugParams(new URLSearchParams())
  const currentParams = getUrlParams()
  params.set('show', showId)
  if (includeQuery && currentParams.has('q')) {
    params.set('q', currentParams.get('q'))
  }
  return buildUrl(params)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
