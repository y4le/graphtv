export function renderLoading(message = 'Loading...') {
  return `<div class="state-card" role="status">${message}</div>`
}

export function renderEmpty(message) {
  return `<div class="state-card">${message}</div>`
}

export function renderError(message) {
  return `<div class="state-card error-state">${message}</div>`
}

export function formatRatingBadge(rating) {
  if (typeof rating.rating !== 'number') {
    return `${rating.source.toUpperCase()}: n/a`
  }

  const votes = typeof rating.votes === 'number' ? ` · ${rating.votes.toLocaleString()} votes` : ''
  return `${rating.source.toUpperCase()}: ${rating.rating.toFixed(1)}${votes}`
}
