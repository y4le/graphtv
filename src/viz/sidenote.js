import { isUsableRating } from '../data/stats.js'

function formatRatingList(point) {
  return point.ratings
    .map((rating) => {
      const votes =
        typeof rating.votes === 'number'
          ? ` · ${rating.votes.toLocaleString('en-US')} votes`
          : ''

      if (!isUsableRating(rating.rating)) {
        return `<li>${rating.source.toUpperCase()}: n/a${votes}</li>`
      }

      return `<li>${rating.source.toUpperCase()}: ${rating.rating.toFixed(1)}${votes}</li>`
    })
    .join('')
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

  function renderPoint(point) {
    const markup = point
      ? `
          <div class="sidenote-card">
            <div class="sidenote-header">
              <p class="sidenote-caption">
                <span class="sidenote-kicker">S${String(point.season).padStart(2, '0')}E${String(point.episode).padStart(2, '0')}</span>
                <span class="sidenote-title">${escapeHtml(point.title)}</span>
                ${
                  isUsableRating(point.rating)
                    ? `<span class="sidenote-rating">${point.rating.toFixed(1)}</span>`
                    : '<span class="sidenote-rating">n/a</span>'
                }
                <span class="sidenote-meta">${escapeHtml(point.date ?? 'Unknown air date')}</span>
              </p>
            </div>
            <ul class="sidenote-ratings">${formatRatingList(point)}</ul>
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
