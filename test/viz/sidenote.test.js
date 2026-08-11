import { describe, expect, it } from 'vitest'

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
    expect(ratings.querySelector('.sidenote-rating-primary-value').textContent).toBe(
      '8.2'
    )
    expect(root.querySelector('.sidenote-caption').textContent).not.toContain(
      '8.2'
    )
  })
})
