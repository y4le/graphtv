import { describe, expect, it } from 'vitest'

import { formatRatingBadge, renderLoading, renderPublisherBrand } from '../../src/pages/shared.js'

describe('renderPublisherBrand', () => {
  it('renders the publisher signature as a root-home link with one accented period', () => {
    const markup = renderPublisherBrand()

    expect(markup).toContain('href="https://yalethom.as/"')
    expect(markup).toContain('aria-label="yalethom.as/graphtv, publisher home"')
    expect(markup).toContain('<span class="publisher-brand-period">.</span>')
    expect(markup).not.toContain('target=')
  })
})

describe('renderLoading', () => {
  it('can defer announcements to a containing live region', () => {
    expect(renderLoading('Searching…')).toContain('role="status"')
    expect(renderLoading('Searching…', { announce: false })).not.toContain('role="status"')
  })
})

describe('formatRatingBadge', () => {
  it('renders a zero rating as unavailable', () => {
    const root = renderBadge({ source: 'tmdb', rating: 0, votes: 0 })

    expect(root.querySelector('.rating-badge-source').textContent).toBe('TMDB')
    expect(root.querySelector('.rating-badge-value').textContent).toBe('n/a')
    expect(root.querySelector('.rating-badge-votes').textContent).toBe('')
  })

  it('labels IMDb ratings and condenses large vote counts', () => {
    const millions = renderBadge({
      source: 'omdb',
      rating: 8.7,
      votes: 1_100_000
    })
    const thousands = renderBadge({
      source: 'tmdb',
      rating: 8.1,
      votes: 8300
    })

    expect(millions.textContent).toBe('IMDb8.71.1m votes')
    expect(thousands.textContent).toBe('TMDB8.18.3k votes')
  })
})

function renderBadge(rating) {
  const root = document.createElement('li')
  root.innerHTML = formatRatingBadge(rating)
  return root
}
