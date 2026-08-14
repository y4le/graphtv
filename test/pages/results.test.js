import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  renderResultsMasthead,
  renderResultsPage
} from '../../src/pages/results.js'

let originalPath
let originalTitle

beforeEach(() => {
  originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  originalTitle = document.title
})

afterEach(() => {
  window.history.replaceState({}, '', originalPath)
  document.title = originalTitle
})

describe('renderResultsMasthead', () => {
  it.each([false, true])(
    'keeps the publisher signature first when interactive is %s',
    (interactive) => {
      const container = document.createElement('div')
      container.innerHTML = renderResultsMasthead({ interactive })

      const masthead = container.querySelector('.masthead')
      const navigation = masthead.firstElementChild

      expect(navigation.classList.contains('masthead-navigation')).toBe(true)
      expect(
        navigation.firstElementChild.classList.contains('publisher-brand')
      ).toBe(true)
      expect(
        masthead.querySelector('.masthead-meta .publisher-brand')
      ).toBeNull()
    }
  )

  it('renders the results actions in shortcut order without a prose hint', () => {
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive: true })

    const mastheadActions = Array.from(
      container.querySelectorAll('.masthead-actions .masthead-action')
    )
    expect(mastheadActions.map((action) => action.textContent.trim())).toEqual([
      'Options (o)',
      'Help (?)',
      'Back (q)'
    ])
    expect(
      mastheadActions.slice(0, 2).map((action) => action.dataset.uiAction)
    ).toEqual(['view-options', 'help'])
    expect(container.querySelector('.masthead-hint')).toBeNull()
    expect(
      container.querySelector('.back-link').parentElement.classList
    ).toContain('masthead-actions')
  })

  it('keeps Back available in the non-interactive masthead', () => {
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead()

    const actions = Array.from(
      container.querySelectorAll('.masthead-actions .masthead-action')
    )

    expect(actions).toHaveLength(1)
    expect(actions[0].textContent.trim()).toBe('Back (q)')
    expect(actions[0].getAttribute('aria-label')).toBe(
      'Back to search (q shortcut)'
    )
  })

  it('links back to a blank search page without preserving any query parameters', () => {
    window.history.replaceState(
      {},
      '',
      '/graphtv/?show=tvmaze%3A2790&q=the+good+place&api=omdb&debug=1'
    )
    const container = document.createElement('div')
    container.innerHTML = renderResultsMasthead({ interactive: true })

    const target = new URL(container.querySelector('.back-link').href)

    expect(target.pathname).toBe('/graphtv/')
    expect(target.search).toBe('')
    expect(target.hash).toBe('')
  })
})

describe('renderResultsPage', () => {
  it('shows metadata before episodes and updates the primary chart as supplements settle', async () => {
    let resolvePrimary
    let resolveSupplemental
    const primaryReady = new Promise((resolve) => {
      resolvePrimary = resolve
    })
    const supplementalReady = new Promise((resolve) => {
      resolveSupplemental = resolve
    })
    const primaryBundle = createBundle()
    const supplementalBundle = createBundle({ supplemental: true })
    const bundleStream = async function* () {
      yield {
        phase: 'show',
        show: primaryBundle.show,
        pendingProviders: ['tmdb'],
        complete: false
      }
      await primaryReady
      yield {
        phase: 'primary',
        bundle: primaryBundle,
        pendingProviders: ['tmdb'],
        complete: false
      }
      await supplementalReady
      yield {
        phase: 'supplemental',
        provider: 'tmdb',
        bundle: supplementalBundle,
        pendingProviders: [],
        complete: true
      }
    }
    const chart = {
      updateSeasons: vi.fn(),
      destroy: vi.fn(),
      getDebugState: vi.fn(() => ({}))
    }
    const chartFactory = vi.fn(() => chart)
    const detailLoaderFactory = vi.fn(() => vi.fn())
    const container = document.createElement('div')

    const pagePromise = renderResultsPage(container, 'tvmaze:1', {
      bundleStream,
      chartFactory,
      detailLoaderFactory,
      compareProviders: ['tmdb']
    })

    await vi.waitFor(() =>
      expect(container.querySelector('.results-title')).not.toBeNull()
    )
    expect(container.querySelector('.results-title').textContent).toBe(
      'Example'
    )
    expect(container.querySelector('.show-plot').textContent).toBe(
      'Primary synopsis'
    )
    expect(container.querySelector('.chart-root').textContent).toContain(
      'Loading episode ratings'
    )
    expect(chartFactory).not.toHaveBeenCalled()

    resolvePrimary()
    const page = await pagePromise
    expect(chartFactory).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.results-progress').textContent).toBe(
      'Loading additional ratings…'
    )

    resolveSupplemental()
    await page.whenSettled
    expect(chart.updateSeasons).toHaveBeenCalledWith(
      supplementalBundle.seasons,
      { show: supplementalBundle.show }
    )
    const ratingRows = Array.from(
      container.querySelectorAll('.show-metrics .rating-badge')
    )
    expect(
      ratingRows.map(
        (row) => row.querySelector('.rating-badge-source').textContent
      )
    ).toEqual(['IMDb', 'TVmaze', 'TMDB'])
    expect(
      ratingRows.map(
        (row) => row.querySelector('.rating-badge-votes').textContent
      )
    ).toEqual(['1.1m votes', '', '8.3k votes'])
    expect(
      ratingRows.map((row) =>
        row.querySelector('.rating-badge-source').getAttribute('href')
      )
    ).toEqual([
      'https://www.imdb.com/title/tt123/',
      'https://www.tvmaze.com/shows/1',
      'https://www.themoviedb.org/tv/1438'
    ])
    expect(container.querySelector('.results-progress').hidden).toBe(true)
    expect(
      container.querySelector('.results-data').getAttribute('aria-busy')
    ).toBe('false')

    page.destroy()
    expect(chart.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps returned show metadata visible when primary episode loading fails', async () => {
    const bundleStream = async function* () {
      yield {
        phase: 'show',
        show: createBundle().show,
        pendingProviders: [],
        complete: false
      }
      throw new Error('Episode service unavailable')
    }
    const container = document.createElement('div')

    const page = await renderResultsPage(container, 'tvmaze:1', {
      bundleStream,
      compareProviders: []
    })

    expect(page.chart).toBeNull()
    expect(container.querySelector('.results-title').textContent).toBe(
      'Example'
    )
    expect(container.querySelector('.show-plot').textContent).toBe(
      'Primary synopsis'
    )
    expect(container.querySelector('.chart-root').textContent).toContain(
      'Episode service unavailable'
    )
    expect(
      container.querySelector('.results-data').getAttribute('aria-busy')
    ).toBe('false')
  })
})

function createBundle({ supplemental = false } = {}) {
  const ratings = [{ source: 'tvmaze', rating: 8, votes: null }]
  if (supplemental) {
    ratings.push(
      { source: 'tmdb', rating: 9, votes: 8300 },
      { source: 'omdb', rating: 8.8, votes: 1_100_000 }
    )
  }

  return {
    primarySource: 'tvmaze',
    show: {
      id: 'tvmaze:1',
      title: 'Example',
      year: '2020',
      plot: supplemental ? 'Supplemented synopsis' : 'Primary synopsis',
      poster: null,
      totalSeasons: 1,
      genres: ['Comedy'],
      ratings,
      externalIds: {
        imdb: 'tt123',
        tvmaze: 1,
        ...(supplemental ? { tmdb: 1438 } : {})
      }
    },
    seasons: [
      {
        number: 1,
        title: 'Season 1',
        episodes: [
          {
            id: 'tvmaze:episode:1',
            title: 'Pilot',
            season: 1,
            episode: 1,
            ratings,
            sourceIds: { tvmaze: '1' }
          }
        ]
      }
    ],
    alignment: [],
    alignmentIssues: [],
    mismatches: [],
    providerDiagnostics: supplemental
      ? [{ provider: 'tmdb', role: 'supplemental', status: 'loaded' }]
      : []
  }
}
