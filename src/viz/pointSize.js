const DENSE_POINT_SLOT_WIDTH = 24
const SPARSE_POINT_SLOT_WIDTH = 96
const MAX_SPARSE_POINT_SCALE = 2
const MAX_SPARSE_LINE_SCALE = 1.25

export function scalePointRadiusForDensity(baseRadius, pointCount, xScale) {
  return scaleForDensity(baseRadius, pointCount, xScale, MAX_SPARSE_POINT_SCALE)
}

export function scaleLineWidthForDensity(baseWidth, pointCount, xScale) {
  return scaleForDensity(baseWidth, pointCount, xScale, MAX_SPARSE_LINE_SCALE)
}

function scaleForDensity(baseSize, pointCount, xScale, maxSparseScale) {
  const [rangeStart, rangeEnd] = xScale.range()
  const availableWidth = Math.abs(rangeEnd - rangeStart)
  const slotWidth = availableWidth / Math.max(pointCount, 1)
  const sparseRatio = clamp(
    (slotWidth - DENSE_POINT_SLOT_WIDTH) /
      (SPARSE_POINT_SLOT_WIDTH - DENSE_POINT_SLOT_WIDTH),
    0,
    1
  )
  const scale = 1 + sparseRatio * (maxSparseScale - 1)

  return Math.round(baseSize * scale * 100) / 100
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
