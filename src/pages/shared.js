export function renderLoading(message = 'Loading...') {
  return `<p class="state-copy" role="status">${message}</p>`
}

export function renderEmpty(message) {
  return `<p class="state-copy">${message}</p>`
}

export function renderError(message) {
  return `<p class="state-copy error-state">${message}</p>`
}

export function formatRatingBadge(rating) {
  if (typeof rating.rating !== 'number') {
    return `${rating.source.toUpperCase()}: n/a`
  }

  const votes = typeof rating.votes === 'number' ? ` · ${rating.votes.toLocaleString()} votes` : ''
  return `${rating.source.toUpperCase()}: ${rating.rating.toFixed(1)}${votes}`
}
