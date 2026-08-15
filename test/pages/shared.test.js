import { describe, expect, it } from 'vitest'

import {
  formatRatingBadge,
  renderEmpty,
  renderError,
  renderLoading,
  renderPublisherBrand
} from '../../src/pages/shared.js'

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
    expect(renderLoading('Searching…', { announce: false })).not.toContain(
      'role="status"'
    )
  })

  it.each([renderLoading, renderEmpty, renderError])(
    'escapes untrusted state copy at the shared rendering boundary',
    (renderState) => {
      const root = document.createElement('div')
      root.innerHTML = renderState('<img src=x onerror="alert(1)"> & friends')

      expect(root.querySelector('img')).toBeNull()
      expect(root.textContent).toBe('<img src=x onerror="alert(1)"> & friends')
    }
  )
})

describe('formatRatingBadge', () => {
  it('renders a zero rating as unavailable', () => {
    const root = renderBadge({ source: 'tmdb', rating: 0, votes: 0 })

    expect(root.querySelector('.rating-badge-source').textContent).toBe('TMDB')
    expect(root.querySelector('.rating-badge-value').textContent).toBe('n/a')
    expect(root.querySelector('.rating-badge-votes').textContent).toBe('')
  })

  it('renders a TMDB rating below the vote minimum as unavailable', () => {
    const root = renderBadge({ source: 'tmdb', rating: 1, votes: 2 })

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

  it('links the provider label when the series has a native source id', () => {
    const root = renderBadge(
      { source: 'tmdb', rating: 8.1, votes: 8300 },
      { externalIds: { tmdb: 1438 } }
    )
    const source = root.querySelector('.rating-badge-source')

    expect(source.tagName).toBe('A')
    expect(source.getAttribute('href')).toBe(
      'https://www.themoviedb.org/tv/1438'
    )
  })

  it('renders a usable series rating as a primary-source selector', () => {
    const root = document.createElement('li')
    root.innerHTML = formatRatingBadge(
      { source: 'tmdb', rating: 8.1, votes: 8300 },
      { selectable: true, isPrimary: true }
    )
    const button = root.querySelector('.series-rating-button')
    const voteButton = root.querySelector(
      '.rating-badge-votes.series-rating-button'
    )

    expect(button.textContent).toBe('8.1')
    expect(button.dataset.seriesRatingSource).toBe('tmdb')
    expect(button.getAttribute('aria-label')).toBe(
      'Plot episodes using TMDB rating 8.1'
    )
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(voteButton.textContent).toBe('8.3k votes')
    expect(voteButton.dataset.seriesRatingSource).toBe('tmdb')
    expect(voteButton.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelectorAll('.series-rating-button')).toHaveLength(2)

    root.innerHTML = formatRatingBadge(
      { source: 'tmdb', rating: 1, votes: 2 },
      { selectable: true }
    )
    expect(root.querySelector('.series-rating-button')).toBeNull()
  })
})

function renderBadge(rating, show = null) {
  const root = document.createElement('li')
  root.innerHTML = formatRatingBadge(rating, { show })
  return root
}
