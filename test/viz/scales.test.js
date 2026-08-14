import { describe, expect, it } from 'vitest'

import {
  buildChartModel,
  clampViewport,
  createDefaultViewport,
  createFullSeriesScales,
  createMainScales,
  createSparklineScales,
  getMacroTrendline,
  getVisiblePoints,
  getVisibleSeriesBreakpoint
} from '../../src/viz/scales.js'

describe('rating scale domains', () => {
  it('excludes TMDB episode ratings below five votes', () => {
    const model = buildChartModel([
      {
        number: 4,
        episodes: [
          createEpisode('low-vote', [
            { source: 'tmdb', rating: 1, votes: 2 }
          ]),
          createEpisode('eligible', [
            { source: 'tmdb', rating: 8, votes: 5 }
          ])
        ]
      }
    ])

    expect(model.points.map((point) => point.rating)).toEqual([null, 8])
    expect(model.ratedPoints.map((point) => point.id)).toEqual(['eligible'])
  })

  it('tracks nonempty season spans for the bottom season axis', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: [
          createEpisode('one', [{ source: 'test', rating: 7 }]),
          createEpisode('two', [{ source: 'test', rating: 7.1 }])
        ]
      },
      { number: 2, episodes: [] },
      {
        number: 3,
        episodes: [
          createEpisode('three', [{ source: 'test', rating: 7.2 }])
        ]
      }
    ])

    expect(model.seasonSpans).toEqual([
      {
        seasonNumber: 1,
        seasonIndex: 0,
        start: 1,
        end: 2,
        midpoint: 1.5
      },
      {
        seasonNumber: 3,
        seasonIndex: 2,
        start: 3,
        end: 3,
        midpoint: 3
      }
    ])
  })

  it('excludes missing and zero ratings from primary selection and the y-axis domain', () => {
    const model = createModel()
    const scales = createMainScales(
      model,
      { start: 1, end: 4 },
      { width: 600, height: 400 }
    )

    expect(model.points.map((point) => point.rating)).toEqual([
      null,
      null,
      8.2,
      8.6
    ])
    expect(model.ratedPoints.map((point) => point.id)).toEqual([
      'rated',
      'also-rated'
    ])
    expect(scales.yDomain[0]).toBeGreaterThan(0)
    expect(scales.yDomain).toEqual([8.02, 8.78])
  })

  it('uses a show-wide preferred source and marks per-episode fallbacks', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: Array.from({ length: 5 }, (_, index) =>
          createEpisode(`episode-${index}`, [
            { source: 'tmdb', rating: 7 + index / 10 },
            ...(index < 3 ? [{ source: 'omdb', rating: 9 + index / 10 }] : [])
          ])
        )
      }
    ])

    expect(model.primaryRatingSource).toBe('omdb')
    expect(model.points.map((point) => point.rating)).toEqual([
      9, 9.1, 9.2, 7.3, 7.4
    ])
    expect(model.points.map((point) => point.isFallbackRating)).toEqual([
      false,
      false,
      false,
      true,
      true
    ])
    expect(model.primaryRatedPoints).toHaveLength(3)
    expect(model.seasonTrendlines).toHaveLength(1)
    expect(model.trendSummaries['season:1']).toMatchObject({
      label: 'Season 1',
      n: 3,
      totalEpisodes: 5,
      excludedFallback: 2,
      source: 'omdb'
    })
    expect(model.trendSummaries.series).toMatchObject({
      label: 'Full series',
      n: 3,
      totalEpisodes: 5
    })
  })

  it('does not let fallback values influence trendline regression', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: [
          createEpisode('one', [{ source: 'omdb', rating: 7 }]),
          createEpisode('two', [{ source: 'omdb', rating: 8 }]),
          createEpisode('three', [{ source: 'omdb', rating: 9 }]),
          createEpisode('fallback', [{ source: 'tmdb', rating: 1 }])
        ]
      }
    ])

    expect(model.macroRegression).toEqual({ slope: 1, intercept: 6 })
    expect(model.seasonTrendlines[0].endX).toBe(3)
  })

  it('clips the full-series trendline to its primary-rated extent', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: [
          createEpisode('fallback-start', [{ source: 'tmdb', rating: 5 }]),
          createEpisode('one', [{ source: 'omdb', rating: 7 }]),
          createEpisode('two', [{ source: 'omdb', rating: 8 }]),
          createEpisode('three', [{ source: 'omdb', rating: 9 }]),
          createEpisode('fallback-end', [{ source: 'tmdb', rating: 5 }])
        ]
      }
    ])

    expect(getMacroTrendline(model, { start: 1, end: 5 })).toMatchObject({
      id: 'series',
      visibleStartX: 2,
      visibleEndX: 4,
      points: [
        { x: 2, y: 7 },
        { x: 4, y: 9 }
      ]
    })
  })

  it('adds comparable season context to trend summaries', () => {
    const model = buildChartModel(
      [
        { number: 1, ratings: [7, 7, 9] },
        { number: 2, ratings: [8, 8, 10] }
      ].map((season) => ({
        number: season.number,
        episodes: season.ratings.map((rating, index) => ({
          ...createEpisode(`s${season.number}e${index + 1}`, [
            { source: 'tmdb', rating }
          ]),
          season: season.number,
          episode: index + 1
        }))
      }))
    )

    expect(model.trendSummaries['season:1'].seriesMeanDifference).toBeCloseTo(
      -0.5
    )
    expect(model.trendSummaries['season:2'].seriesMeanDifference).toBeCloseTo(
      0.5
    )
    expect(model.trendSummaries.series.ratingStandardDeviation).toBeCloseTo(
      Math.sqrt(8 / 9)
    )
    expect(model.trendSummaries.series.betweenSeasonVariationShare).toBeCloseTo(
      9 / 41
    )
    expect(model.trendSummaries.series.seasonExtremes).toEqual({
      best: { mean: 26 / 3, seasonNumbers: [2], ratedEpisodes: 3 },
      worst: { mean: 23 / 3, seasonNumbers: [1], ratedEpisodes: 3 }
    })
  })

  it('builds a high-confidence breakpoint overlay without making it persistent', () => {
    const model = buildChartModel(createBreakpointSeasons())

    expect(model.seriesBreakpoint).toMatchObject({
      id: 'series:breakpoint',
      highConfidence: true,
      breakpointX: 16.5,
      breakpointPoint: { season: 3, number: 1 }
    })
    expect(model.trendSummaries.series.detectedBreakpoint.id).toBe(
      'series:breakpoint'
    )
    expect(
      getVisibleSeriesBreakpoint(model, { start: 10, end: 24 })
    ).toMatchObject({
      markerVisible: true,
      segments: [
        { id: 'series:breakpoint:before' },
        { id: 'series:breakpoint:after' }
      ]
    })
    expect(
      getVisibleSeriesBreakpoint(model, { start: 1, end: 8 })
    ).toMatchObject({
      markerVisible: false,
      segments: [{ id: 'series:breakpoint:before' }]
    })
  })

  it('keeps the adaptive y-axis stable across viewports', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: [6, 6.5, 8, 8.5].map((rating, index) =>
          createEpisode(`episode-${index}`, [{ source: 'tmdb', rating }])
        )
      }
    ])
    const dimensions = { width: 600, height: 400 }
    const earlyScales = createMainScales(
      model,
      { start: 1, end: 2 },
      dimensions
    )
    const lateScales = createMainScales(model, { start: 3, end: 4 }, dimensions)

    expect(earlyScales.yDomain).toEqual([5.625, 8.875])
    expect(lateScales.yDomain).toEqual(earlyScales.yDomain)
  })

  it('includes show-wide source-spread endpoints when the spread is enabled', () => {
    const model = buildChartModel([
      {
        number: 1,
        episodes: [
          createEpisode('one', [
            { source: 'omdb', rating: 8.1 },
            { source: 'tmdb', rating: 1 }
          ]),
          createEpisode('two', [
            { source: 'omdb', rating: 8.3 },
            { source: 'tmdb', rating: 10 }
          ]),
          createEpisode('three', [
            { source: 'omdb', rating: 8.5 },
            { source: 'tmdb', rating: 5 }
          ])
        ]
      }
    ])
    const primaryOnlyScales = createMainScales(
      model,
      { start: 1, end: 1 },
      { width: 600, height: 400 },
      { showSourceSpread: false }
    )
    const spreadScales = createMainScales(
      model,
      { start: 1, end: 1 },
      { width: 600, height: 400 },
      { showSourceSpread: true }
    )

    expect(primaryOnlyScales.yDomain[0]).toBeGreaterThan(7)
    expect(primaryOnlyScales.yDomain[1]).toBeLessThan(9)
    expect(spreadScales.yDomain).toEqual([0, 10])
  })

  it('uses an absolute 0–10 domain for every chart scale when requested', () => {
    const model = createModel()
    const dimensions = { width: 600, height: 400 }
    const options = { absoluteYAxis: true }

    expect(
      createMainScales(model, { start: 1, end: 4 }, dimensions, options).yDomain
    ).toEqual([0, 10])
    expect(createFullSeriesScales(model, dimensions, options).yDomain).toEqual([
      0, 10
    ])
    expect(createSparklineScales(model, dimensions, options).yDomain).toEqual([
      0, 10
    ])
  })
})

describe('viewport clamping', () => {
  it('uses available laptop width for long-running shows', () => {
    const model = { xMax: 331 }

    expect(createDefaultViewport(model, 1200, false)).toEqual({
      start: 1,
      end: 60
    })
    expect(createDefaultViewport(model, 1800, false)).toEqual({
      start: 1,
      end: 72
    })
  })

  it('maps episode-density choices to distinct default windows', () => {
    const model = { xMax: 331 }

    expect(createDefaultViewport(model, 1200, false, 'roomy')).toEqual({
      start: 1,
      end: 40
    })
    expect(createDefaultViewport(model, 1200, false, 'balanced')).toEqual({
      start: 1,
      end: 60
    })
    expect(createDefaultViewport(model, 1200, false, 'dense')).toEqual({
      start: 1,
      end: 100
    })
    expect(createDefaultViewport(model, 1200, false, 'all')).toEqual({
      start: 1,
      end: 331
    })

    expect(
      createDefaultViewport({ xMax: 30 }, 600, false, 'roomy')
    ).toEqual({ start: 1, end: 20 })
    expect(
      createDefaultViewport({ xMax: 30 }, 600, false, 'balanced')
    ).toEqual({ start: 1, end: 30 })
  })

  it('retains the compact default window on mobile', () => {
    expect(createDefaultViewport({ xMax: 331 }, 600, true)).toEqual({
      start: 1,
      end: 18
    })
  })

  it('absorbs a small trailing remainder when spacing remains comfortable', () => {
    expect(
      createDefaultViewport({ xMax: 62 }, 1200, false, 'balanced')
    ).toEqual({ start: 1, end: 62 })
    expect(
      createDefaultViewport({ xMax: 64 }, 1200, false, 'balanced')
    ).toEqual({ start: 1, end: 60 })
    expect(
      createDefaultViewport({ xMax: 15 }, 240, false, 'roomy')
    ).toEqual({ start: 1, end: 12 })
  })

  it('extends a nearby default edge through the end of a season', () => {
    const model = {
      xMax: 100,
      seasonSpans: [
        { start: 1, end: 31 },
        { start: 32, end: 62 },
        { start: 63, end: 100 }
      ]
    }

    expect(createDefaultViewport(model, 1200, false, 'balanced')).toEqual({
      start: 1,
      end: 62
    })

    expect(
      createDefaultViewport(
        {
          xMax: 64,
          seasonSpans: [
            { start: 1, end: 31 },
            { start: 32, end: 62 },
            { start: 63, end: 64 }
          ]
        },
        1200,
        false,
        'balanced'
      )
    ).toEqual({ start: 1, end: 60 })
  })

  it('preserves fractional movement while keeping the viewport in bounds', () => {
    const model = { xMax: 72 }

    expect(clampViewport({ start: 1.25, end: 18.25 }, model)).toEqual({
      start: 1.25,
      end: 18.25
    })
    expect(clampViewport({ start: 70.5, end: 87.5 }, model)).toEqual({
      start: 55,
      end: 72
    })
  })

  it('keeps fractional viewport-edge points mounted until they move out', () => {
    const model = {
      points: Array.from({ length: 5 }, (_, index) => ({ x: index + 1 }))
    }

    expect(
      getVisiblePoints(model, { start: 1.25, end: 3.25 }).map(
        (point) => point.x
      )
    ).toEqual([1, 2, 3, 4])
    expect(
      getVisiblePoints(model, { start: 2, end: 4 }).map((point) => point.x)
    ).toEqual([2, 3, 4])
  })
})

function createModel() {
  return buildChartModel([
    {
      number: 1,
      episodes: [
        createEpisode('missing', [{ source: 'tmdb', rating: null }]),
        createEpisode('zero', [{ source: 'tmdb', rating: 0 }]),
        createEpisode('rated', [
          { source: 'tvmaze', rating: 8.2 },
          { source: 'tmdb', rating: 0 }
        ]),
        createEpisode('also-rated', [{ source: 'omdb', rating: 8.6 }])
      ]
    }
  ])
}

function createEpisode(id, ratings) {
  return {
    id,
    title: id,
    season: 1,
    episode: 1,
    ratings: ratings.map((rating) =>
      rating.source === 'tmdb' && rating.votes === undefined
        ? { ...rating, votes: 5 }
        : rating
    )
  }
}

function createBreakpointSeasons() {
  return Array.from({ length: 4 }, (_, seasonIndex) => ({
    number: seasonIndex + 1,
    episodes: Array.from({ length: 8 }, (_, episodeIndex) => {
      const index = seasonIndex * 8 + episodeIndex
      const rating = (index < 16 ? 8.8 : 6.4) + [0, 0.1, -0.1, 0.05][index % 4]
      return {
        ...createEpisode(`episode-${index + 1}`, [{ source: 'test', rating }]),
        season: seasonIndex + 1,
        number: episodeIndex + 1
      }
    })
  }))
}
