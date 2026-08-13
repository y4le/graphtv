import {
  getRatingSourceLabel,
  orderVisibleRatings
} from '../data/ratingProviders.js'
import { isTrustedRating, isUsableRating } from '../data/stats.js'
import { formatCompactNumber } from '../lib/number.js'

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

export function createSidenote({ root, onInteract, onSelectPoint }) {
  root.innerHTML = `
    <div class="sidenote-nav" role="group" aria-label="Episode navigation">
      <button type="button" class="sidenote-nav-button" data-sidenote-nav="previous" aria-label="Previous episode" aria-disabled="true">
        <span aria-hidden="true">‹</span>
      </button>
      <p class="sidenote-nav-status">
        <span class="sidenote-nav-label">Browse episodes</span>
        <span class="sidenote-nav-meta"></span>
      </p>
      <button type="button" class="sidenote-nav-button" data-sidenote-nav="next" aria-label="Next episode" aria-disabled="true">
        <span aria-hidden="true">›</span>
      </button>
    </div>
    <div class="sidenote-content"></div>
  `

  const contentRoot = root.querySelector('.sidenote-content')
  const navigatorLabel = root.querySelector('.sidenote-nav-label')
  const navigatorMeta = root.querySelector('.sidenote-nav-meta')
  const previousButton = root.querySelector('[data-sidenote-nav="previous"]')
  const nextButton = root.querySelector('[data-sidenote-nav="next"]')
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
      viewModel.label,
      viewModel.meta,
      viewModel.previousPointId,
      viewModel.nextPointId,
      viewModel.nextLabel
    ].join(':')
    if (key === navigatorKey) {
      return
    }
    navigatorKey = key

    navigatorLabel.textContent = viewModel.label
    navigatorMeta.textContent = viewModel.meta ?? ''
    updateNavigatorButton(
      previousButton,
      viewModel.previousPointId,
      'Previous episode'
    )
    updateNavigatorButton(
      nextButton,
      viewModel.nextPointId,
      viewModel.nextLabel ?? 'Next episode'
    )
  }

  function renderPoint(point, { loadingDetails = false } = {}) {
    const episodeNumber = point?.episode ?? point?.number
    const markup = point
      ? `
          <div class="sidenote-card">
            <div class="sidenote-header">
              <p class="sidenote-caption">
                <span class="sidenote-title">${escapeHtml(point.title)}</span>
                <span class="sidenote-kicker">S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}</span>
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
      summary.n < 5 ? 'too few rated episodes for a trend' : null
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
            <dd>${trendCopy}</dd>
          </div>
        </dl>
        <div class="trend-summary-extremes" aria-label="Highest and lowest rated episodes">
          ${renderExtreme('High', summary.high)}
          <span aria-hidden="true">·</span>
          ${renderExtreme('Low', summary.low)}
        </div>
        <p class="trend-summary-provenance">${provenance}</p>
      </div>
    `)
  }

  root.addEventListener('click', (event) => {
    const navigatorButton = event.target.closest?.('[data-sidenote-nav]')
    if (navigatorButton) {
      onInteract?.()
      if (navigatorButton.getAttribute('aria-disabled') === 'true') {
        return
      }
      onSelectPoint?.(navigatorButton.dataset.pointId)
      return
    }

    const trendPointButton = event.target.closest?.('[data-trend-point-id]')
    if (trendPointButton) {
      onInteract?.()
      onSelectPoint?.(trendPointButton.dataset.trendPointId)
    }
  })

  renderRestingState()

  return {
    renderNavigator,
    renderPoint,
    renderTrendSummary,
    renderRestingState
  }
}

function updateNavigatorButton(button, pointId, label) {
  const available = Boolean(pointId)
  button.setAttribute('aria-disabled', String(!available))
  button.setAttribute('aria-label', label)
  if (available) {
    button.dataset.pointId = pointId
  } else {
    delete button.dataset.pointId
  }
}

function renderExtreme(label, extreme) {
  const point = extreme.point
  const episodeNumber = point.episode ?? point.number
  const episodeLabel = `S${String(point.season).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`

  return `<button type="button" class="trend-summary-extreme" data-trend-point-id="${escapeHtml(point.id)}"><span>${label}</span> ${episodeLabel} ${extreme.value.toFixed(1)}</button>`
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
