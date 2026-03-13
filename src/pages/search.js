import { getActiveProvider, getProviderCatalog, getProviderLabel, searchShows } from '../data/provider.js'
import { buildUrl, getUrlParams, preserveDebugParams } from '../lib/url.js'
import { renderEmpty, renderError, renderLoading } from './shared.js'

export function renderSearchPage(container) {
  const params = getUrlParams()
  const provider = getActiveProvider(params)
  const query = params.get('q') ?? ''

  container.innerHTML = `
    <main class="page-shell">
      <section class="search-hero panel">
        <p class="eyebrow">GraphTV</p>
        <h1>Search a show and inspect episode ratings across providers.</h1>
        <p class="lede">Default provider: ${getProviderLabel(provider)}. Use debug mode to inspect normalized data and provider availability.</p>
        <form class="search-form">
          <label class="search-label" for="search-query">Search shows</label>
          <div class="search-row">
            <input id="search-query" name="q" type="search" value="${escapeAttribute(query)}" placeholder="The Wire" autocomplete="off" required />
            <button type="submit">Search</button>
          </div>
        </form>
        <div class="provider-pills">
          ${getProviderCatalog()
            .map(
              (item) => `<span class="provider-pill ${item.configured ? 'configured' : 'disabled'}">${item.label}</span>`
            )
            .join('')}
        </div>
      </section>
      <section class="results-panel panel">
        <div class="results-status">${query ? renderLoading('Searching…') : renderEmpty('Search for a show to begin.')}</div>
        <div class="search-results"></div>
      </section>
      <aside class="debug-root"></aside>
    </main>
  `

  const form = container.querySelector('.search-form')
  const resultsStatus = container.querySelector('.results-status')
  const resultsRoot = container.querySelector('.search-results')

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
        resultsStatus.innerHTML = renderEmpty('No shows matched that query.')
        return
      }

      resultsStatus.innerHTML = ''
      resultsRoot.innerHTML = results
        .map(
          (show) => `
            <article class="result-card">
              <a href="${buildShowLink(show.id)}" class="result-link">
                <div class="result-poster-shell">
                  ${
                    show.poster
                      ? `<img src="${show.poster}" alt="" class="result-poster" />`
                      : `<div class="poster-fallback">No art</div>`
                  }
                </div>
                <div class="result-copy">
                  <h2>${show.title}</h2>
                  <p>${show.year || 'Unknown year'}</p>
                </div>
              </a>
            </article>
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
