import {
  RATING_SOURCE_PRIORITY,
  getRatingSourceLabel,
  isTrustedRating,
  isUsableRating
} from '../data/stats.js'

function formatRatingList(point, { loadingDetails = false } = {}) {
  return [...point.ratings]
    .filter(isTrustedRating)
    .sort(compareRatingSources)
    .map((rating, index) => {
      const isPrimary = rating.source === point.ratingSource
      const votes =
        typeof rating.votes === 'number'
          ? ` (${formatVoteCount(rating.votes)} ${rating.votes === 1 ? 'vote' : 'votes'})`
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

function compareRatingSources(left, right) {
  return getRatingSourceRank(left.source) - getRatingSourceRank(right.source)
}

function getRatingSourceRank(source) {
  const index = RATING_SOURCE_PRIORITY.indexOf(source)
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function getEpisodeRatingSourceLabel(source) {
  return source === 'omdb' ? 'IMDb' : getRatingSourceLabel(source)
}

function formatVoteCount(votes) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  })
    .format(votes)
    .replaceAll('K', 'k')
    .replaceAll('M', 'm')
    .replaceAll('B', 'b')
    .replaceAll('T', 't')
}

export function createSidenote({ desktopRoot, mobileRoot }) {
  function renderPlaceholder() {
    if (desktopRoot) {
      desktopRoot.innerHTML = ''
    }

    if (mobileRoot) {
      mobileRoot.innerHTML = ''
    }
  }

  function renderPoint(point, { loadingDetails = false } = {}) {
    const markup = point
      ? `
          <div class="sidenote-card">
            <div class="sidenote-header">
              <p class="sidenote-caption">
                <span class="sidenote-kicker">S${String(point.season).padStart(2, '0')}E${String(point.episode).padStart(2, '0')}</span>
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

    if (desktopRoot) {
      desktopRoot.innerHTML = markup
    }

    if (mobileRoot) {
      mobileRoot.innerHTML = markup
    }
  }

  renderPlaceholder()

  return {
    renderPoint,
    renderPlaceholder
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
