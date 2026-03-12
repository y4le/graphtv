export function linearRegression(values) {
  const points = values
    .map((value, index) => ({ x: index, y: value }))
    .filter((point) => typeof point.y === 'number')

  if (points.length === 0) {
    return null
  }

  if (points.length === 1) {
    return {
      slope: 0,
      intercept: points[0].y
    }
  }

  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0

  for (const point of points) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumXX += point.x * point.x
  }

  const denominator = points.length * sumXX - sumX * sumX

  if (denominator === 0) {
    return {
      slope: 0,
      intercept: points[0].y
    }
  }

  const slope = (points.length * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / points.length

  return { slope, intercept }
}

export function trendline(values, startX) {
  const regression = linearRegression(values)

  if (!regression) {
    return null
  }

  const validCount = values.filter((value) => typeof value === 'number').length

  if (validCount === 0) {
    return null
  }

  const endX = startX + validCount - 1
  const startY = regression.intercept
  const endY = regression.slope * (validCount - 1) + regression.intercept

  return [
    { x: startX, y: startY },
    { x: endX, y: endY }
  ]
}

export function getAverageRating(ratings = []) {
  const numericRatings = ratings
    .map((rating) => rating.rating)
    .filter((rating) => typeof rating === 'number')

  if (numericRatings.length === 0) {
    return null
  }

  const total = numericRatings.reduce((sum, rating) => sum + rating, 0)
  return total / numericRatings.length
}
