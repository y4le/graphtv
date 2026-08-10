import {
  getComparisonProviders,
  getProviderCatalog,
  getProviderLabel,
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
                <button type="button" class="masthead-action" data-ui-action="view-options">Options</button>
              </div>
              <p class="masthead-hint">Press <kbd>?</kbd> for help, <kbd>v</kbd> for view options, <kbd>q</kbd> to return.</p>
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
        <section class="results-layout">
          <aside class="results-context">
            <div class="show-header">
              <div class="show-poster-shell">
                ${
                  bundle.show.poster
                    ? `<img src="${bundle.show.poster}" alt="" class="show-poster" />`
                    : `<div class="poster-fallback large">No art</div>`
                }
              </div>
              <div class="show-title-lockup">
                <p class="document-kicker">${getProviderLabel(bundle.primarySource)}</p>
                <h1 tabindex="-1" class="results-title">${escapeHtml(bundle.show.title)}</h1>
              </div>
              <div class="show-copy">
                <p class="show-meta">${escapeHtml([bundle.show.year, ...bundle.show.genres].filter(Boolean).join(' · '))}</p>
                <p class="show-metrics">${bundle.show.ratings.map((rating) => `<span class="rating-badge">${formatRatingBadge(rating)}</span>`).join(' · ')}</p>
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
                .filter((item) => item.configured)
                .map((item) => `<span class="provider-inline configured">${item.label}</span>`)
                .join('')}
            </p>
          </aside>
          <section class="results-data">
            <div class="chart-root"></div>
          </section>
        </section>
      </main>
    `

    const chart = createChart(container.querySelector('.chart-root'), bundle.seasons, {
      detailRoot: null
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
