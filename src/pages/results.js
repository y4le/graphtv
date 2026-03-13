import { getAverageRating } from '../data/stats.js'
import {
  getComparisonProviders,
  getProviderCatalog,
  getProviderLabel,
  getShowBundle
} from '../data/provider.js'
import { getUrlParams } from '../lib/url.js'
import { createChart } from '../viz/ratingsChart.js'
import { formatRatingBadge, renderError, renderLoading } from './shared.js'

export async function renderResultsPage(container, showRef) {
  container.innerHTML = `
    <main class="page-shell">
      <section class="panel">
        ${renderLoading('Loading show details…')}
      </section>
    </main>
  `

  try {
    const { provider } = parseRef(showRef)
    const bundle = await getShowBundle(showRef, {
      compareProviders: getComparisonProviders(provider)
    })

    document.title = `${bundle.show.title} · GraphTV`

    container.innerHTML = `
      <main class="page-shell results-shell">
        <section class="panel show-panel">
          <a class="back-link" href="${buildBackHref()}">← Back to search</a>
          <div class="show-grid">
            <div class="show-poster-shell">
              ${
                bundle.show.poster
                  ? `<img src="${bundle.show.poster}" alt="" class="show-poster" />`
                  : `<div class="poster-fallback large">No art</div>`
              }
            </div>
            <div class="show-copy">
              <p class="eyebrow">${getProviderLabel(bundle.primarySource)}</p>
              <h1>${bundle.show.title}</h1>
              <p class="show-meta">${[bundle.show.year, ...bundle.show.genres].filter(Boolean).join(' · ')}</p>
              <div class="rating-badges">
                ${bundle.show.ratings.map((rating) => `<span class="rating-badge">${formatRatingBadge(rating)}</span>`).join('')}
              </div>
              <p class="show-plot">${bundle.show.plot ?? 'No overview available.'}</p>
              ${
                bundle.mismatches.length
                  ? `<p class="mismatch-note">Provider mismatches detected: ${bundle.mismatches.length}. Open debug mode for details.</p>`
                  : ''
              }
            </div>
          </div>
        </section>
        <section class="panel chart-panel">
          <div class="chart-header">
            <div>
              <p class="eyebrow">Ratings chart</p>
              <h2>Episode trajectory</h2>
            </div>
            <div class="provider-pills compact">
              ${getProviderCatalog()
                .filter((item) => item.configured)
                .map((item) => `<span class="provider-pill configured">${item.label}</span>`)
                .join('')}
            </div>
          </div>
          <div class="chart-root"></div>
        </section>
      </main>
      <aside class="debug-root"></aside>
    `

    const chartRoot = container.querySelector('.chart-root')
    const chart = createChart(chartRoot, bundle.seasons, {
      getEpisodeLabel: (episode) => `${episode.title} · ${formatEpisodeRatings(episode.ratings)}`,
      getEpisodeDisplayRating: (episode) => getAverageRating(episode.ratings)
    })

    const params = getUrlParams()
    if (params.has('debug')) {
      const debugRoot = container.querySelector('.debug-root')
      const { renderDebugPanel } = await import('../debug/panel.js')
      renderDebugPanel(debugRoot, [
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
          title: 'Chart summary',
          data: {
            seasons: bundle.seasons.length,
            episodes: bundle.seasons.reduce((count, season) => count + season.episodes.length, 0)
          }
        }
      ])
    }

    return chart
  } catch (error) {
    container.innerHTML = `
      <main class="page-shell">
        <section class="panel">
          ${renderError(error.message)}
        </section>
      </main>
    `
    return null
  }
}

function parseRef(showRef) {
  const [provider, id] = showRef.split(':')
  return { provider, id }
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

function formatEpisodeRatings(ratings) {
  return ratings
    .filter((rating) => typeof rating.rating === 'number')
    .map((rating) => `${rating.source.toUpperCase()} ${rating.rating.toFixed(1)}`)
    .join(' · ')
}
