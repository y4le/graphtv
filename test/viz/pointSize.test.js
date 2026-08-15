import { describe, expect, it } from 'vitest'

import {
  MARK_DENSITY_CONFIG,
  scaleLineWidthForDensity,
  scalePointRadiusForDensity
} from '../../src/viz/pointSize.js'

describe('density-based mark sizing', () => {
  it('uses the configured point-radius endpoints', () => {
    const { denseSlotWidth, sparseSlotWidth } = MARK_DENSITY_CONFIG.ramp
    const { minScale, maxScale } = MARK_DENSITY_CONFIG.pointRadius

    expect(scalePointRadiusForDensity(3, 1, xScale(denseSlotWidth))).toBe(
      roundMarkSize(3 * minScale)
    )
    expect(scalePointRadiusForDensity(3, 1, xScale(sparseSlotWidth))).toBe(
      roundMarkSize(3 * maxScale)
    )
  })

  it('uses the configured curve shape between the line-width endpoints', () => {
    const { denseSlotWidth, sparseSlotWidth } = MARK_DENSITY_CONFIG.ramp
    const { minScale, maxScale, curveExponent } = MARK_DENSITY_CONFIG.lineWidth
    const midpointSlotWidth = (denseSlotWidth + sparseSlotWidth) / 2
    const expectedScale =
      minScale + 0.5 ** curveExponent * (maxScale - minScale)

    expect(scaleLineWidthForDensity(2, 1, xScale(midpointSlotWidth))).toBe(
      roundMarkSize(2 * expectedScale)
    )
  })
})

function roundMarkSize(size) {
  return Math.round(size * 100) / 100
}

function xScale(width) {
  return { range: () => [0, width] }
}
