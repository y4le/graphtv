const DENSE_POINT_SLOT_WIDTH = 24
const SPARSE_POINT_SLOT_WIDTH = 96
const MAX_SPARSE_POINT_SCALE = 5 / 3

export function scalePointRadiusForDensity(baseRadius, pointCount, xScale) {
  const [rangeStart, rangeEnd] = xScale.range()
  const availableWidth = Math.abs(rangeEnd - rangeStart)
  const slotWidth = availableWidth / Math.max(pointCount, 1)
  const sparseRatio = clamp(
    (slotWidth - DENSE_POINT_SLOT_WIDTH) /
      (SPARSE_POINT_SLOT_WIDTH - DENSE_POINT_SLOT_WIDTH),
    0,
    1
  )
  const scale = 1 + sparseRatio * (MAX_SPARSE_POINT_SCALE - 1)

  return Math.round(baseRadius * scale * 100) / 100
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
