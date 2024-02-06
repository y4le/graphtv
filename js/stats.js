function linearRegression (data) {
  const n = data.length
  let sumX = 0; let sumY = 0; let sumXY = 0; let sumXX = 0

  // Assuming x values are the indices of the data points
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += data[i]
    sumXY += i * data[i]
    sumXX += i * i
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  const intercept = (sumY - slope * sumX) / n

  return { slope, intercept }
}

function offsetLinearRegression (data, startX, endX) {
  const { slope, intercept } = linearRegression(data)

  const x0 = 0
  const y0 = slope * x0 + intercept
  const xf = endX - startX
  const yf = slope * xf + intercept

  return [
    [startX, y0],
    [endX, yf]
  ]
}

export { offsetLinearRegression }
