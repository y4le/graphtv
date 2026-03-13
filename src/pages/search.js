import { getActiveProvider, getProviderCatalog, getProviderLabel, searchShows } from '../data/provider.js'
import { buildUrl, getUrlParams, preserveDebugParams } from '../lib/url.js'
import { bindSettingsControls, renderDisplayControls } from '../viz/theme.js'
import { renderEmpty, renderError, renderLoading } from './shared.js'

export function renderSearchPage(container) {
  const params = getUrlParams()
  const provider = getActiveProvider(params)
  const query = params.get('q') ?? ''

  container.innerHTML = `
    <main class="document-shell document-shell-search">
      <header class="masthead">
        <p class="masthead-mark">GraphTV</p>
        ${renderDisplayControls()}
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
          <ol class="search-results-list"></ol>
        </section>
      </section>
      <aside class="debug-root"></aside>
    </main>
  `

  bindSettingsControls(container)

  const form = container.querySelector('.search-form')
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

    try {
      const results = await searchShows(nextQuery, provider)

      if (results.length === 0) {
        resultsStatus.innerHTML = renderEmpty(`No shows found for “${escapeHtml(nextQuery)}”.`)
        return
      }

      resultsStatus.innerHTML = ''
      resultsRoot.innerHTML = results
        .map(
          (show) => `
            <li class="search-result-item">
              <a href="${buildShowLink(show.id)}" class="search-result-link">
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
    } catch (error) {
      resultsStatus.innerHTML = renderError(error.message)
    }
  })

  if (query) {
    form.requestSubmit()
  }

  if (params.has('debug')) {
    renderSearchDebug(container, { provider, query })
  }
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

async function renderSearchDebug(container, data) {
  const debugRoot = container.querySelector('.debug-root')
  const { renderDebugPanel } = await import('../debug/panel.js')
  renderDebugPanel(debugRoot, [
    {
      title: 'Search route',
      data
    },
    {
      title: 'Provider catalog',
      data: getProviderCatalog()
    }
  ])
}
