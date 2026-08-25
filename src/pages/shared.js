import { isUsableProviderRating } from '../data/stats.js'
import {
  getRatingSourceLabel,
  getRatingSourceUrl
} from '../data/ratingProviders.js'
import { escapeHtml } from '../lib/html.js'
import { renderVoteCount } from '../ui/voteCount.js'

export function renderLoading(
  message = 'Loading...',
  { announce = true } = {}
) {
  return `<p class="state-copy"${announce ? ' role="status"' : ''}>${escapeHtml(message)}</p>`
}

export function renderPublisherBrand() {
  return `
    <a class="publisher-brand" href="https://yalethom.as/" aria-label="yalethom.as/graphtv, publisher home">
      <span>yalethom</span><span class="publisher-brand-period">.</span><span>as</span><span class="publisher-brand-path">/graphtv</span>
    </a>
  `
}

export function renderEmpty(message) {
  return `<p class="state-copy">${escapeHtml(message)}</p>`
}

export function renderError(message) {
  return `<p class="state-copy error-state">${escapeHtml(message)}</p>`
}

export function formatRatingBadge(
  rating,
  { show = null, selectable = false, isPrimary = false } = {}
) {
  const sourceLabel = getRatingSourceLabel(rating.source)
  const label = escapeHtml(sourceLabel)
  const sourceUrl = getRatingSourceUrl(rating.source, { show })
  const source = sourceUrl
    ? `<a class="rating-badge-source rating-source-link" href="${escapeHtml(sourceUrl)}">${label}</a>`
    : `<span class="rating-badge-source">${label}</span>`

  if (!isUsableProviderRating(rating)) {
    return renderRatingBadgeColumns(
      source,
      '<span class="rating-badge-value">n/a</span>',
      '<span class="rating-badge-votes"></span>'
    )
  }

  const formattedRating = rating.rating.toFixed(1)
  const selectorAttributes = `data-series-rating-source="${escapeHtml(rating.source)}" aria-pressed="${String(isPrimary)}"`
  const ratingValue = selectable
    ? `<button type="button" class="rating-badge-value series-rating-button" ${selectorAttributes} aria-label="${escapeHtml(`Plot episodes using ${sourceLabel} rating ${formattedRating}`)}">${formattedRating}</button>`
    : `<span class="rating-badge-value">${formattedRating}</span>`
  const votesValue = Number.isFinite(rating.votes)
    ? renderVoteCount(rating.votes, { className: 'rating-badge-votes' })
    : '<span class="rating-badge-votes"></span>'

  return renderRatingBadgeColumns(source, ratingValue, votesValue)
}

function renderRatingBadgeColumns(source, ratingValue, votesValue) {
  return `${source}<span class="rating-badge-score">${ratingValue} ${votesValue}</span>`
}
