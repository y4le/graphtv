function linearRegression (data) {
  const n = data.length
  let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0

  for (let i = 0; i < n; i++) {
    sumX += data[i][0]
    sumY += data[i][1]
    sumXY += data[i][0] * data[i][1]
    sumXX += data[i][0] * data[i][0]
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

export { linearRegression }
