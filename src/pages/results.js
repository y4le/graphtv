import {
  getComparisonProviders,
  getProviderCatalog,
  getShowBundle,
  parseShowRef
} from '../data/provider.js'
import { getUrlParams } from '../lib/url.js'
import { createChart } from '../viz/ratingsChart.js'
import { formatRatingBadge, renderError, renderLoading, renderPublisherBrand } from './shared.js'
import { requestSearchFocusOnNextPage } from './search.js'

export function renderResultsMasthead({ interactive = false } = {}) {
  return `
    <header class="masthead">
      <div class="masthead-navigation">
        ${renderPublisherBrand()}
        <a class="back-link" href="${buildBackHref()}">Back to search</a>
      </div>
      ${
        interactive
          ? `<div class="masthead-meta">
              <div class="masthead-actions" aria-label="Page actions">
                <button type="button" class="masthead-action" data-ui-action="help">Help</button>
                <button type="button" class="masthead-action" data-ui-action="view-options">Options</button>
              </div>
              <p class="masthead-hint">
                Press <button type="button" class="shortcut-action" data-ui-action="help" aria-label="? shortcut: Open help">?</button> for help,
                <button type="button" class="shortcut-action" data-ui-action="view-options" aria-label="v shortcut: Open view options">v</button> for view options,
                <button type="button" class="shortcut-action" data-ui-action="return-search" aria-label="q shortcut: Return to search">q</button> to return.
              </p>
            </div>`
          : ''
      }
    </header>
  `
}

export async function renderResultsPage(container, showRef) {
  container.innerHTML = `
    <main class="document-shell">
      ${renderResultsMasthead()}
      ${renderLoading('Loading show details…')}
    </main>
  `

  try {
    const debugEnabled = true
    const { provider } = parseShowRef(showRef)
    const bundle = await getShowBundle(showRef, {
      compareProviders: getComparisonProviders(provider)
    })

    document.title = `${bundle.show.title} · graphtv`

    container.innerHTML = `
      <main class="document-shell results-document">
        ${renderResultsMasthead({ interactive: true })}
        <header class="results-heading">
          <h1 tabindex="-1" class="results-title">${escapeHtml(bundle.show.title)}</h1>
          ${bundle.show.year ? `<p class="results-year">${escapeHtml(bundle.show.year)}</p>` : ''}
        </header>
        <section class="results-layout">
          <section class="results-data">
            <div class="chart-root"></div>
          </section>
          <section
            class="results-episode"
            aria-label="Selected episode details"
          ></section>
          <aside class="results-context">
            <div class="show-header">
              <div class="show-poster-shell">
                ${
                  bundle.show.poster
                    ? `<img src="${bundle.show.poster}" alt="" class="show-poster" />`
                    : `<div class="poster-fallback large">No art</div>`
                }
              </div>
              <div class="show-facts">
                <p class="show-meta">${escapeHtml(bundle.show.genres.join(' · '))}</p>
                <ul class="show-metrics">
                  ${bundle.show.ratings.map((rating) => `<li class="rating-badge">${formatRatingBadge(rating)}</li>`).join('')}
                </ul>
              </div>
              <div class="show-copy">
                <p class="show-plot">${escapeHtml(bundle.show.plot ?? 'No synopsis available.')}</p>
                ${
                  bundle.mismatches.length
                    ? `<p class="mismatch-note">Provider mismatches detected: ${bundle.mismatches.length}. Use debug mode for the raw comparison.</p>`
                    : ''
                }
              </div>
            </div>
            <p class="provider-note compact context-sources">
              Sources:
              ${getProviderCatalog()
                .filter((item) => item.configured && item.provider !== 'testdb')
                .map((item) => `<span class="provider-inline configured">${item.label}</span>`)
                .join('')}
            </p>
          </aside>
        </section>
      </main>
    `

    const chart = createChart(container.querySelector('.chart-root'), bundle.seasons, {
      detailRoot: container.querySelector('.results-episode')
    })
    return {
      kind: 'results',
      debugEnabled,
      chart,
      focusInitial() {},
      focusSearch() {
        requestSearchFocusOnNextPage()
        window.location.href = buildBackHref()
      },
      goBack() {
        requestSearchFocusOnNextPage()
        window.location.href = buildBackHref()
      },
      getDebugSections() {
        return [
          {
            title: 'Provider catalog',
            data: getProviderCatalog()
          },
          {
            title: 'Provider diagnostics',
            data: bundle.providerDiagnostics
          },
          {
            title: 'Merged bundle',
            data: bundle
          },
          {
            title: 'Chart state',
            data: chart.getDebugState()
          }
        ]
      },
      destroy() {
        chart.destroy()
      }
    }
  } catch (error) {
    container.innerHTML = `
      <main class="document-shell">
        ${renderResultsMasthead()}
        ${renderError(error.message)}
      </main>
    `
    return {
      kind: 'results',
      debugEnabled: false,
      chart: null,
      focusInitial() {},
      focusSearch() {
        requestSearchFocusOnNextPage()
        window.location.href = buildBackHref()
      },
      goBack() {
        requestSearchFocusOnNextPage()
        window.location.href = buildBackHref()
      },
      getDebugSections() {
        return []
      }
    }
  }
}

function buildBackHref() {
  const params = getUrlParams()
  const nextParams = new URLSearchParams()
  if (params.has('q')) {
    nextParams.set('q', params.get('q'))
  }
  if (params.has('debug')) {
    nextParams.set('debug', params.get('debug') || '1')
  }
  if (params.has('api')) {
    nextParams.set('api', params.get('api'))
  }

  return nextParams.toString() ? `?${nextParams.toString()}` : window.location.pathname
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
