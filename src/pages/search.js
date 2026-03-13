import { getActiveProvider, getProviderCatalog, getProviderLabel, searchShows } from '../data/provider.js'
import { buildUrl, getUrlParams, preserveDebugParams } from '../lib/url.js'
import { renderEmpty, renderError, renderLoading } from './shared.js'

const SEARCH_FOCUS_KEY = 'graphtv-focus-search'

export function renderSearchPage(container) {
  const params = getUrlParams()
  const provider = getActiveProvider(params)
  const query = params.get('q') ?? ''
  const debugEnabled = true
  const state = {
    results: [],
    selectedIndex: -1
  }

  container.innerHTML = `
    <main class="document-shell document-shell-search">
      <header class="masthead">
        <p class="masthead-mark">GraphTV</p>
        <p class="masthead-hint">Press <kbd>/</kbd> to search, <kbd>?</kbd> for help, <kbd>v</kbd> for view options.</p>
      </header>
      <section class="search-document">
        <p class="document-kicker">Episode ratings as an analytical document.</p>
        <h1 class="document-title">Search a show and inspect how its seasons rise, fall, and disagree across sources.</h1>
        <p class="document-lede">
          Default provider: ${getProviderLabel(provider)}.
          Search results, charts, and debug inspection all share the same normalized model.
        </p>
        <form class="search-form" aria-label="Search shows">
          <label class="search-label" for="search-query">Search shows</label>
          <div class="search-row">
            <input
              id="search-query"
              name="q"
              type="search"
              value="${escapeAttribute(query)}"
              placeholder="The Americans"
              autocomplete="off"
              required
            />
            <button type="submit">Search</button>
          </div>
        </form>
        <p class="provider-note">
          Configured sources:
          ${getProviderCatalog()
            .map((item) => `<span class="provider-inline ${item.configured ? 'configured' : 'disabled'}">${item.label}</span>`)
            .join('')}
        </p>
        <section class="search-results-section" aria-live="polite">
          <div class="results-status">${query ? renderLoading('Searching…') : renderEmpty('Search for a series title to begin.')}</div>
          <ol class="search-results-list" data-focus-zone="search-results"></ol>
        </section>
      </section>
    </main>
  `

  const form = container.querySelector('.search-form')
  const input = container.querySelector('#search-query')
  const resultsStatus = container.querySelector('.results-status')
  const resultsRoot = container.querySelector('.search-results-list')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(form)
    const nextQuery = String(formData.get('q') || '').trim()

    const nextParams = preserveDebugParams(new URLSearchParams())
    nextParams.set('q', nextQuery)
    if (provider !== 'tvmaze') {
      nextParams.set('api', provider)
    }
    window.history.replaceState({}, '', buildUrl(nextParams))

    resultsStatus.innerHTML = renderLoading(`Searching ${getProviderLabel(provider)}…`)
    resultsRoot.innerHTML = ''
    state.results = []
    state.selectedIndex = -1

    try {
      const results = await searchShows(nextQuery, provider)

      if (results.length === 0) {
        resultsStatus.innerHTML = renderEmpty(`No shows found for “${escapeHtml(nextQuery)}”.`)
        return
      }

      state.results = results
      state.selectedIndex = 0
      resultsStatus.innerHTML = ''
      renderResultsList(resultsRoot, state.results, state.selectedIndex)
    } catch (error) {
      resultsStatus.innerHTML = renderError(error.message)
    }
  })

  if (query) {
    form.requestSubmit()
  }

  return {
    kind: 'search',
    debugEnabled,
    focusInitial() {
      if (!query || window.sessionStorage.getItem(SEARCH_FOCUS_KEY) === '1') {
        window.sessionStorage.removeItem(SEARCH_FOCUS_KEY)
        input.focus({ preventScroll: true })
      }
    },
    focusSearch() {
      input.focus({ preventScroll: true })
      input.select()
    },
    moveSelection(delta) {
      if (state.results.length === 0) {
        return
      }

      state.selectedIndex = clamp(state.selectedIndex + delta, 0, state.results.length - 1)
      renderResultsList(resultsRoot, state.results, state.selectedIndex)
    },
    jumpSelection(edge) {
      if (state.results.length === 0) {
        return
      }

      state.selectedIndex = edge === 'start' ? 0 : state.results.length - 1
      renderResultsList(resultsRoot, state.results, state.selectedIndex)
    },
    openSelection() {
      const active = resultsRoot.querySelector('.search-result-item.is-selected .search-result-link')
      if (active) {
        window.location.href = active.href
      }
    },
    getDebugSections() {
      return [
        {
          title: 'Search route',
          data: { provider, query }
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
        }
      ]
    }
  }
}

export function requestSearchFocusOnNextPage() {
  window.sessionStorage.setItem(SEARCH_FOCUS_KEY, '1')
}

function renderResultsList(root, results, selectedIndex) {
  root.innerHTML = results
    .map(
      (show, index) => `
        <li class="search-result-item ${index === selectedIndex ? 'is-selected' : ''}">
          <a href="${buildShowLink(show.id)}" class="search-result-link" ${index === selectedIndex ? 'aria-current="true"' : ''}>
            ${show.poster ? `<img src="${show.poster}" alt="" class="search-result-poster" />` : '<span class="search-result-rule" aria-hidden="true"></span>'}
            <span class="search-result-copy">
              <span class="search-result-title">${escapeHtml(show.title)}</span>
              <span class="search-result-meta">${escapeHtml(show.year || 'Unknown year')}</span>
            </span>
          </a>
        </li>
      `
    )
    .join('')
}

function buildShowLink(showId) {
  const params = preserveDebugParams(new URLSearchParams())
  const currentParams = getUrlParams()
  params.set('show', showId)
  if (currentParams.has('q')) {
    params.set('q', currentParams.get('q'))
  }
  return buildUrl(params)
}

function escapeAttribute(value) {
  return value.replaceAll('"', '&quot;')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
