import {
  getRatingSourceLabel,
  getRatingSourceUrl,
  orderVisibleRatings
} from '../data/ratingProviders.js'
import { isTrustedRating, isUsableProviderRating } from '../data/stats.js'
import { escapeHtml } from '../lib/html.js'
import { bindVoteCountTooltips, renderVoteCount } from '../ui/voteCount.js'

let trendInfoSequence = 0

function syncTrendInfo(control) {
  const button = control.querySelector('[data-trend-info]')
  const expanded =
    control.dataset.dismissed !== 'true' &&
    ['hovered', 'focused', 'pinned'].some(
      (state) => control.dataset[state] === 'true'
    )
  button.setAttribute('aria-expanded', String(expanded))
  button.nextElementSibling.hidden = !expanded
}

function dismissTrendInfo(control) {
  control.dataset.hovered = 'false'
  control.dataset.focused = 'false'
  control.dataset.pinned = 'false'
  control.dataset.dismissed = 'true'
  syncTrendInfo(control)
}

function listenForOutsideTrendInfoDismissal(root) {
  const ownerDocument = root.ownerDocument
  const handleClick = (event) => {
    root
      .querySelectorAll('[data-trend-info][aria-expanded="true"]')
      .forEach((button) => {
        const control = button.closest('.trend-info-control')
        if (!control.contains(event.target)) {
          dismissTrendInfo(control)
        }
      })
  }
  ownerDocument.addEventListener('click', handleClick, true)

  return () => ownerDocument.removeEventListener('click', handleClick, true)
}

function formatRatingList(point, { loadingDetails = false, show = null } = {}) {
  return orderVisibleRatings(point.ratings.filter(isTrustedRating))
    .map((rating, index) => {
      const isPrimary = rating.source === point.ratingSource
      const formattedRating = isUsableProviderRating(rating)
        ? rating.rating.toFixed(1)
        : null
      const votes =
        typeof rating.votes === 'number'
          ? renderVoteCount(rating.votes)
          : loadingDetails && rating.source === 'omdb'
            ? `<span class="sidenote-votes-pending">(${renderVotesLoading()})</span>`
            : ''
      const source = formatRatingSource(rating.source, {
        show,
        episode: point,
        className: 'sidenote-rating-source'
      })
      const value = formattedRating
        ? `${renderProviderRatingButton(
            point,
            rating,
            formattedRating,
            isPrimary
          )}${votes}`
        : `n/a${votes}`
      const content = `${source} ${value}`
      const entry = isPrimary
        ? `<strong class="sidenote-rating-primary">${content}</strong>`
        : `<span>${content}</span>`
      const separator =
        index === 0
          ? ''
          : '<span class="sidenote-rating-separator" aria-hidden="true"> · </span>'

      return `${separator}${entry}`
    })
    .join('')
}

function renderProviderRatingButton(point, rating, formattedRating, isPrimary) {
  const sourceLabel = getEpisodeRatingSourceLabel(rating.source)
  const classes = [
    'sidenote-rating-value',
    isPrimary ? 'sidenote-rating-primary-value' : null
  ]
    .filter(Boolean)
    .join(' ')

  return `<button type="button" class="${classes}" data-provider-rating data-rating-point-id="${escapeHtml(point.id ?? '')}" data-rating-source="${escapeHtml(rating.source)}" aria-label="${escapeHtml(`${sourceLabel} rating ${formattedRating}${isPrimary ? ', plotted rating' : ''}`)}" aria-pressed="false">${formattedRating}</button>`
}

function getProviderRatingTarget(button) {
  return {
    pointId: button.dataset.ratingPointId,
    source: button.dataset.ratingSource,
    comparison: button.dataset.ratingComparison === 'true'
  }
}

function syncSelectedProviderRating(root, pointId, selectedRatingSource) {
  root.querySelectorAll('[data-provider-rating]').forEach((button) => {
    const isSelected =
      button.dataset.ratingPointId === pointId &&
      button.dataset.ratingSource === selectedRatingSource
    const isSupersededPrimary =
      selectedRatingSource != null &&
      button.classList.contains('sidenote-rating-primary-value') &&
      button.dataset.ratingSource !== selectedRatingSource
    button.classList.toggle('is-selected', isSelected)
    button.classList.toggle('is-superseded', isSupersededPrimary)
    button.setAttribute('aria-pressed', String(isSelected))
  })
}

function syncSelectedComparisonRating(root, selectedRatingSource) {
  root
    .querySelector('.sidenote-comparison-ratings')
    ?.classList.toggle('has-selection', selectedRatingSource != null)
  root.querySelectorAll('[data-rating-comparison="true"]').forEach((button) => {
    const isSelected = button.dataset.ratingSource === selectedRatingSource
    button.classList.toggle('is-selected', isSelected)
    button.setAttribute('aria-pressed', String(isSelected))
  })
}

function renderVotesLoading() {
  return '<span class="sidenote-votes-loading" role="status" aria-label="Loading IMDb vote count"><span class="sidenote-votes-loading-dot" aria-hidden="true"></span><span aria-hidden="true">votes</span></span>'
}

function getEpisodeRatingSourceLabel(source) {
  return getRatingSourceLabel(source)
}

function formatRatingSource(
  source,
  { show = null, episode = null, className = null } = {}
) {
  const label = escapeHtml(getEpisodeRatingSourceLabel(source))
  const sourceUrl = getRatingSourceUrl(source, { show, episode })

  if (!sourceUrl) {
    return label
  }

  const classes = ['rating-source-link', className].filter(Boolean).join(' ')
  return `<a class="${classes}" href="${escapeHtml(sourceUrl)}">${label}</a>`
}

function formatPlottingContext({ source, spreadSources = [] }, show) {
  const sourceCopy = formatRatingSource(source, { show })
  const spreadCopy = spreadSources.map((spreadSource) =>
    formatRatingSource(spreadSource, { show })
  )

  return `Plotting ${sourceCopy}${spreadCopy.length ? ` · source spread shows ${formatList(spreadCopy)}` : ''}`
}

function formatList(values) {
  if (values.length < 2) {
    return values[0] ?? ''
  }
  if (values.length === 2) {
    return values.join(' and ')
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function renderSeriesRank(seriesRank) {
  if (!seriesRank) {
    return ''
  }

  const source = escapeHtml(getRatingSourceLabel(seriesRank.source))
  return `<p class="sidenote-rank">Series rank <strong>${seriesRank.rank}</strong> of ${seriesRank.total} rated ${seriesRank.total === 1 ? 'episode' : 'episodes'} · ${source}</p>`
}

export function createSidenote({
  root,
  onInteract,
  onNavigate,
  onPreviewRating,
  onSelectRating,
  onSelectPoint,
  onStartComparison,
  onCancelComparison,
  onSelectSeasonTrend,
  onSelectSeriesBreakpoint
}) {
  const eventController = new root.ownerDocument.defaultView.AbortController()
  const eventOptions = { signal: eventController.signal }
  const stopOutsideTrendInfoDismissal = listenForOutsideTrendInfoDismissal(root)
  const stopVoteCountTooltips = bindVoteCountTooltips(root)
  const listen = (type, listener) => {
    root.addEventListener(type, listener, eventOptions)
  }
  root.innerHTML = `
    <button type="button" class="sidenote-compare-button sidenote-comparison-exit" data-comparison-action="cancel" aria-label="Exit comparison" hidden>
      <span class="sidenote-comparison-exit-full">Exit comparison</span>
      <span class="sidenote-comparison-exit-compact" aria-hidden="true">Exit</span>
    </button>
    <div class="sidenote-nav" role="group" aria-label="Episode navigation">
      <button type="button" class="sidenote-nav-button shortcut-action keycap" data-sidenote-nav="previous" aria-label="Previous episode" aria-disabled="true">
        <span aria-hidden="true">‹</span>
      </button>
      <div class="sidenote-nav-center">
        <p class="sidenote-nav-status">
          <span class="sidenote-nav-label">Browse episodes</span>
          <span class="sidenote-nav-meta"></span>
        </p>
      </div>
      <button type="button" class="sidenote-nav-button sidenote-nav-compare shortcut-action keycap" data-comparison-action="start" aria-label="Compare with another episode" hidden>
        <span aria-hidden="true">⚖</span>
      </button>
      <button type="button" class="sidenote-nav-button shortcut-action keycap" data-sidenote-nav="next" aria-label="Next episode" aria-disabled="true">
        <span aria-hidden="true">›</span>
      </button>
    </div>
    <div class="sidenote-content"></div>
  `

  const contentRoot = root.querySelector('.sidenote-content')
  const navigatorRoot = root.querySelector('.sidenote-nav')
  const navigatorLabel = root.querySelector('.sidenote-nav-label')
  const navigatorMeta = root.querySelector('.sidenote-nav-meta')
  const comparisonExitButton = root.querySelector('.sidenote-comparison-exit')
  const comparisonStartButton = root.querySelector('.sidenote-nav-compare')
  const previousButton = root.querySelector('[data-sidenote-nav="previous"]')
  const nextButton = root.querySelector('[data-sidenote-nav="next"]')
  const trendInfoId = `trend-info-tooltip-${++trendInfoSequence}`
  let navigatorKey = null
  let contentMarkup = null
  let pointerRatingButton = null
  let pointerTrendInfoControl = null

  function setMarkup(markup, { comparisonAvailable = false } = {}) {
    comparisonStartButton.hidden = !comparisonAvailable
    navigatorRoot.classList.toggle('has-comparison-action', comparisonAvailable)
    if (markup === contentMarkup) {
      return
    }

    contentMarkup = markup
    contentRoot.innerHTML = markup
  }

  function renderRestingState({
    empty = false,
    trendlinesAvailable = false
  } = {}) {
    setMarkup(
      `<p class="sidenote-resting-copy">${
        empty
          ? 'No rated episode details are available.'
          : trendlinesAvailable
            ? 'Choose a trendline or browse the rated episodes.'
            : 'Browse the rated episodes with the arrow buttons.'
      }</p>`
    )
  }

  function renderNavigator(viewModel) {
    comparisonExitButton.hidden = viewModel.mode !== 'comparison'
    navigatorRoot.classList.toggle(
      'is-comparison',
      viewModel.mode === 'comparison'
    )
    const key = [
      viewModel.mode,
      viewModel.navigationKind,
      viewModel.label,
      viewModel.rangeStart,
      viewModel.rangeEnd,
      viewModel.meta,
      viewModel.previousAvailable,
      viewModel.nextAvailable,
      viewModel.previousLabel,
      viewModel.nextLabel
    ].join(':')
    if (key === navigatorKey) {
      return
    }
    navigatorKey = key

    navigatorRoot.setAttribute(
      'aria-label',
      viewModel.mode === 'comparison'
        ? 'Compared episode range'
        : (viewModel.navigationKind ?? viewModel.mode) === 'season'
          ? 'Season trend navigation'
          : 'Episode navigation'
    )
    renderNavigatorLabel(navigatorLabel, viewModel)
    navigatorMeta.textContent = viewModel.meta ?? ''
    updateNavigatorButton(
      previousButton,
      viewModel.previousAvailable,
      viewModel.previousLabel ?? 'Previous episode'
    )
    updateNavigatorButton(
      nextButton,
      viewModel.nextAvailable,
      viewModel.nextLabel ?? 'Next episode'
    )
  }

  function renderNavigatorLabel(label, viewModel) {
    label.classList.toggle(
      'is-comparison-range',
      Boolean(viewModel.rangeStart && viewModel.rangeEnd)
    )
    if (!viewModel.rangeStart || !viewModel.rangeEnd) {
      label.removeAttribute('aria-label')
      label.textContent = viewModel.label
      return
    }

    const earlier = label.ownerDocument.createElement('span')
    const separator = label.ownerDocument.createElement('span')
    const later = label.ownerDocument.createElement('span')
    earlier.textContent = viewModel.rangeStart
    earlier.dataset.comparisonRangeSide = 'earlier'
    separator.textContent = '-'
    separator.setAttribute('aria-hidden', 'true')
    later.textContent = viewModel.rangeEnd
    later.dataset.comparisonRangeSide = 'later'
    label.setAttribute('aria-label', viewModel.label)
    label.replaceChildren(earlier, separator, later)
  }

  function renderPoint(
    point,
    {
      loadingDetails = false,
      show = null,
      selectedRatingSource = null,
      seriesRank = null,
      comparisonMode = null
    } = {}
  ) {
    const markup = point
      ? `
          <div class="sidenote-card">
            <div class="sidenote-header">
              <p class="sidenote-caption">
                <span class="sidenote-title">${escapeHtml(point.title)}</span>
                <span class="sidenote-meta">${escapeHtml(point.date ?? 'Unknown air date')}</span>
              </p>
            </div>
            <p class="sidenote-ratings">${formatRatingList(point, { loadingDetails, show })}</p>
            ${renderSeriesRank(seriesRank)}
            ${renderComparisonAction(comparisonMode, point)}
            ${
              point.plot
                ? `<p class="sidenote-body">${escapeHtml(point.plot)}</p>`
                : '<p class="sidenote-body">No synopsis available.</p>'
            }
          </div>
        `
      : ''

    setMarkup(markup, { comparisonAvailable: comparisonMode === 'available' })
    syncSelectedProviderRating(contentRoot, point?.id, selectedRatingSource)
  }

  function renderComparison(comparison, { selectedRatingSource = null } = {}) {
    const rangeLabel = `${formatEpisodeLabel(comparison.earlier.point)} - ${formatEpisodeLabel(comparison.later.point)}`
    setMarkup(`
      <article class="sidenote-comparison" aria-label="${escapeHtml(rangeLabel)} comparison details">
        <div class="sidenote-comparison-episodes">
          ${renderComparisonEpisode('Earlier', comparison.earlier)}
          ${renderComparisonEpisode('Later', comparison.later)}
        </div>
        ${renderComparisonRatings(comparison)}
        ${renderComparisonMetrics(comparison)}
        ${renderComparisonExtremes(comparison)}
      </article>
    `)
    syncSelectedComparisonRating(contentRoot, selectedRatingSource)
  }

  function renderTrendSummary(summary, { show = null } = {}) {
    if (!summary) {
      renderRestingState()
      return
    }

    if (summary.kind === 'breakpoint') {
      renderBreakpointSummary(summary, { show })
      return
    }

    const fallbackCopy = summary.excludedFallback
      ? `${summary.excludedFallback} ${summary.excludedFallback === 1 ? 'episode uses' : 'episodes use'} other sources and ${summary.excludedFallback === 1 ? 'is' : 'are'} excluded`
      : null
    const trendCopy = formatTrendCopy(summary)
    const provenanceNotes = [
      fallbackCopy,
      !summary.trendCriteria.enoughRatedEpisodes
        ? 'too few rated episodes for a trend'
        : null
    ].filter(Boolean)
    const sourceCopy = summary.plottingContext
      ? formatPlottingContext(summary.plottingContext, show)
      : formatRatingSource(summary.source, { show })
    const ratedCopy = `${summary.n} of ${summary.totalEpisodes} rated`
    const notesCopy = escapeHtml(provenanceNotes.join('; '))
    const provenance =
      summary.kind === 'series' && summary.plottingContext
        ? `${sourceCopy} · ${ratedCopy}${notesCopy ? `, ${notesCopy}` : ''}`
        : `${ratedCopy} · ${sourceCopy}${notesCopy ? ` — ${notesCopy}` : ''}`
    const meanContext = formatMeanContext(summary)
    const spreadContext =
      summary.kind === 'series'
        ? '<span class="trend-summary-context"> · within seasons</span>'
        : ''
    const breakpointAction = summary.detectedBreakpoint
      ? `
          <span class="trend-summary-breakpoint-action">
            <span aria-hidden="true">·</span>
            <button type="button" class="trend-summary-breakpoint-button" data-series-breakpoint>🦈 shark jump detected</button>
          </span>
        `
      : ''

    setMarkup(`
      <div class="sidenote-card sidenote-trend-card">
        <dl class="trend-summary-metrics">
          <div class="trend-summary-metric">
            <dt>Mean</dt>
            <dd>${summary.mean.toFixed(1)}${meanContext}</dd>
          </div>
          ${renderSpreadMetric(summary.ratingStandardDeviation, spreadContext)}
          <div class="trend-summary-metric">
            <dt>Trend</dt>
            <dd class="trend-summary-trend-value">
              <span>${trendCopy}</span>
              <div class="trend-info-control">
                <button type="button" class="trend-info-button" data-trend-info aria-label="Explain trend statistics" aria-expanded="false" aria-controls="${trendInfoId}" aria-describedby="${trendInfoId}">ⓘ</button>
                ${renderTrendInfo(summary, trendInfoId)}
              </div>
              ${breakpointAction}
            </dd>
          </div>
        </dl>
        ${renderSeasonExtremes(summary.seasonExtremes)}
        <div class="trend-summary-rankings" aria-label="Highest and lowest rated episodes">
          ${renderRanking('Top Rated', summary.top)}
          ${renderRanking('Bottom Rated', summary.bottom)}
        </div>
        <p class="trend-summary-provenance">${provenance}</p>
      </div>
    `)
  }

  function renderBreakpointSummary(summary, { show = null } = {}) {
    const breakpointLabel = formatEpisodeLabel(summary.breakpointPoint)
    const sourceCopy = formatRatingSource(summary.beforeSummary.source, {
      show
    })
    const confidenceCopy =
      summary.confidence === 'high'
        ? `High confidence ${Math.round(summary.score)}/100`
        : `Confidence below threshold ${Math.round(summary.score)}/100`
    const changeCopy =
      summary.drop >= 0
        ? `Ratings dropped ${summary.drop.toFixed(1)} points`
        : `Ratings rose ${Math.abs(summary.drop).toFixed(1)} points`

    setMarkup(`
      <div class="sidenote-card sidenote-trend-card sidenote-breakpoint-card" data-breakpoint-summary>
        <ul class="breakpoint-summary-facts" aria-label="Breakpoint summary">
          <li>Starting <button type="button" class="breakpoint-summary-episode" data-breakpoint-episode data-trend-point-id="${escapeHtml(summary.breakpointPoint.id)}" aria-label="Select ${escapeHtml(breakpointLabel)}, the first episode after the breakpoint">${escapeHtml(breakpointLabel)}</button></li>
          <li>${escapeHtml(changeCopy)}</li>
          <li>${escapeHtml(confidenceCopy)}</li>
        </ul>
        <div class="breakpoint-regimes" aria-label="Ratings before and after the detected breakpoint">
          ${renderBreakpointRegime('Before', summary.beforeSummary, summary.beforeMedian)}
          ${renderBreakpointRegime('After', summary.afterSummary, summary.afterMedian)}
        </div>
        <p class="breakpoint-summary-evidence">${Math.round(summary.separation * 100)}% of before episodes rate higher than after episodes · ${Math.round(summary.sustain * 100)}% of the later episodes sustain the drop · ${formatBreakpointPValue(summary.pValue)}</p>
        <p class="trend-summary-provenance">${summary.beforeSummary.n + summary.afterSummary.n} rated · ${sourceCopy}</p>
      </div>
    `)
  }

  listen('click', (event) => {
    if (event.target.closest?.('[data-inline-tooltip-trigger]')) {
      return
    }

    const ratingButton = event.target.closest?.('[data-provider-rating]')
    if (ratingButton) {
      onInteract?.()
      onSelectRating?.(getProviderRatingTarget(ratingButton))
      if (event.detail > 0 && ratingButton === document.activeElement) {
        ratingButton.blur()
      }
      return
    }

    const navigatorButton = event.target.closest?.('[data-sidenote-nav]')
    if (navigatorButton) {
      onInteract?.()
      if (navigatorButton.getAttribute('aria-disabled') === 'true') {
        return
      }
      onNavigate?.(navigatorButton.dataset.sidenoteNav === 'previous' ? -1 : 1)
      return
    }

    const comparisonAction = event.target.closest?.('[data-comparison-action]')
    if (comparisonAction) {
      onInteract?.()
      if (comparisonAction.dataset.comparisonAction === 'start') {
        onStartComparison?.()
      } else {
        onCancelComparison?.()
      }
      return
    }

    const comparisonPointButton = event.target.closest?.(
      '[data-comparison-point-id]'
    )
    if (comparisonPointButton) {
      onInteract?.()
      onSelectPoint?.(comparisonPointButton.dataset.comparisonPointId)
      return
    }

    const trendPointButton = event.target.closest?.('[data-trend-point-id]')
    if (trendPointButton) {
      onInteract?.()
      onSelectPoint?.(trendPointButton.dataset.trendPointId)
      return
    }

    const seasonTrendButton = event.target.closest?.(
      '[data-trend-season-number]'
    )
    if (seasonTrendButton) {
      onInteract?.()
      onSelectSeasonTrend?.(Number(seasonTrendButton.dataset.trendSeasonNumber))
      return
    }

    const breakpointButton = event.target.closest?.('[data-series-breakpoint]')
    if (breakpointButton) {
      onInteract?.()
      onSelectSeriesBreakpoint?.()
      return
    }

    const trendInfoButton = event.target.closest?.('[data-trend-info]')
    if (trendInfoButton) {
      onInteract?.()
      const control = trendInfoButton.closest('.trend-info-control')
      if (control.dataset.pinned === 'true') {
        control.dataset.pinned = 'false'
        control.dataset.dismissed = 'true'
      } else {
        control.dataset.pinned = 'true'
        control.dataset.dismissed = 'false'
      }
      syncTrendInfo(control)
    }
  })

  listen('mousemove', (event) => {
    updatePointerRatingButton(
      event.target.closest?.('[data-provider-rating]') ?? null
    )
    updatePointerTrendInfoControl(
      event.target.closest?.('.trend-info-control') ?? null
    )
  })

  listen('mouseleave', () => {
    updatePointerRatingButton(null)
    updatePointerTrendInfoControl(null)
  })

  function updatePointerRatingButton(nextButton) {
    if (nextButton === pointerRatingButton) {
      return
    }

    pointerRatingButton = nextButton
    onPreviewRating?.(nextButton ? getProviderRatingTarget(nextButton) : null)
  }

  function updatePointerTrendInfoControl(nextControl) {
    if (nextControl === pointerTrendInfoControl) {
      return
    }

    if (pointerTrendInfoControl) {
      pointerTrendInfoControl.dataset.hovered = 'false'
      syncTrendInfo(pointerTrendInfoControl)
    }
    pointerTrendInfoControl = nextControl
    if (pointerTrendInfoControl) {
      pointerTrendInfoControl.dataset.hovered = 'true'
      pointerTrendInfoControl.dataset.dismissed = 'false'
      syncTrendInfo(pointerTrendInfoControl)
    }
  }

  listen('focusin', (event) => {
    const ratingButton = event.target.closest?.('[data-provider-rating]')
    if (
      ratingButton &&
      !event.target.closest?.('[data-inline-tooltip-trigger]')
    ) {
      onPreviewRating?.(getProviderRatingTarget(ratingButton))
    }

    const control = event.target.closest?.('.trend-info-control')
    if (!control) {
      return
    }

    control.dataset.focused = 'true'
    control.dataset.dismissed = 'false'
    syncTrendInfo(control)
  })

  listen('focusout', (event) => {
    const ratingButton = event.target.closest?.('[data-provider-rating]')
    if (ratingButton && !ratingButton.contains(event.relatedTarget)) {
      onPreviewRating?.(null)
    }

    const control = event.target.closest?.('.trend-info-control')
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.focused = 'false'
    syncTrendInfo(control)
  })

  listen('keydown', (event) => {
    if (event.key !== 'Escape') {
      return
    }

    const control = Array.from(
      root.querySelectorAll('.trend-info-control')
    ).find(
      (candidate) =>
        candidate.dataset.pinned === 'true' ||
        (candidate.contains(document.activeElement) &&
          candidate
            .querySelector('[data-trend-info]')
            .getAttribute('aria-expanded') === 'true')
    )
    if (!control) {
      return
    }

    event.stopPropagation()
    dismissTrendInfo(control)
  })

  renderRestingState()

  return {
    renderNavigator,
    renderPoint,
    renderComparison,
    renderTrendSummary,
    renderRestingState,
    destroy() {
      stopOutsideTrendInfoDismissal()
      stopVoteCountTooltips()
      eventController.abort()
      root.replaceChildren()
    }
  }
}

function renderComparisonAction(mode, point) {
  if (mode === 'armed') {
    return `
      <div class="sidenote-comparison-action is-armed">
        <span>Choose a second episode to compare with ${escapeHtml(formatEpisodeLabel(point))}.</span>
        <button type="button" class="sidenote-compare-button" data-comparison-action="cancel">Cancel</button>
      </div>
    `
  }

  return ''
}

function renderComparisonEpisode(label, entry) {
  const point = entry.point
  return `
    <section class="sidenote-comparison-episode" data-comparison-side="${label.toLowerCase()}" aria-label="${label} episode">
      <button type="button" class="sidenote-comparison-episode-button" data-comparison-point-id="${escapeHtml(point.id)}" aria-label="Select only ${escapeHtml(formatEpisodeLabel(point))}, ${escapeHtml(point.title)}">
        <strong>${escapeHtml(point.title)}</strong>
      </button>
      <p class="sidenote-meta">${escapeHtml(point.date ?? 'Unknown air date')}</p>
    </section>
  `
}

function renderComparisonRatings(comparison) {
  const entries = [comparison.earlier, comparison.later]
  const orderedSources = orderVisibleRatings(
    entries.flatMap(({ point }) => point.ratings.filter(isTrustedRating))
  )
    .map((rating) => rating.source)
    .filter((source, index, sources) => sources.indexOf(source) === index)

  if (!orderedSources.length) {
    return ''
  }

  const rows = orderedSources
    .map((source) => renderComparisonRatingRow(source, comparison))
    .join('')

  return `<div class="sidenote-comparison-ratings" role="group" aria-label="Provider rating comparison">${rows}</div>`
}

function renderComparisonRatingRow(source, comparison) {
  const earlier = getComparisonRating(comparison.earlier, source)
  const later = getComparisonRating(comparison.later, source)
  const isAvailable = earlier.usable && later.usable
  const tag = isAvailable ? 'button' : 'div'
  const classes = [
    'sidenote-comparison-rating',
    isAvailable ? 'is-interactive' : null,
    !isAvailable ? 'is-unavailable' : null
  ]
    .filter(Boolean)
    .join(' ')
  const attributes = isAvailable
    ? `type="button" data-provider-rating data-rating-comparison="true" data-rating-source="${escapeHtml(source)}" aria-label="Focus ${escapeHtml(getEpisodeRatingSourceLabel(source))} ratings: ${escapeHtml(earlier.accessibleValue)} for the earlier episode and ${escapeHtml(later.accessibleValue)} for the later episode" aria-pressed="false"`
    : `aria-label="${escapeHtml(getEpisodeRatingSourceLabel(source))}: ${escapeHtml(earlier.accessibleValue)} for the earlier episode and ${escapeHtml(later.accessibleValue)} for the later episode"`

  return `
    <${tag} class="${classes}" ${attributes}>
      ${renderComparisonRatingValue(earlier, 'earlier', source)}
      <span class="sidenote-comparison-rating-source">${escapeHtml(getEpisodeRatingSourceLabel(source))}</span>
      ${renderComparisonRatingValue(later, 'later', source)}
    </${tag}>
  `
}

function getComparisonRating(entry, source) {
  const rating = entry.point.ratings.find(
    (candidate) => candidate.source === source && isTrustedRating(candidate)
  )
  const usable = isUsableProviderRating(rating)
  const votes = Number.isFinite(rating?.votes) ? rating.votes : null
  const loadingVotes = entry.loadingDetails && source === 'omdb'
  const ratingLabel = usable ? rating.rating.toFixed(1) : 'n/a'
  const seriesRank =
    entry.seriesRanks?.[source] ??
    (entry.seriesRank?.source === source ? entry.seriesRank : null)

  return {
    ratingLabel,
    votes,
    loadingVotes,
    seriesRank,
    usable,
    plotted: usable && source === entry.point.ratingSource,
    accessibleValue: `${ratingLabel}${votes != null ? `, ${votes.toLocaleString('en-US')} ${votes === 1 ? 'vote' : 'votes'}` : loadingVotes ? ', vote count loading' : ''}${seriesRank ? `, series rank ${seriesRank.rank} of ${seriesRank.total}` : ''}`
  }
}

function renderComparisonRatingValue(rating, side, source) {
  const classes = [
    'sidenote-comparison-rating-value',
    rating.plotted ? 'is-plotted' : null
  ]
    .filter(Boolean)
    .join(' ')
  const votes =
    rating.votes != null
      ? renderVoteCount(rating.votes, {
          className: 'sidenote-comparison-rating-votes',
          interactive: false
        })
      : rating.loadingVotes
        ? `<span class="sidenote-comparison-rating-votes">${renderVotesLoading()}</span>`
        : ''
  const rank = renderComparisonRatingRank(rating.seriesRank, source)

  return `<span class="${classes}" data-comparison-rating-side="${side}"><span>${rating.ratingLabel}</span>${rank}${votes}</span>`
}

function renderComparisonRatingRank(rank, source) {
  if (!rank) {
    return ''
  }

  const value = `${rank.rank}/${rank.total}`
  const tooltip = `Rank ${rank.rank} of ${rank.total} rated episodes by ${getRatingSourceLabel(source)} score, from highest to lowest.`

  return `
    <span class="inline-tooltip-control sidenote-comparison-rating-rank" data-inline-tooltip-control data-comparison-rating-rank>
      <span class="inline-tooltip-trigger sidenote-comparison-rating-rank-trigger" data-inline-tooltip-trigger aria-hidden="true">(${escapeHtml(value)})</span>
      <span class="inline-tooltip sidenote-comparison-rating-rank-tooltip" data-inline-tooltip role="tooltip" hidden>${escapeHtml(tooltip)}</span>
    </span>
  `
}

function renderComparisonMetrics(comparison) {
  const ratingChange = Number.isFinite(comparison.ratingDelta)
    ? `<strong>${formatSignedDelta(comparison.ratingDelta)}</strong> · ${escapeHtml(getRatingSourceLabel(comparison.ratingSource))}`
    : 'Not calculated · different rating sources'
  const dateGap = Number.isFinite(comparison.airDateGapDays)
    ? `
        <div>
          <dt>Aired</dt>
          <dd>${comparison.airDateGapDays} ${comparison.airDateGapDays === 1 ? 'day' : 'days'} apart</dd>
        </div>
      `
    : ''
  const spanContext = comparison.spanContext
    ? `
        <div>
          <dt>Span vs rest</dt>
          <dd><strong>${formatSignedDelta(comparison.spanContext.insideMean - comparison.spanContext.outsideMean)}</strong> · ${comparison.spanContext.insideMean.toFixed(1)} span / ${comparison.spanContext.outsideMean.toFixed(1)} rest · ${escapeHtml(getRatingSourceLabel(comparison.spanContext.ratingSource))}</dd>
        </div>
      `
    : ''

  return `
    <dl class="sidenote-comparison-metrics">
      <div>
        <dt>Rating change</dt>
        <dd>${ratingChange}</dd>
      </div>
      <div>
        <dt>Span</dt>
        <dd>${comparison.span.episodeCount} ${comparison.span.episodeCount === 1 ? 'episode' : 'episodes'} · ${comparison.span.ratedCount} rated by ${escapeHtml(getRatingSourceLabel(comparison.span.ratingSource))}</dd>
      </div>
      ${dateGap}
      ${spanContext}
    </dl>
  `
}

function renderComparisonExtremes(comparison) {
  if (!comparison.span.top || !comparison.span.bottom) {
    return ''
  }

  return `
    <div class="sidenote-comparison-extremes" aria-label="Highest and lowest rated episodes in the comparison span">
      ${renderComparisonExtreme('Highest in span', comparison.span.top)}
      ${renderComparisonExtreme('Lowest in span', comparison.span.bottom)}
    </div>
  `
}

function renderComparisonExtreme(label, extreme) {
  return `
    <section>
      <h2>${label}</h2>
      <button type="button" class="sidenote-comparison-extreme" data-comparison-point-id="${escapeHtml(extreme.point.id)}" aria-label="Select ${escapeHtml(formatEpisodeLabel(extreme.point))}, ${escapeHtml(extreme.point.title)}">
        <span>${escapeHtml(formatEpisodeLabel(extreme.point))}</span>
        <span>${escapeHtml(extreme.point.title)}</span>
        <strong>${extreme.point.rating.toFixed(1)}</strong>
      </button>
    </section>
  `
}

function renderBreakpointRegime(label, summary, medianRating) {
  return `
    <section class="breakpoint-regime">
      <h2>${escapeHtml(label)}</h2>
      <p><strong>${medianRating.toFixed(1)}</strong> median · ${escapeHtml(formatTrendCopy(summary))}</p>
      <p class="trend-summary-context">${summary.n} rated ${summary.n === 1 ? 'episode' : 'episodes'}</p>
    </section>
  `
}

function formatTrendCopy(summary) {
  return summary.direction === 'up'
    ? `Trending up ${formatSignedDelta(summary.delta)}`
    : summary.direction === 'down'
      ? `Trending down ${formatSignedDelta(summary.delta)}`
      : `No clear trend${Number.isFinite(summary.delta) ? ` ${formatSignedDelta(summary.delta)}` : ''}`
}

function formatEpisodeLabel(point) {
  const episodeNumber = point.episode ?? point.number
  return `S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
}

function formatBreakpointPValue(value) {
  if (value < 0.01) {
    return 'permutation p < 0.01'
  }
  return `permutation p = ${value.toFixed(2)}`
}

function updateNavigatorButton(button, available, label) {
  button.setAttribute('aria-disabled', String(!available))
  button.setAttribute('aria-label', label)
}

function renderRanking(label, extremes) {
  return `
    <section class="trend-summary-ranking">
      <h2 class="trend-summary-ranking-title">${label}</h2>
      <ol class="trend-summary-ranking-list">
        ${extremes.map((extreme, index) => renderExtreme(extreme, index)).join('')}
      </ol>
    </section>
  `
}

function renderTrendInfo(summary, id) {
  const criteria = summary.trendCriteria
  const checks = [
    {
      passed: criteria.enoughRatedEpisodes,
      label: `Enough data: ${criteria.ratedEpisodes} rated, need ${criteria.minimumRatedEpisodes}`
    },
    {
      passed: criteria.consistentSlope,
      label: `Consistent slope: ${formatThresholdValue(criteria.signalRatio, criteria.minimumSignalRatio, '×')}, need ${criteria.minimumSignalRatio.toFixed(1)}×`
    },
    {
      passed: criteria.meaningfulDelta,
      label: `Meaningful change: ${formatThresholdValue(criteria.absoluteDelta, criteria.minimumDelta, '')} points, need ${criteria.minimumDelta.toFixed(1)} points`
    }
  ]

  return `
    <aside class="trend-info-tooltip" id="${id}" role="tooltip" hidden>
      <strong>Why this trend?</strong>
      <p>A clear trend must pass every check:</p>
      <ul>
        ${checks.map(renderTrendCheck).join('')}
      </ul>
      ${renderTrendStatistics(summary)}
    </aside>
  `
}

function renderTrendStatistics(summary) {
  const statistics = []

  if (Number.isFinite(summary.residualMeanAbsoluteError)) {
    statistics.push({
      label: 'Typical deviation',
      value: `${summary.residualMeanAbsoluteError.toFixed(1)} points from the trendline`
    })
  }

  if (summary.n >= 5 && Number.isFinite(summary.deltaStandardError)) {
    statistics.push({
      label: 'Change uncertainty',
      value: `±${formatMagnitude(summary.deltaStandardError * 2)} points (about two standard errors)`
    })
  }

  if (summary.n >= 5 && Number.isFinite(summary.rSquared)) {
    statistics.push({
      label: 'Trend fit',
      value: `${Math.round(summary.rSquared * 100)}% of rating variation`
    })
  }

  if (Number.isFinite(summary.betweenSeasonVariationShare)) {
    statistics.push({
      label: 'Season shifts',
      value: `${Math.round(summary.betweenSeasonVariationShare * 100)}% of series variation`
    })
  }

  if (statistics.length === 0) {
    return ''
  }

  return `
    <dl class="trend-info-statistics">
      ${statistics
        .map(
          (statistic) => `
            <div>
              <dt>${escapeHtml(statistic.label)}</dt>
              <dd>${escapeHtml(statistic.value)}</dd>
            </div>
          `
        )
        .join('')}
    </dl>
  `
}

function renderSeasonExtremes(extremes) {
  if (!extremes) {
    return ''
  }

  return `
    <div class="trend-summary-rankings trend-summary-season-rankings" aria-label="Best and worst rated seasons">
      ${renderSeasonExtreme('Best Season', extremes.best)}
      ${renderSeasonExtreme('Worst Season', extremes.worst)}
    </div>
  `
}

function renderSeasonExtreme(label, extreme) {
  const ratedContext = Number.isFinite(extreme.ratedEpisodes)
    ? `<span aria-hidden="true">·</span> <span class="trend-summary-context">${extreme.ratedEpisodes} rated</span>`
    : ''

  return `
    <section class="trend-summary-ranking trend-summary-season-ranking">
      <h2 class="trend-summary-ranking-title">${escapeHtml(label)}</h2>
      <p class="trend-summary-season-extreme">
        ${renderSeasonTrendButtons(extreme.seasonNumbers)}
        <span aria-hidden="true">·</span>
        <span>${extreme.mean.toFixed(1)}</span>
        ${ratedContext}
      </p>
    </section>
  `
}

function renderSeasonTrendButtons(seasonNumbers) {
  const buttons = seasonNumbers.map(
    (seasonNumber) =>
      `<button type="button" class="trend-summary-season-button" data-trend-season-number="${escapeHtml(seasonNumber)}" aria-label="Select Season ${escapeHtml(seasonNumber)} trendline">Season ${escapeHtml(seasonNumber)}</button>`
  )
  const content = new Intl.ListFormat('en', {
    style: 'long',
    type: 'conjunction'
  }).format(buttons)

  return `<span class="trend-summary-season-buttons">${content}</span>`
}

function renderSpreadMetric(standardDeviation, context) {
  if (!Number.isFinite(standardDeviation)) {
    return ''
  }

  return `
    <div class="trend-summary-metric">
      <dt>Spread</dt>
      <dd>${standardDeviation.toFixed(1)} points${context}</dd>
    </div>
  `
}

function formatMeanContext(summary) {
  if (!Number.isFinite(summary.seriesMeanDifference)) {
    return ''
  }

  if (Math.abs(summary.seriesMeanDifference) < 0.05) {
    return '<span class="trend-summary-context"> · matches series</span>'
  }

  return `<span class="trend-summary-context"> · ${formatSignedDelta(summary.seriesMeanDifference)} vs series</span>`
}

function renderTrendCheck(check) {
  const status = check.passed ? 'Pass' : 'Does not pass'
  return `<li class="trend-info-check" data-passed="${check.passed}"><span class="trend-info-check-mark" aria-hidden="true">${check.passed ? '✓' : '×'}</span><span><span class="visually-hidden">${status}: </span>${escapeHtml(check.label)}</span></li>`
}

function formatThresholdValue(value, threshold, suffix) {
  if (!Number.isFinite(value)) {
    return `∞${suffix}`
  }

  for (let precision = 1; precision <= 6; precision += 1) {
    const observed = value.toFixed(precision)
    if (observed !== threshold.toFixed(precision)) {
      return `${observed}${suffix}`
    }
  }

  return value < threshold
    ? `< ${threshold.toFixed(1)}${suffix}`
    : `${value.toFixed(1)}${suffix}`
}

function renderExtreme(extreme, index) {
  const point = extreme.point
  const episodeNumber = point.episode ?? point.number
  const episodeLabel = `S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`

  return `<li><button type="button" class="trend-summary-extreme" data-trend-point-id="${escapeHtml(point.id)}"><span class="trend-summary-rank" aria-hidden="true">${index + 1}.</span><span>${episodeLabel}</span><span class="trend-summary-episode-title">${escapeHtml(point.title ?? 'Untitled episode')}</span><span>${extreme.value.toFixed(1)}</span></button></li>`
}

function formatSignedDelta(value) {
  const rounded = Math.abs(value).toFixed(1)
  return value >= 0 ? `+${rounded}` : `−${rounded}`
}

function formatMagnitude(value) {
  return value > 0 && value < 0.05 ? '<0.1' : value.toFixed(1)
}
