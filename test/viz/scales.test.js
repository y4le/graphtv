import { describe, expect, it } from 'vitest'

import {
  buildChartModel,
  createFullSeriesScales,
  createMainScales,
  createSparklineScales
} from '../../src/viz/scales.js'

describe('rating scale domains', () => {
  it('excludes missing and zero ratings from averages and the y-axis domain', () => {
    const model = createModel()
    const scales = createMainScales(model, { start: 1, end: 4 }, { width: 600, height: 400 })

    expect(model.points.map((point) => point.rating)).toEqual([null, null, 8.2, 8.6])
    expect(model.ratedPoints.map((point) => point.id)).toEqual(['rated', 'also-rated'])
    expect(scales.yDomain[0]).toBeGreaterThan(0)
    expect(scales.yDomain).toEqual([8.02, 8.78])
  })

  it('uses an absolute 0–10 domain for every chart scale when requested', () => {
    const model = createModel()
    const dimensions = { width: 600, height: 400 }
    const options = { absoluteYAxis: true }

    expect(createMainScales(model, { start: 1, end: 4 }, dimensions, options).yDomain).toEqual([
      0, 10
    ])
    expect(createFullSeriesScales(model, dimensions, options).yDomain).toEqual([0, 10])
    expect(createSparklineScales(model, dimensions, options).yDomain).toEqual([0, 10])
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
    ratings
  }
}
