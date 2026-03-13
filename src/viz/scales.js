import { scaleLinear } from 'd3'

import { getAverageRating, trendline } from '../data/stats.js'

export function buildChartModel(seasons) {
  const points = []
  const seasonSpans = []
  const trendlines = []
  let cursor = 1

  seasons.forEach((season, seasonIndex) => {
    const start = cursor
    const ratings = []

    season.episodes.forEach((episode) => {
      const averageRating = getAverageRating(episode.ratings)
      points.push({
        ...episode,
        x: cursor,
        rating: averageRating,
        seasonIndex
      })
      ratings.push(averageRating)
      cursor += 1
    })

    const end = cursor - 1
    seasonSpans.push({
      seasonNumber: season.number,
      start,
      end
    })

    const line = trendline(ratings, start)
    if (line) {
      trendlines.push({
        seasonNumber: season.number,
        seasonIndex,
        points: line
      })
    }
  })

  return {
    points,
    seasonSpans,
    trendlines,
    xMax: Math.max(cursor - 1, 1)
  }
}

export function createScales(model, dimensions) {
  const xScale = scaleLinear()
    .domain([1, model.xMax])
    .range([dimensions.padding.left, dimensions.width - dimensions.padding.right])

  const numericRatings = model.points
    .map((point) => point.rating)
    .filter((rating) => typeof rating === 'number')

  const minRating = numericRatings.length ? Math.max(0, Math.min(...numericRatings) - 0.4) : 0
  const maxRating = numericRatings.length ? Math.min(10, Math.max(...numericRatings) + 0.4) : 10

  const yScale = scaleLinear()
    .domain([minRating, maxRating])
    .nice()
    .range([dimensions.height - dimensions.padding.bottom, dimensions.padding.top])

  return { xScale, yScale }
}
