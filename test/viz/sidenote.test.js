import { describe, expect, it, vi } from 'vitest'

import { createSidenote } from '../../src/viz/sidenote.js'

describe('createSidenote', () => {
  it('keeps circular navigator controls stable and routes both directions through one callback', () => {
    const root = document.createElement('section')
    const onInteract = vi.fn()
    const onNavigate = vi.fn()
    document.body.appendChild(root)
    const sidenote = createSidenote({ root, onInteract, onNavigate })
    const previous = root.querySelector('[data-sidenote-nav="previous"]')
    const next = root.querySelector('[data-sidenote-nav="next"]')

    expect(previous.classList).toContain('keycap')
    expect(previous.classList).toContain('shortcut-action')
    expect(next.classList).toContain('keycap')
    expect(next.classList).toContain('shortcut-action')

    sidenote.renderNavigator({
      mode: 'season',
      label: 'Season 2',
      meta: '3 rated episodes in Season 2',
      previousAvailable: true,
      nextAvailable: true,
      previousLabel: 'Previous season trendline',
      nextLabel: 'Next season trendline'
    })

    expect(previous.getAttribute('aria-disabled')).toBe('false')
    expect(root.querySelector('.sidenote-nav').getAttribute('aria-label')).toBe(
      'Season trend navigation'
    )
    expect(previous.getAttribute('aria-label')).toBe(
      'Previous season trendline'
    )
    expect(next.getAttribute('aria-label')).toBe('Next season trendline')
    previous.focus()
    previous.click()
    expect(document.activeElement).toBe(previous)
    expect(onInteract).toHaveBeenCalledTimes(1)
    expect(onNavigate).toHaveBeenLastCalledWith(-1)

    next.click()
    expect(onNavigate).toHaveBeenLastCalledWith(1)

    sidenote.renderNavigator({
      mode: 'point',
      label: 'S02E01',
      meta: '1 of 3 rated episodes',
      previousAvailable: true,
      nextAvailable: true
    })

    expect(root.querySelector('[data-sidenote-nav="previous"]')).toBe(previous)
    expect(root.querySelector('[data-sidenote-nav="next"]')).toBe(next)
    expect(document.activeElement).toBe(previous)
  })

  it('only suggests selecting a trendline when one is available', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ root })

    sidenote.renderRestingState()
    expect(root.textContent).toContain(
      'Browse the rated episodes with the arrow buttons.'
    )

    sidenote.renderRestingState({ trendlinesAvailable: true })
    expect(root.textContent).toContain(
      'Choose a trendline or browse the rated episodes.'
    )
  })

  it('removes delegated listeners when destroyed', () => {
    const root = document.createElement('section')
    const firstNavigate = vi.fn()
    const secondNavigate = vi.fn()
    const firstSidenote = createSidenote({ root, onNavigate: firstNavigate })

    firstSidenote.destroy()
    const secondSidenote = createSidenote({
      root,
      onNavigate: secondNavigate
    })
    secondSidenote.renderNavigator({
      mode: 'point',
      label: 'S01E01',
      meta: '1 of 2 rated episodes',
      previousAvailable: false,
      nextAvailable: true
    })
    root.querySelector('[data-sidenote-nav="next"]').click()

    expect(firstNavigate).not.toHaveBeenCalled()
    expect(secondNavigate).toHaveBeenCalledOnce()
  })

  it('orders ratings by plotting preference and emphasizes the plotted source', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ root })

    sidenote.renderPoint(
      {
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
        ],
        sourceIds: {
          omdb: 'tt0739785',
          tvmaze: '1002',
          tmdb: '66453'
        }
      },
      { show: { externalIds: { tmdb: 1438 } } }
    )

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
    ).toEqual(['A Great Episode', '2026-08-11'])
    expect(
      Array.from(ratings.querySelectorAll('.sidenote-rating-source')).map(
        (source) => source.getAttribute('href')
      )
    ).toEqual([
      'https://www.imdb.com/title/tt0739785/',
      'https://www.tvmaze.com/episodes/1002',
      'https://www.themoviedb.org/tv/1438/season/1/episode/2'
    ])
  })

  it('does not present a TMDB rating below the vote minimum as usable', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ root })

    sidenote.renderPoint({
      title: 'Low-vote episode',
      season: 4,
      episode: 4,
      rating: null,
      ratingSource: null,
      ratings: [{ source: 'tmdb', rating: 1, votes: 2 }]
    })

    expect(root.querySelector('.sidenote-ratings').textContent).toBe(
      'TMDB n/a (2 votes)'
    )
  })

  it('shows a vote-count placeholder while IMDb details load', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ root })

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
    document.body.appendChild(root)
    const sidenote = createSidenote({
      root,
      onSelectPoint
    })

    sidenote.renderTrendSummary({
      label: 'Season 2',
      kind: 'season',
      n: 6,
      totalEpisodes: 7,
      excludedFallback: 1,
      source: 'omdb',
      mean: 8.24,
      seriesMeanDifference: 0.34,
      ratingStandardDeviation: 0.44,
      residualMeanAbsoluteError: 0.24,
      deltaStandardError: 0.14,
      rSquared: 0.76,
      direction: 'up',
      delta: 0.62,
      trendCriteria: createTrendCriteria({ signalRatio: Infinity }),
      top: [
        {
          value: 9.4,
          point: {
            id: 'high',
            title: 'The Best Episode',
            season: 2,
            episode: 5
          }
        },
        {
          value: 9.1,
          point: { id: 'second-high', season: 2, episode: 4 }
        },
        {
          value: 8.8,
          point: { id: 'third-high', season: 2, episode: 3 }
        }
      ],
      bottom: [
        {
          value: 7.2,
          point: { id: 'low', season: 2, episode: 1 }
        },
        {
          value: 7.5,
          point: { id: 'second-low', season: 2, episode: 2 }
        },
        {
          value: 8.1,
          point: { id: 'third-low', season: 2, episode: 6 }
        }
      ]
    })

    expect(root.querySelector('.sidenote-header')).toBeNull()
    expect(root.querySelector('.sidenote-title')).toBeNull()
    expect(root.querySelector('.sidenote-kicker')).toBeNull()
    expect(root.textContent).toContain('Mean')
    expect(root.textContent).toContain('8.2')
    expect(root.textContent).toContain('+0.3 vs series')
    expect(root.textContent).toContain('Spread')
    expect(root.textContent).toContain('0.4 points')
    expect(root.textContent).toContain('Trending up +0.6')
    const trendStatistics = root.querySelector('.trend-info-statistics')
    expect(trendStatistics.textContent).toContain('Typical deviation')
    expect(trendStatistics.textContent).toContain(
      '0.2 points from the trendline'
    )
    expect(trendStatistics.textContent).toContain('Change uncertainty')
    expect(trendStatistics.textContent).toContain(
      '±0.3 points (about two standard errors)'
    )
    expect(trendStatistics.textContent).toContain('Trend fit')
    expect(trendStatistics.textContent).toContain('76% of rating variation')
    expect(root.textContent).toContain('6 of 7 rated · IMDb')
    expect(root.textContent).toContain(
      '1 episode uses other sources and is excluded'
    )
    expect(
      Array.from(root.querySelectorAll('.trend-summary-ranking-title')).map(
        (heading) => heading.textContent
      )
    ).toEqual(['Top Rated', 'Bottom Rated'])
    expect(root.querySelectorAll('.trend-summary-ranking')).toHaveLength(2)
    expect(root.querySelectorAll('.trend-summary-extreme')).toHaveLength(6)
    expect(root.querySelector('.trend-summary-episode-title').textContent).toBe(
      'The Best Episode'
    )

    root.querySelector('[data-trend-point-id="high"]').click()
    expect(onSelectPoint).toHaveBeenCalledWith('high')

    const infoButton = root.querySelector('[data-trend-info]')
    const tooltip = root.querySelector('.trend-info-tooltip')
    expect(infoButton.textContent).toBe('ⓘ')
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(infoButton.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(tooltip.id).toMatch(/^trend-info-tooltip-\d+$/)
    expect(tooltip.hidden).toBe(true)
    infoButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(infoButton.getAttribute('aria-expanded')).toBe('true')
    expect(tooltip.hidden).toBe(false)

    const onDocumentKeydown = vi.fn()
    document.addEventListener('keydown', onDocumentKeydown)
    root.querySelector('[data-trend-point-id="high"]').focus()
    root
      .querySelector('[data-trend-point-id="high"]')
      .dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      )
    expect(onDocumentKeydown).toHaveBeenCalledTimes(1)
    expect(tooltip.hidden).toBe(false)
    document.removeEventListener('keydown', onDocumentKeydown)

    infoButton.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)

    infoButton.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    infoButton.focus()
    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('true')
    expect(tooltip.hidden).toBe(false)
    infoButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)
    const onDismissedKeydown = vi.fn()
    document.addEventListener('keydown', onDismissedKeydown)
    infoButton.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    expect(onDismissedKeydown).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', onDismissedKeydown)
    root.querySelector('[data-trend-point-id="high"]').focus()
    expect(tooltip.hidden).toBe(true)
    infoButton.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    infoButton.focus()
    infoButton.click()
    expect(root.querySelectorAll('[data-passed="true"]')).toHaveLength(3)
    expect(root.querySelector('.trend-info-check-mark').textContent).toBe('✓')
    expect(root.textContent).toContain('Consistent slope: ∞×, need 2.0×')
    tooltip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(tooltip.hidden).toBe(false)
    const outsideButton = document.createElement('button')
    outsideButton.addEventListener('click', (event) => event.stopPropagation())
    document.body.appendChild(outsideButton)
    outsideButton.click()
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)
    infoButton.click()
    expect(tooltip.hidden).toBe(false)
    infoButton.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
    )
    expect(infoButton.getAttribute('aria-expanded')).toBe('false')
    expect(tooltip.hidden).toBe(true)
    expect(document.activeElement).toBe(infoButton)
    outsideButton.remove()
  })

  it('places full-series plotting context beside the rated episode count', () => {
    const root = document.createElement('section')
    const onSelectSeasonTrend = vi.fn()
    const sidenote = createSidenote({ root, onSelectSeasonTrend })

    sidenote.renderTrendSummary(
      {
        label: 'Full series',
        kind: 'series',
        n: 13,
        totalEpisodes: 19,
        excludedFallback: 6,
        source: 'omdb',
        plottingContext: {
          source: 'omdb',
          spreadSources: ['tvmaze', 'tmdb']
        },
        mean: 8.2,
        ratingStandardDeviation: 0.61,
        betweenSeasonVariationShare: 0.62,
        seasonExtremes: {
          best: { mean: 8.7, seasonNumbers: [3], ratedEpisodes: 8 },
          worst: { mean: 7.4, seasonNumbers: [5, 6] }
        },
        direction: 'up',
        delta: 0.4,
        trendCriteria: createTrendCriteria(),
        top: [],
        bottom: []
      },
      {
        show: {
          externalIds: { imdb: 'tt0306414', tvmaze: 179, tmdb: 1438 }
        }
      }
    )

    expect(root.querySelector('.trend-summary-provenance').textContent).toBe(
      'Plotting IMDb · source spread shows TVmaze and TMDB · 13 of 19 rated, 6 episodes use other sources and are excluded'
    )
    expect(root.textContent).toContain('0.6 points · within seasons')
    const seasonRankings = root.querySelector('.trend-summary-season-rankings')
    expect(seasonRankings).not.toBeNull()
    expect(
      seasonRankings.querySelectorAll('.trend-summary-ranking')
    ).toHaveLength(2)
    expect(
      Array.from(
        seasonRankings.querySelectorAll('.trend-summary-ranking'),
        (extreme) => extreme.textContent.replace(/\s+/g, ' ').trim()
      )
    ).toEqual([
      'Best Season Season 3 · 8.7 · 8 rated',
      'Worst Season Season 5 and Season 6 · 7.4'
    ])
    const seasonButtons = Array.from(
      seasonRankings.querySelectorAll('[data-trend-season-number]')
    )
    expect(
      seasonButtons.map((button) => button.getAttribute('aria-label'))
    ).toEqual([
      'Select Season 3 trendline',
      'Select Season 5 trendline',
      'Select Season 6 trendline'
    ])
    seasonButtons[0].click()
    seasonButtons[1].click()
    expect(onSelectSeasonTrend.mock.calls).toEqual([[3], [5]])
    expect(root.querySelector('.trend-info-statistics').textContent).toContain(
      '62% of series variation'
    )
    expect(
      Array.from(
        root.querySelectorAll('.trend-summary-provenance .rating-source-link')
      ).map((source) => source.getAttribute('href'))
    ).toEqual([
      'https://www.imdb.com/title/tt0306414/',
      'https://www.tvmaze.com/shows/179',
      'https://www.themoviedb.org/tv/1438'
    ])
  })

  it('reports the measured delta when the trend direction is unclear', () => {
    const root = document.createElement('section')
    const sidenote = createSidenote({ root })

    sidenote.renderTrendSummary({
      label: 'Full series',
      n: 4,
      totalEpisodes: 4,
      excludedFallback: 0,
      source: 'tmdb',
      mean: 7.5,
      direction: 'unclear',
      delta: 1.2,
      trendCriteria: createTrendCriteria({
        ratedEpisodes: 4,
        enoughRatedEpisodes: false,
        signalRatio: 1.96,
        consistentSlope: false,
        absoluteDelta: 0.098,
        meaningfulDelta: false
      }),
      top: [
        {
          value: 8,
          point: { id: 'high', season: 1, episode: 4 }
        }
      ],
      bottom: [
        {
          value: 7,
          point: { id: 'low', season: 1, episode: 1 }
        }
      ]
    })

    expect(root.textContent).toContain('No clear trend +1.2')
    expect(root.textContent).toContain('too few rated episodes for a trend')

    root.querySelector('[data-trend-info]').click()
    expect(root.querySelectorAll('[data-passed="false"]')).toHaveLength(3)
    expect(root.textContent).toContain('Enough data: 4 rated, need 5')
    expect(root.textContent).toContain('Consistent slope: 1.96×, need 2.0×')
    expect(root.textContent).toContain(
      'Meaningful change: 0.098 points, need 0.1 points'
    )
  })

  it('offers and renders a selected high-confidence series breakpoint', () => {
    const root = document.createElement('section')
    const onSelectSeriesBreakpoint = vi.fn()
    const onSelectPoint = vi.fn()
    const sidenote = createSidenote({
      root,
      onSelectPoint,
      onSelectSeriesBreakpoint
    })

    sidenote.renderTrendSummary({
      label: 'Full series',
      kind: 'series',
      n: 32,
      totalEpisodes: 32,
      excludedFallback: 0,
      source: 'test',
      mean: 7.6,
      direction: 'unclear',
      delta: -0.5,
      detectedBreakpoint: { id: 'series:breakpoint' },
      trendCriteria: createTrendCriteria(),
      top: [],
      bottom: []
    })

    expect(root.textContent).toContain('No clear trend −0.5')
    const breakpointButton = root.querySelector('[data-series-breakpoint]')
    expect(breakpointButton.textContent).toBe('🦈 shark jump detected')
    breakpointButton.click()
    expect(onSelectSeriesBreakpoint).toHaveBeenCalledOnce()

    sidenote.renderTrendSummary({
      kind: 'breakpoint',
      breakpointPoint: { id: 'breakpoint-start', season: 3, number: 1 },
      drop: 2.4,
      confidence: 'high',
      score: 95,
      separation: 0.96,
      sustain: 0.94,
      pValue: 0.003,
      beforeMedian: 8.8,
      afterMedian: 6.4,
      beforeSummary: {
        source: 'test',
        n: 16,
        direction: 'unclear',
        delta: -0.1
      },
      afterSummary: {
        source: 'test',
        n: 16,
        direction: 'down',
        delta: -0.6
      }
    })

    expect(root.querySelector('[data-breakpoint-summary]')).not.toBeNull()
    expect(root.textContent).toContain('Starting S03E01')
    expect(root.textContent).toContain('Ratings dropped 2.4 points')
    expect(root.textContent).toContain('High confidence 95/100')
    expect(root.querySelectorAll('.breakpoint-summary-facts li')).toHaveLength(
      3
    )
    expect(root.querySelector('.breakpoint-summary-metrics')).toBeNull()
    expect(root.textContent).toContain('8.8 median · No clear trend −0.1')
    expect(root.textContent).toContain('6.4 median · Trending down −0.6')
    expect(root.textContent).toContain('permutation p < 0.01')

    root.querySelector('[data-breakpoint-episode]').click()
    expect(onSelectPoint).toHaveBeenCalledWith('breakpoint-start')
  })
})

function createTrendCriteria(overrides = {}) {
  return {
    ratedEpisodes: 5,
    minimumRatedEpisodes: 5,
    enoughRatedEpisodes: true,
    signalRatio: 3,
    minimumSignalRatio: 2,
    consistentSlope: true,
    absoluteDelta: 0.6,
    minimumDelta: 0.1,
    meaningfulDelta: true,
    ...overrides
  }
}
