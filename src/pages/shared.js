import { isUsableProviderRating } from '../data/stats.js'
import {
  getRatingSourceLabel,
  getRatingSourceUrl
} from '../data/ratingProviders.js'
import { formatCompactNumber } from '../lib/number.js'

export function renderLoading(message = 'Loading...', { announce = true } = {}) {
  return `<p class="state-copy"${announce ? ' role="status"' : ''}>${message}</p>`
}

export function renderPublisherBrand() {
  return `
    <a class="publisher-brand" href="https://yalethom.as/" aria-label="yalethom.as/graphtv, publisher home">
      <span>yalethom</span><span class="publisher-brand-period">.</span><span>as/graphtv</span>
    </a>
  `
}

export function renderEmpty(message) {
  return `<p class="state-copy">${message}</p>`
}

export function renderError(message) {
  return `<p class="state-copy error-state">${message}</p>`
}

export function formatRatingBadge(rating, { show = null } = {}) {
  const label = escapeHtml(getRatingSourceLabel(rating.source))
  const sourceUrl = getRatingSourceUrl(rating.source, { show })
  const source = sourceUrl
    ? `<a class="rating-badge-source rating-source-link" href="${escapeHtml(sourceUrl)}">${label}</a>`
    : `<span class="rating-badge-source">${label}</span>`

  if (!isUsableProviderRating(rating)) {
    return renderRatingBadgeColumns(source, 'n/a', '')
  }

  const votes =
    typeof rating.votes === 'number'
      ? `${formatCompactNumber(rating.votes)} ${rating.votes === 1 ? 'vote' : 'votes'}`
      : ''

  return renderRatingBadgeColumns(source, rating.rating.toFixed(1), votes)
}

function renderRatingBadgeColumns(source, rating, votes) {
  return `${source}<span class="rating-badge-value">${rating}</span><span class="rating-badge-votes">${votes}</span>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
