// The ramp controls where density scaling starts and reaches its maximum.
// Each curve exponent controls how quickly it grows within that ramp:
// 1 is linear, below 1 grows earlier, and above 1 grows later.
export const MARK_DENSITY_CONFIG = Object.freeze({
  ramp: Object.freeze({
    denseSlotWidth: 8,
    sparseSlotWidth: 80
  }),
  pointRadius: Object.freeze({
    minScale: 0.8,
    maxScale: 2.75,
    curveExponent: 0.5
  }),
  lineWidth: Object.freeze({
    minScale: 1,
    maxScale: 1,
    curveExponent: 1
  }),
  // How much a selected point or trendline grows relative to its resting
  // (already density-scaled) size.
  selection: Object.freeze({
    pointScale: 1.5,
    lineScale: 1.5
  })
})

// Editable limits for the user-facing density controls. The curve exponents
// are intentionally not exposed; they always come from MARK_DENSITY_CONFIG.
export const MARK_DENSITY_BOUNDS = Object.freeze({
  ramp: Object.freeze({ min: 2, max: 120, step: 1 }),
  pointRadius: Object.freeze({ min: 0.25, max: 4, step: 0.05 }),
  lineWidth: Object.freeze({ min: 0.25, max: 4, step: 0.05 }),
  selection: Object.freeze({ min: 1, max: 3, step: 0.05 })
})

export function sanitizeMarkDensity(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {}
  const ramp = sanitizeRange(
    source.ramp,
    ['denseSlotWidth', 'sparseSlotWidth'],
    MARK_DENSITY_CONFIG.ramp,
    MARK_DENSITY_BOUNDS.ramp,
    { strict: true }
  )
  const pointRadius = sanitizeRange(
    source.pointRadius,
    ['minScale', 'maxScale'],
    MARK_DENSITY_CONFIG.pointRadius,
    MARK_DENSITY_BOUNDS.pointRadius
  )
  const lineWidth = sanitizeRange(
    source.lineWidth,
    ['minScale', 'maxScale'],
    MARK_DENSITY_CONFIG.lineWidth,
    MARK_DENSITY_BOUNDS.lineWidth
  )

  const selection = Object.freeze({
    pointScale: clampToBounds(
      source.selection?.pointScale,
      MARK_DENSITY_CONFIG.selection.pointScale,
      MARK_DENSITY_BOUNDS.selection
    ),
    lineScale: clampToBounds(
      source.selection?.lineScale,
      MARK_DENSITY_CONFIG.selection.lineScale,
      MARK_DENSITY_BOUNDS.selection
    )
  })

  return Object.freeze({
    ramp: Object.freeze(ramp),
    pointRadius: Object.freeze({
      ...pointRadius,
      curveExponent: MARK_DENSITY_CONFIG.pointRadius.curveExponent
    }),
    lineWidth: Object.freeze({
      ...lineWidth,
      curveExponent: MARK_DENSITY_CONFIG.lineWidth.curveExponent
    }),
    selection
  })
}

export function isDefaultMarkDensity(config) {
  return (
    JSON.stringify(sanitizeMarkDensity(config)) ===
    JSON.stringify(MARK_DENSITY_CONFIG)
  )
}

export function scalePointRadiusForDensity(
  baseRadius,
  pointCount,
  xScale,
  config = MARK_DENSITY_CONFIG
) {
  return scaleForDensity(
    baseRadius,
    pointCount,
    xScale,
    config.ramp,
    config.pointRadius
  )
}

export function scaleLineWidthForDensity(
  baseWidth,
  pointCount,
  xScale,
  config = MARK_DENSITY_CONFIG
) {
  return scaleForDensity(
    baseWidth,
    pointCount,
    xScale,
    config.ramp,
    config.lineWidth
  )
}

export function scaleSelectedPointRadius(
  restingRadius,
  config = MARK_DENSITY_CONFIG
) {
  return roundMarkSize(restingRadius * config.selection.pointScale)
}

export function scaleSelectedLineWidth(
  restingWidth,
  config = MARK_DENSITY_CONFIG
) {
  return roundMarkSize(restingWidth * config.selection.lineScale)
}

export function getSlotWidth(pointCount, xScale) {
  const [rangeStart, rangeEnd] = xScale.range()
  const availableWidth = Math.abs(rangeEnd - rangeStart)
  return availableWidth / Math.max(pointCount, 1)
}

function scaleForDensity(baseSize, pointCount, xScale, ramp, sizeConfig) {
  const slotWidth = getSlotWidth(pointCount, xScale)
  const { denseSlotWidth, sparseSlotWidth } = ramp
  const rampRatio = clamp(
    (slotWidth - denseSlotWidth) / (sparseSlotWidth - denseSlotWidth),
    0,
    1
  )
  const sparseRatio = rampRatio ** sizeConfig.curveExponent
  const scale =
    sizeConfig.minScale +
    sparseRatio * (sizeConfig.maxScale - sizeConfig.minScale)

  return roundMarkSize(baseSize * scale)
}

function roundMarkSize(size) {
  return Math.round(size * 100) / 100
}

// Reads a [low, high] pair, clamps each end into bounds, snaps to the step,
// and keeps low <= high (or low < high when strict, so ramps never collapse).
function sanitizeRange(source, [lowKey, highKey], defaults, bounds, options) {
  const strict = options?.strict ?? false
  const low = clampToBounds(source?.[lowKey], defaults[lowKey], bounds)
  const high = clampToBounds(source?.[highKey], defaults[highKey], bounds)
  const minimumGap = strict ? bounds.step : 0

  if (high - low >= minimumGap) {
    return { [lowKey]: low, [highKey]: high }
  }

  const adjustedHigh = Math.min(bounds.max, low + minimumGap)
  return {
    [lowKey]: roundToStep(adjustedHigh - minimumGap, bounds.step),
    [highKey]: roundToStep(adjustedHigh, bounds.step)
  }
}

function clampToBounds(value, fallback, bounds) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }

  return roundToStep(clamp(numeric, bounds.min, bounds.max), bounds.step)
}

function roundToStep(value, step) {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)))
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
