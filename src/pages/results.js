import {
  getComparisonProviders,
  getProviderCatalog,
  getProviderLabel,
  getShowBundle,
  parseShowRef
} from '../data/provider.js'
import { getUrlParams } from '../lib/url.js'
import { createChart } from '../viz/ratingsChart.js'
import { formatRatingBadge, renderError, renderLoading } from './shared.js'
import { requestSearchFocusOnNextPage } from './search.js'

export async function renderResultsPage(container, showRef) {
  container.innerHTML = `
    <main class="document-shell">
      ${renderLoading('Loading show details…')}
    </main>
  `

  try {
    const params = getUrlParams()
    const debugEnabled = params.has('debug')
    const { provider } = parseShowRef(showRef)
    const bundle = await getShowBundle(showRef, {
      compareProviders: getComparisonProviders(provider)
    })

    document.title = `${bundle.show.title} · GraphTV`

    container.innerHTML = `
      <main class="document-shell results-document">
        <header class="masthead">
          <a class="back-link" href="${buildBackHref()}">Back to search</a>
          <p class="masthead-hint">Press <kbd>?</kbd> for help, <kbd>v</kbd> for view options, <kbd>q</kbd> to return.</p>
        </header>
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
              <div class="show-copy">
                <p class="document-kicker">${getProviderLabel(bundle.primarySource)}</p>
                <h1 tabindex="-1" class="results-title">${escapeHtml(bundle.show.title)}</h1>
                <p class="show-meta">${escapeHtml([bundle.show.year, ...bundle.show.genres].filter(Boolean).join(' · '))}</p>
                <div class="rating-badges">
                  ${bundle.show.ratings.map((rating) => `<span class="rating-badge">${formatRatingBadge(rating)}</span>`).join('')}
                </div>
                <p class="show-plot">${escapeHtml(bundle.show.plot ?? 'No synopsis available.')}</p>
                ${
                  bundle.mismatches.length
                    ? `<p class="mismatch-note">Provider mismatches detected: ${bundle.mismatches.length}. Use debug mode for the raw comparison.</p>`
                    : ''
                }
              </div>
            </div>
            <section class="context-notes">
              <div class="chart-meta">
                <p class="document-kicker">Sources in play</p>
                <p class="provider-note compact">
                  ${getProviderCatalog()
                    .filter((item) => item.configured)
                    .map((item) => `<span class="provider-inline configured">${item.label}</span>`)
                    .join('')}
                </p>
              </div>
              <div class="sidenote-root"></div>
            </section>
          </aside>
          <section class="results-data">
            <div class="chart-intro">
              <p class="document-kicker">Episode trajectory</p>
              <p class="document-lede chart-lede">
                The sparkline gives the whole-series silhouette; the main chart keeps the current viewport readable.
              </p>
            </div>
            <div class="chart-root"></div>
            <div class="mobile-detail-root"></div>
          </section>
        </section>
      </main>
    `

    const chart = createChart(container.querySelector('.chart-root'), bundle.seasons, {
      desktopDetailRoot: container.querySelector('.sidenote-root'),
      mobileDetailRoot: container.querySelector('.mobile-detail-root')
    })
    const title = container.querySelector('.results-title')

    return {
      kind: 'results',
      debugEnabled,
      chart,
      focusInitial() {
        title.focus({ preventScroll: true })
      },
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
