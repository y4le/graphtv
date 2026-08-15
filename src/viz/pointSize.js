// The ramp controls where density scaling starts and reaches its maximum.
// Each curve exponent controls how quickly it grows within that ramp:
// 1 is linear, below 1 grows earlier, and above 1 grows later.
export const MARK_DENSITY_CONFIG = Object.freeze({
  ramp: Object.freeze({
    denseSlotWidth: 24,
    sparseSlotWidth: 96
  }),
  pointRadius: Object.freeze({
    minScale: 1,
    maxScale: 1.8,
    curveExponent: 0.5
  }),
  lineWidth: Object.freeze({
    minScale: 1,
    maxScale: 1.35,
    curveExponent: 1
  })
})

export function scalePointRadiusForDensity(baseRadius, pointCount, xScale) {
  return scaleForDensity(
    baseRadius,
    pointCount,
    xScale,
    MARK_DENSITY_CONFIG.pointRadius
  )
}

export function scaleLineWidthForDensity(baseWidth, pointCount, xScale) {
  return scaleForDensity(
    baseWidth,
    pointCount,
    xScale,
    MARK_DENSITY_CONFIG.lineWidth
  )
}

function scaleForDensity(baseSize, pointCount, xScale, sizeConfig) {
  const [rangeStart, rangeEnd] = xScale.range()
  const availableWidth = Math.abs(rangeEnd - rangeStart)
  const slotWidth = availableWidth / Math.max(pointCount, 1)
  const { denseSlotWidth, sparseSlotWidth } = MARK_DENSITY_CONFIG.ramp
  const rampRatio = clamp(
    (slotWidth - denseSlotWidth) / (sparseSlotWidth - denseSlotWidth),
    0,
    1
  )
  const sparseRatio = rampRatio ** sizeConfig.curveExponent
  const scale =
    sizeConfig.minScale +
    sparseRatio * (sizeConfig.maxScale - sizeConfig.minScale)

  return Math.round(baseSize * scale * 100) / 100
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
