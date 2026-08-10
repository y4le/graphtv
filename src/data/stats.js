export function linearRegression(values) {
  const points = values.map((value, index) => ({ x: index, y: value }))
  return linearRegressionFromPoints(points)
}

export function linearRegressionFromPoints(values) {
  const points = values.filter(
    (point) => typeof point?.x === 'number' && Number.isFinite(point.x) && typeof point?.y === 'number'
  )

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

export function trendlineFromPoints(values) {
  const points = values.filter(
    (point) => typeof point?.x === 'number' && Number.isFinite(point.x) && typeof point?.y === 'number'
  )
  const regression = linearRegressionFromPoints(points)

  if (!regression || points.length === 0) {
    return null
  }

  const startX = points[0].x
  const endX = points[points.length - 1].x

  return [
    { x: startX, y: regression.slope * startX + regression.intercept },
    { x: endX, y: regression.slope * endX + regression.intercept }
  ]
}

export function isUsableRating(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10
}

export function getAverageRating(ratings = []) {
  const numericRatings = ratings
    .map((rating) => rating.rating)
    .filter(isUsableRating)

  if (numericRatings.length === 0) {
    return null
  }

  const total = numericRatings.reduce((sum, rating) => sum + rating, 0)
  return total / numericRatings.length
}
