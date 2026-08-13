import {
  getRatingSourceLabel,
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

function formatRatingList(point, { loadingDetails = false } = {}) {
  return orderVisibleRatings(point.ratings.filter(isTrustedRating))
    .map((rating, index) => {
      const isPrimary = rating.source === point.ratingSource
      const votes =
        typeof rating.votes === 'number'
          ? ` (${formatCompactNumber(rating.votes)} ${rating.votes === 1 ? 'vote' : 'votes'})`
          : loadingDetails && rating.source === 'omdb'
            ? ` (${renderVotesLoading()})`
            : ''
      const label = getEpisodeRatingSourceLabel(rating.source)
      const value = isUsableRating(rating.rating)
        ? `${
            isPrimary
              ? `<span class="sidenote-rating-primary-value">${rating.rating.toFixed(1)}</span>`
              : rating.rating.toFixed(1)
          }${votes}`
        : `n/a${votes}`
      const content = `${escapeHtml(label)} ${value}`
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

export function createSidenote({
  root,
  onInteract,
  onNavigate,
  onSelectPoint
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

  function renderPoint(point, { loadingDetails = false } = {}) {
    const markup = point
      ? `
          <div class="sidenote-card">
            <div class="sidenote-header">
              <p class="sidenote-caption">
                <span class="sidenote-title">${escapeHtml(point.title)}</span>
                <span class="sidenote-meta">${escapeHtml(point.date ?? 'Unknown air date')}</span>
              </p>
            </div>
            <p class="sidenote-ratings">${formatRatingList(point, { loadingDetails })}</p>
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

  function renderTrendSummary(summary) {
    if (!summary) {
      renderRestingState()
      return
    }

    const fallbackCopy = summary.excludedFallback
      ? `${summary.excludedFallback} ${summary.excludedFallback === 1 ? 'episode uses' : 'episodes use'} other sources and ${summary.excludedFallback === 1 ? 'is' : 'are'} excluded`
      : null
    const trendCopy =
      summary.direction === 'up'
        ? `Trending up ${formatSignedDelta(summary.delta)}`
        : summary.direction === 'down'
          ? `Trending down ${formatSignedDelta(summary.delta)}`
          : 'No clear trend'
    const provenanceNotes = [
      fallbackCopy,
      !summary.trendCriteria.enoughRatedEpisodes
        ? 'too few rated episodes for a trend'
        : null
    ].filter(Boolean)
    const provenance = `${summary.n} of ${summary.totalEpisodes} rated · ${escapeHtml(getRatingSourceLabel(summary.source))}${
      provenanceNotes.length > 0
        ? ` — ${escapeHtml(provenanceNotes.join('; '))}`
        : ''
    }`

    setMarkup(`
      <div class="sidenote-card sidenote-trend-card">
        <div class="sidenote-header">
          <p class="sidenote-caption">
            <span class="sidenote-title">${escapeHtml(summary.label)}</span>
            <span class="sidenote-kicker">${summary.totalEpisodes} ${summary.totalEpisodes === 1 ? 'episode' : 'episodes'}</span>
          </p>
        </div>
        <dl class="trend-summary-metrics">
          <div class="trend-summary-metric">
            <dt>Mean</dt>
            <dd>${summary.mean.toFixed(1)}</dd>
          </div>
          <div class="trend-summary-metric">
            <dt>Trend</dt>
            <dd class="trend-summary-trend-value">
              <span>${trendCopy}</span>
              <div class="trend-info-control">
                <button type="button" class="trend-info-button" data-trend-info aria-label="Explain trend classification" aria-expanded="false" aria-controls="${trendInfoId}" aria-describedby="${trendInfoId}">ⓘ</button>
                ${renderTrendInfo(summary, trendInfoId)}
              </div>
            </dd>
          </div>
        </dl>
        <div class="trend-summary-rankings" aria-label="Highest and lowest rated episodes">
          ${renderRanking('Top Rated', summary.top)}
          ${renderRanking('Bottom Rated', summary.bottom)}
        </div>
        <p class="trend-summary-provenance">${provenance}</p>
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
    </aside>
  `
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
