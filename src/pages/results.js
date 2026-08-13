import {
  createEpisodeDetailLoader,
  getComparisonProviders,
  getProviderCatalog,
  streamShowBundle,
  parseShowRef
} from '../data/provider.js'
import { createChart } from '../viz/ratingsChart.js'
import {
  formatRatingBadge,
  renderError,
  renderLoading,
  renderPublisherBrand
} from './shared.js'
import { requestSearchFocusOnNextPage } from './search.js'
import { orderVisibleRatings } from '../data/ratingProviders.js'

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
                Press <button type="button" class="shortcut-action keycap" data-ui-action="help" aria-label="? shortcut: Open help">?</button> for help,
                <button type="button" class="shortcut-action keycap" data-ui-action="view-options" aria-label="v shortcut: Open view options">v</button> for view options,
                <button type="button" class="shortcut-action keycap" data-ui-action="return-search" aria-label="q shortcut: Return to search">q</button> to return.
              </p>
            </div>`
          : ''
      }
    </header>
  `
}

export async function renderResultsPage(container, showRef, options = {}) {
  const {
    bundleStream = streamShowBundle,
    chartFactory = createChart,
    detailLoaderFactory = createEpisodeDetailLoader
  } = options
  container.innerHTML = `
    <main class="document-shell">
      ${renderResultsMasthead()}
      ${renderLoading('Loading show details…')}
    </main>
  `

  let chart = null
  let destroyed = false
  let iterator = null
  let latestBundle = null

  try {
    const debugEnabled = true
    const { provider } = parseShowRef(showRef)
    const progress = bundleStream(showRef, {
      compareProviders:
        options.compareProviders ?? getComparisonProviders(provider),
      providerLoader: options.providerLoader
    })
    iterator = progress[Symbol.asyncIterator]()
    const showSnapshot = await iterator.next()
    if (showSnapshot.done || showSnapshot.value.phase !== 'show') {
      throw new Error('Provider returned no show details.')
    }

    renderResultsShell(container, showSnapshot.value.show)
    document.title = `${showSnapshot.value.show.title} · graphtv`

    const primarySnapshot = await iterator.next()
    if (primarySnapshot.done || !primarySnapshot.value.bundle) {
      throw new Error('Provider returned no episode data.')
    }

    latestBundle = primarySnapshot.value.bundle
    updateResultsContent(container, latestBundle)
    const episodeDetailLoader = detailLoaderFactory({
      expectedSeriesId: latestBundle.show.externalIds.imdb,
      primarySource: latestBundle.primarySource
    })
    chart = chartFactory(
      container.querySelector('.chart-root'),
      latestBundle.seasons,
      {
        detailRoot: container.querySelector('.results-episode'),
        loadEpisodeDetails: episodeDetailLoader
      }
    )
    updateProgress(container, primarySnapshot.value)

    const whenSettled = consumeRemainingSnapshots(
      iterator,
      async (snapshot) => {
        if (destroyed || !snapshot.bundle) {
          return
        }

        latestBundle = snapshot.bundle
        updateResultsContent(container, latestBundle)
        chart.updateSeasons(latestBundle.seasons)
        updateProgress(container, snapshot)
      }
    ).catch((error) => {
      if (!destroyed) {
        showSupplementalError(container, error)
      }
    })

    return {
      kind: 'results',
      debugEnabled,
      chart,
      whenSettled,
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
            data: latestBundle.providerDiagnostics
          },
          {
            title: 'Episode alignment',
            data: latestBundle.alignment
          },
          {
            title: 'Merged bundle',
            data: latestBundle
          },
          {
            title: 'Chart state',
            data: chart.getDebugState()
          }
        ]
      },
      destroy() {
        destroyed = true
        void iterator?.return?.().catch(() => {})
        chart.destroy()
      }
    }
  } catch (error) {
    void iterator?.return?.().catch(() => {})
    const chartRoot = container.querySelector('.chart-root')
    if (chartRoot) {
      chartRoot.innerHTML = renderError(error.message)
      container
        .querySelector('.results-data')
        ?.setAttribute('aria-busy', 'false')
      const progressRoot = container.querySelector('.results-progress')
      if (progressRoot) {
        progressRoot.hidden = true
      }
    } else {
      container.innerHTML = `
        <main class="document-shell">
          ${renderResultsMasthead()}
          ${renderError(error.message)}
        </main>
      `
    }
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

function renderResultsShell(container, show) {
  container.innerHTML = `
    <main class="document-shell results-document">
      ${renderResultsMasthead({ interactive: true })}
      <header class="results-heading"></header>
      <section class="results-layout">
        <section class="results-data" aria-busy="true">
          <div class="chart-root">${renderLoading('Loading episode ratings…', { announce: false })}</div>
          <p class="results-progress" role="status" aria-live="polite">Loading episode ratings…</p>
        </section>
        <section
          class="results-episode"
          aria-label="Rating details"
        ></section>
        <aside class="results-context"></aside>
      </section>
    </main>
  `
  updateHeading(container, show)
  updateShowContext(container, show, [])
}

function updateResultsContent(container, bundle) {
  document.title = `${bundle.show.title} · graphtv`
  updateHeading(container, bundle.show)
  updateShowContext(container, bundle.show, bundle.alignmentIssues)
}

function updateHeading(container, show) {
  container.querySelector('.results-heading').innerHTML = `
    <h1 tabindex="-1" class="results-title">${escapeHtml(show.title)}</h1>
    ${show.year ? `<p class="results-year">${escapeHtml(show.year)}</p>` : ''}
  `
}

function updateShowContext(container, show, alignmentIssues) {
  container.querySelector('.results-context').innerHTML = `
    <div class="show-header">
      <div class="show-poster-shell">
        ${
          show.poster
            ? `<img src="${escapeHtml(show.poster)}" alt="" class="show-poster" />`
            : `<div class="poster-fallback large">No art</div>`
        }
      </div>
      <div class="show-facts">
        <p class="show-meta">${escapeHtml(show.genres.join(' · '))}</p>
        <ul class="show-metrics">
          ${orderVisibleRatings(show.ratings)
            .map(
              (rating) =>
                `<li class="rating-badge">${formatRatingBadge(rating)}</li>`
            )
            .join('')}
        </ul>
      </div>
      <div class="show-copy">
        <p class="show-plot">${escapeHtml(show.plot ?? 'No synopsis available.')}</p>
        ${
          alignmentIssues.length
            ? `<p class="mismatch-note">Ambiguous provider episode matches: ${alignmentIssues.length}. Use debug mode for details.</p>`
            : ''
        }
      </div>
    </div>
  `
}

function updateProgress(container, snapshot) {
  const dataRoot = container.querySelector('.results-data')
  const progressRoot = container.querySelector('.results-progress')
  const message = snapshot.complete ? '' : 'Loading additional ratings…'
  dataRoot.setAttribute('aria-busy', String(!snapshot.complete))
  progressRoot.textContent = message
  progressRoot.hidden = !message
}

function showSupplementalError(container, error) {
  const dataRoot = container.querySelector('.results-data')
  const progressRoot = container.querySelector('.results-progress')
  dataRoot?.setAttribute('aria-busy', 'false')
  if (progressRoot) {
    progressRoot.textContent = `Additional ratings could not be loaded: ${error.message}`
    progressRoot.hidden = false
  }
}

async function consumeRemainingSnapshots(iterator, onSnapshot) {
  while (true) {
    const next = await iterator.next()
    if (next.done) {
      return
    }
    await onSnapshot(next.value)
  }
}

function buildBackHref() {
  return window.location.pathname
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
