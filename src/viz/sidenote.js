function formatRatingList(point) {
  return point.ratings
    .map((rating) => {
      if (typeof rating.rating !== 'number') {
        return `<li>${rating.source.toUpperCase()}: n/a</li>`
      }

      const votes = typeof rating.votes === 'number' ? ` · ${rating.votes.toLocaleString()} votes` : ''
      return `<li>${rating.source.toUpperCase()}: ${rating.rating.toFixed(1)}${votes}</li>`
    })
    .join('')
}

export function createSidenote({ desktopRoot, mobileRoot }) {
  function renderPlaceholder() {
    if (desktopRoot) {
      desktopRoot.innerHTML = `
        <div class="sidenote-card placeholder">
          <p class="sidenote-kicker">Episode detail</p>
          <p class="sidenote-body">Hover, focus, or tap an episode to inspect its title, date, synopsis, and source ratings.</p>
        </div>
      `
    }

    if (mobileRoot) {
      mobileRoot.innerHTML = ''
    }
  }

  function renderPoint(point) {
    const markup = point
      ? `
          <div class="sidenote-card">
            <p class="sidenote-kicker">S${String(point.season).padStart(2, '0')}E${String(point.episode).padStart(2, '0')}</p>
            <h3 class="sidenote-title">${escapeHtml(point.title)}</h3>
            ${
              typeof point.rating === 'number'
                ? `<p class="sidenote-rating">${point.rating.toFixed(1)}</p>`
                : '<p class="sidenote-rating">n/a</p>'
            }
            <p class="sidenote-meta">${escapeHtml(point.date ?? 'Unknown air date')}</p>
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
