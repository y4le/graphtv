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
import { orderVisibleRatings } from '../data/ratingProviders.js'
import { buildUrl, preserveDebugParams } from '../lib/url.js'
import { escapeHtml } from '../lib/html.js'
import { forwardAbort, isAbortError } from '../lib/abort.js'

export function renderResultsMasthead({ interactive = false } = {}) {
  return `
    <header class="masthead results-masthead">
      <div class="masthead-navigation">
        ${renderPublisherBrand()}
      </div>
      <div class="masthead-meta">
        <div class="masthead-actions" aria-label="Page actions">
          ${
            interactive
              ? `
                <button type="button" class="masthead-action" data-ui-action="view-options">Options (o)</button>
                <button type="button" class="masthead-action" data-ui-action="help">Help (?)</button>`
              : ''
          }
          <a class="back-link masthead-action" href="${buildBackHref()}" aria-label="Back to search (q shortcut)">Back (q)</a>
        </div>
      </div>
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
  let latestShow = null
  let primaryProvider = null
  let chartPrimaryRatingSource = null
  const abortController = new AbortController()
  const stopForwardingAbort = forwardAbort(options.signal, abortController)
  const handleSeriesRatingSelection = (event) => {
    const button = event.target.closest?.('[data-series-rating-source]')
    if (!button || !container.contains(button)) {
      return
    }

    const source = button.dataset.seriesRatingSource
    if (
      chart?.setPrimaryRatingSource?.(source) &&
      chartPrimaryRatingSource !== source
    ) {
      syncChartPrimaryRatingSource(source)
    }
  }

  function syncChartPrimaryRatingSource(source) {
    chartPrimaryRatingSource = source ?? null
    if (latestBundle) {
      updateShowContext(
        container,
        latestBundle.show,
        latestBundle.alignmentIssues,
        chartPrimaryRatingSource
      )
    }
  }

  container.addEventListener('click', handleSeriesRatingSelection)

  try {
    const debugEnabled = true
    const { provider } = parseShowRef(showRef)
    primaryProvider = provider
    const progress = bundleStream(showRef, {
      compareProviders:
        options.compareProviders ?? getComparisonProviders(provider),
      providerLoader: options.providerLoader,
      signal: abortController.signal
    })
    iterator = progress[Symbol.asyncIterator]()
    const showSnapshot = await iterator.next()
    if (showSnapshot.done || showSnapshot.value.phase !== 'show') {
      throw new Error('Provider returned no show details.')
    }

    latestShow = showSnapshot.value.show
    renderResultsShell(container, showSnapshot.value.show)
    document.title = `${showSnapshot.value.show.title} · graphtv`

    const primarySnapshot = await iterator.next()
    if (primarySnapshot.done || !primarySnapshot.value.bundle) {
      throw new Error('Provider returned no episode data.')
    }

    latestBundle = primarySnapshot.value.bundle
    latestShow = latestBundle.show
    updateResultsContent(container, latestBundle, chartPrimaryRatingSource)
    const episodeDetailLoader = detailLoaderFactory({
      expectedSeriesId: latestBundle.show.externalIds.imdb,
      primarySource: latestBundle.primarySource
    })
    chart = chartFactory(
      container.querySelector('.chart-root'),
      latestBundle.seasons,
      {
        detailRoot: container.querySelector('.results-episode'),
        loadEpisodeDetails: episodeDetailLoader,
        show: latestBundle.show,
        onPrimaryRatingSourceChange: syncChartPrimaryRatingSource
      }
    )
    syncChartPrimaryRatingSource(
      chart.getDebugState?.().ratings?.primarySource ??
        latestBundle.primarySource
    )
    updateProgress(container, primarySnapshot.value)

    const whenSettled = consumeRemainingSnapshots(
      iterator,
      async (snapshot) => {
        if (destroyed || !snapshot.bundle) {
          return
        }

        latestBundle = snapshot.bundle
        latestShow = latestBundle.show
        updateResultsContent(container, latestBundle, chartPrimaryRatingSource)
        chart.updateSeasons(latestBundle.seasons, { show: latestBundle.show })
        updateProgress(container, snapshot)
      }
    ).catch((error) => {
      if (!destroyed && !isAbortError(error)) {
        showSupplementalError(container, error)
      }
    })

    return {
      kind: 'results',
      debugEnabled,
      chart,
      whenSettled,
      focusInitial() {
        container
          .querySelector('.results-title')
          ?.focus({ preventScroll: true })
      },
      focusSearch() {
        window.location.href = buildBackHref()
      },
      goBack() {
        window.location.href = buildBackHref()
      },
      getCreditsContext() {
        return {
          providers: getLoadedProviders(latestBundle),
          show: latestShow
        }
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
        stopForwardingAbort()
        abortController.abort()
        void iterator?.return?.().catch(() => {})
        container.removeEventListener('click', handleSeriesRatingSelection)
        chart.destroy()
      }
    }
  } catch (error) {
    stopForwardingAbort()
    abortController.abort()
    void iterator?.return?.().catch(() => {})
    container.removeEventListener('click', handleSeriesRatingSelection)
    if (!isAbortError(error)) {
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
    }
    return {
      kind: 'results',
      debugEnabled: false,
      chart: null,
      focusInitial() {
        container
          .querySelector('.results-title')
          ?.focus({ preventScroll: true })
      },
      focusSearch() {
        window.location.href = buildBackHref()
      },
      goBack() {
        window.location.href = buildBackHref()
      },
      getCreditsContext() {
        return {
          providers: latestShow && primaryProvider ? [primaryProvider] : [],
          show: latestShow
        }
      },
      getDebugSections() {
        return []
      },
      destroy() {
        destroyed = true
        stopForwardingAbort()
        abortController.abort()
        void iterator?.return?.().catch(() => {})
        container.removeEventListener('click', handleSeriesRatingSelection)
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

function updateResultsContent(container, bundle, primaryRatingSource = null) {
  document.title = `${bundle.show.title} · graphtv`
  updateHeading(container, bundle.show)
  updateShowContext(
    container,
    bundle.show,
    bundle.alignmentIssues,
    primaryRatingSource
  )
}

function updateHeading(container, show) {
  const heading = container.querySelector('.results-heading')
  let title = heading.querySelector('.results-title')

  if (!title) {
    title = document.createElement('h1')
    title.className = 'results-title'
    title.tabIndex = -1
    heading.append(title)
  }
  title.textContent = show.title

  let year = heading.querySelector('.results-year')
  if (!show.year) {
    year?.remove()
    return
  }

  if (!year) {
    year = document.createElement('p')
    year.className = 'results-year'
    heading.append(year)
  }
  year.textContent = show.year
}

function updateShowContext(
  container,
  show,
  alignmentIssues,
  primaryRatingSource = null
) {
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
            .map((rating) => {
              const isPrimary = rating.source === primaryRatingSource
              return `<li class="rating-badge${isPrimary ? ' is-primary' : ''}" data-rating-provider="${escapeHtml(rating.source)}">${formatRatingBadge(
                rating,
                {
                  show,
                  selectable: true,
                  isPrimary
                }
              )}</li>`
            })
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

function getLoadedProviders(bundle) {
  if (Array.isArray(bundle?.sourceRecords)) {
    return bundle.sourceRecords.map((record) => record.provider)
  }

  return [
    bundle?.primarySource,
    ...(bundle?.providerDiagnostics ?? [])
      .filter((diagnostic) => diagnostic.status === 'loaded')
      .map((diagnostic) => diagnostic.provider)
  ].filter(Boolean)
}

function buildBackHref() {
  return buildUrl(preserveDebugParams(new URLSearchParams()))
}
