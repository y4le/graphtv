import { describe, expect, it, vi } from 'vitest'

import { createSidenote } from '../../src/viz/sidenote.js'

describe('createSidenote', () => {
  it('orders ratings by plotting preference and emphasizes the plotted source', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ desktopRoot: root })

    sidenote.renderPoint({
      title: 'A Great Episode',
      season: 1,
      episode: 2,
      date: '2026-08-11',
      plot: 'An episode synopsis.',
      rating: 8.2,
      ratingSource: 'omdb',
      ratings: [
        { source: 'tmdb', rating: 7.8, votes: 47 },
        { source: 'omdb', rating: 8.2, votes: 4000 },
        { source: 'tvmaze', rating: 7.5, votes: null }
      ]
    })

    const ratings = root.querySelector('.sidenote-ratings')
    expect(ratings.textContent).toBe(
      'IMDb 8.2 (4k votes) · TVmaze 7.5 · TMDB 7.8 (47 votes)'
    )
    expect(ratings.querySelector('strong').textContent).toBe(
      'IMDb 8.2 (4k votes)'
    )
    expect(
      ratings.querySelector('.sidenote-rating-primary-value').textContent
    ).toBe('8.2')
    expect(root.querySelector('.sidenote-caption').textContent).not.toContain(
      '8.2'
    )
    expect(
      Array.from(root.querySelector('.sidenote-caption').children).map(
        (item) => item.textContent
      )
    ).toEqual(['A Great Episode', 'S01E02', '2026-08-11'])
  })

  it('shows a vote-count placeholder while IMDb details load', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ desktopRoot: root })

    sidenote.renderPoint(
      {
        title: 'A Great Episode',
        season: 1,
        episode: 2,
        date: '2026-08-11',
        rating: 8.2,
        ratingSource: 'omdb',
        ratings: [{ source: 'omdb', rating: 8.2, votes: null }]
      },
      { loadingDetails: true }
    )

    const loading = root.querySelector('.sidenote-votes-loading')
    expect(loading).not.toBeNull()
    expect(loading.getAttribute('aria-label')).toBe('Loading IMDb vote count')
    expect(loading.querySelector('.sidenote-votes-loading-dot')).not.toBeNull()
  })

  it('renders a compact trend summary and lets extremes select episodes', () => {
    const root = document.createElement('section')
    const onSelectPoint = vi.fn()
    const sidenote = createSidenote({
      desktopRoot: root,
      onSelectPoint
    })

    sidenote.renderTrendSummary({
      label: 'Season 2',
      n: 5,
      totalEpisodes: 6,
      excludedFallback: 1,
      source: 'omdb',
      mean: 8.24,
      direction: 'up',
      delta: 0.62,
      high: {
        value: 9.4,
        point: { id: 'high', season: 2, episode: 5 }
      },
      low: {
        value: 7.2,
        point: { id: 'low', season: 2, episode: 1 }
      }
    })

    expect(root.querySelector('.sidenote-title').textContent).toBe('Season 2')
    expect(root.textContent).toContain('Mean')
    expect(root.textContent).toContain('8.2')
    expect(root.textContent).toContain('Trending up +0.6')
    expect(root.textContent).toContain('5 of 6 rated · IMDb')
    expect(root.textContent).toContain(
      '1 episode uses other sources and is excluded'
    )

    root.querySelector('[data-trend-point-id="high"]').click()
    expect(onSelectPoint).toHaveBeenCalledWith('high')
  })

  it('does not show a numeric delta when the trend is unclear', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ desktopRoot: root })

    sidenote.renderTrendSummary({
      label: 'Full series',
      n: 4,
      totalEpisodes: 4,
      excludedFallback: 0,
      source: 'tmdb',
      mean: 7.5,
      direction: 'unclear',
      delta: 1.2,
      high: {
        value: 8,
        point: { id: 'high', season: 1, episode: 4 }
      },
      low: {
        value: 7,
        point: { id: 'low', season: 1, episode: 1 }
      }
    })

    expect(root.textContent).toContain('No clear trend')
    expect(root.textContent).not.toContain('+1.2')
    expect(root.textContent).toContain('too few rated episodes for a trend')
  })
})
