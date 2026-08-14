import {
  getRatingSourceLabel,
  getRatingSourceUrl,
  orderVisibleRatings
} from '../data/ratingProviders.js'
import { isTrustedRating, isUsableRating } from '../data/stats.js'
import { formatCompactNumber } from '../lib/number.js'

let trendInfoSequence = 0
const trendInfoDocuments = new WeakSet()

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

function ensureOutsideTrendInfoDismissal(ownerDocument) {
  if (trendInfoDocuments.has(ownerDocument)) {
    return
  }

  trendInfoDocuments.add(ownerDocument)
  ownerDocument.addEventListener(
    'click',
    (event) => {
      ownerDocument
        .querySelectorAll(
          '.trend-info-control [data-trend-info][aria-expanded="true"]'
        )
        .forEach((button) => {
          const control = button.closest('.trend-info-control')
          if (!control.contains(event.target)) {
            dismissTrendInfo(control)
          }
        })
    },
    true
  )
}

function formatRatingList(point, { loadingDetails = false, show = null } = {}) {
  return orderVisibleRatings(point.ratings.filter(isTrustedRating))
    .map((rating, index) => {
      const isPrimary = rating.source === point.ratingSource
      const votes =
        typeof rating.votes === 'number'
          ? ` (${formatCompactNumber(rating.votes)} ${rating.votes === 1 ? 'vote' : 'votes'})`
          : loadingDetails && rating.source === 'omdb'
            ? ` (${renderVotesLoading()})`
            : ''
      const source = formatRatingSource(rating.source, {
        show,
        episode: point,
        className: 'sidenote-rating-source'
      })
      const value = isUsableRating(rating.rating)
        ? `${
            isPrimary
              ? `<span class="sidenote-rating-primary-value">${rating.rating.toFixed(1)}</span>`
              : rating.rating.toFixed(1)
          }${votes}`
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

export function createSidenote({
  root,
  onInteract,
  onNavigate,
  onSelectPoint,
  onSelectSeasonTrend,
  onSelectSeriesBreakpoint
}) {
  ensureOutsideTrendInfoDismissal(root.ownerDocument)
  const eventController = new root.ownerDocument.defaultView.AbortController()
  const eventOptions = { signal: eventController.signal }
  const listen = (type, listener) => {
    root.addEventListener(type, listener, eventOptions)
  }
  root.innerHTML = `
    <div class="sidenote-nav" role="group" aria-label="Episode navigation">
      <button type="button" class="sidenote-nav-button shortcut-action keycap" data-sidenote-nav="previous" aria-label="Previous episode" aria-disabled="true">
        <span aria-hidden="true">‹</span>
      </button>
      <p class="sidenote-nav-status">
        <span class="sidenote-nav-label">Browse episodes</span>
        <span class="sidenote-nav-meta"></span>
      </p>
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
  const previousButton = root.querySelector('[data-sidenote-nav="previous"]')
  const nextButton = root.querySelector('[data-sidenote-nav="next"]')
  const trendInfoId = `trend-info-tooltip-${++trendInfoSequence}`
  let navigatorKey = null

  function setMarkup(markup) {
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
    const key = [
      viewModel.mode,
      viewModel.navigationKind,
      viewModel.label,
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
      (viewModel.navigationKind ?? viewModel.mode) === 'season'
        ? 'Season trend navigation'
        : 'Episode navigation'
    )
    navigatorLabel.textContent = viewModel.label
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

  function renderPoint(point, { loadingDetails = false, show = null } = {}) {
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
            ${
              point.plot
                ? `<p class="sidenote-body">${escapeHtml(point.plot)}</p>`
                : '<p class="sidenote-body">No synopsis available.</p>'
            }
          </div>
        `
      : ''

    setMarkup(markup)
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
            <button type="button" class="trend-summary-breakpoint-button" data-series-breakpoint>Show detected breakpoint</button>
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
        : `Below threshold ${Math.round(summary.score)}/100`
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
    const navigatorButton = event.target.closest?.('[data-sidenote-nav]')
    if (navigatorButton) {
      onInteract?.()
      if (navigatorButton.getAttribute('aria-disabled') === 'true') {
        return
      }
      onNavigate?.(navigatorButton.dataset.sidenoteNav === 'previous' ? -1 : 1)
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

  listen('mouseover', (event) => {
    const control = event.target.closest?.('.trend-info-control')
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.hovered = 'true'
    control.dataset.dismissed = 'false'
    syncTrendInfo(control)
  })

  listen('mouseout', (event) => {
    const control = event.target.closest?.('.trend-info-control')
    if (!control || control.contains(event.relatedTarget)) {
      return
    }

    control.dataset.hovered = 'false'
    syncTrendInfo(control)
  })

  listen('focusin', (event) => {
    const control = event.target.closest?.('.trend-info-control')
    if (!control) {
      return
    }

    control.dataset.focused = 'true'
    control.dataset.dismissed = 'false'
    syncTrendInfo(control)
  })

  listen('focusout', (event) => {
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
    renderTrendSummary,
    renderRestingState,
    destroy() {
      eventController.abort()
      root.replaceChildren()
    }
  }
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
