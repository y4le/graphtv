import { describe, expect, it } from 'vitest'

import {
  MARK_DENSITY_BOUNDS,
  MARK_DENSITY_CONFIG,
  getSlotWidth,
  isDefaultMarkDensity,
  sanitizeMarkDensity,
  scaleLineWidthForDensity,
  scalePointRadiusForDensity,
  scaleSelectedLineWidth,
  scaleSelectedPointRadius
} from '../../src/viz/pointSize.js'

describe('density-based mark sizing', () => {
  it('uses the configured point-radius endpoints', () => {
    const { denseSlotWidth, sparseSlotWidth } = MARK_DENSITY_CONFIG.ramp
    const { minScale, maxScale } = MARK_DENSITY_CONFIG.pointRadius

    expect(scalePointRadiusForDensity(3, xScale(denseSlotWidth))).toBe(
      roundMarkSize(3 * minScale)
    )
    expect(scalePointRadiusForDensity(3, xScale(sparseSlotWidth))).toBe(
      roundMarkSize(3 * maxScale)
    )
  })

  it('uses the configured curve shape between the line-width endpoints', () => {
    const { denseSlotWidth, sparseSlotWidth } = MARK_DENSITY_CONFIG.ramp
    const { minScale, maxScale, curveExponent } = MARK_DENSITY_CONFIG.lineWidth
    const midpointSlotWidth = (denseSlotWidth + sparseSlotWidth) / 2
    const expectedScale =
      minScale + 0.5 ** curveExponent * (maxScale - minScale)

    expect(scaleLineWidthForDensity(2, xScale(midpointSlotWidth))).toBe(
      roundMarkSize(2 * expectedScale)
    )
  })

  it('scales against a caller-supplied configuration', () => {
    const config = sanitizeMarkDensity({
      ramp: { denseSlotWidth: 10, sparseSlotWidth: 20 },
      pointRadius: { minScale: 0.5, maxScale: 2 },
      lineWidth: { minScale: 1, maxScale: 3 }
    })

    expect(scalePointRadiusForDensity(4, xScale(10), config)).toBe(2)
    expect(scalePointRadiusForDensity(4, xScale(20), config)).toBe(8)
    expect(scaleLineWidthForDensity(1, xScale(15), config)).toBe(2)
    expect(getSlotWidth(xScale(25))).toBe(25)
  })
})

describe('sanitizeMarkDensity', () => {
  it('falls back to the defaults for missing or malformed input', () => {
    expect(sanitizeMarkDensity(undefined)).toEqual(MARK_DENSITY_CONFIG)
    expect(sanitizeMarkDensity({ ramp: 'nope', pointRadius: null })).toEqual(
      MARK_DENSITY_CONFIG
    )
    expect(isDefaultMarkDensity(sanitizeMarkDensity({}))).toBe(true)
  })

  it('clamps values into bounds and snaps them to the control step', () => {
    const config = sanitizeMarkDensity({
      pointRadius: { minScale: -3, maxScale: 99 },
      lineWidth: { minScale: 1.234, maxScale: '2.5' },
      ramp: { denseSlotWidth: 0, sparseSlotWidth: 40.4 }
    })

    expect(config.pointRadius).toEqual({
      minScale: MARK_DENSITY_BOUNDS.pointRadius.min,
      maxScale: MARK_DENSITY_BOUNDS.pointRadius.max,
      curveExponent: MARK_DENSITY_CONFIG.pointRadius.curveExponent
    })
    expect(config.lineWidth).toMatchObject({ minScale: 1.25, maxScale: 2.5 })
    expect(config.ramp).toEqual({
      denseSlotWidth: MARK_DENSITY_BOUNDS.ramp.min,
      sparseSlotWidth: 40
    })
    expect(isDefaultMarkDensity(config)).toBe(false)
  })

  it('keeps ranges ordered and never lets the ramp collapse', () => {
    expect(
      sanitizeMarkDensity({ pointRadius: { minScale: 2, maxScale: 1 } })
        .pointRadius
    ).toMatchObject({ minScale: 2, maxScale: 2 })
    expect(
      sanitizeMarkDensity({ ramp: { denseSlotWidth: 50, sparseSlotWidth: 50 } })
        .ramp
    ).toEqual({ denseSlotWidth: 50, sparseSlotWidth: 51 })
    expect(
      sanitizeMarkDensity({
        ramp: { denseSlotWidth: 120, sparseSlotWidth: 12 }
      }).ramp
    ).toEqual({ denseSlotWidth: 119, sparseSlotWidth: 120 })
  })

  it('clamps selection emphasis into its own bounds', () => {
    const config = sanitizeMarkDensity({
      selection: { pointScale: 0.2, lineScale: '2.5' }
    })

    expect(config.selection).toEqual({ pointScale: 1, lineScale: 2.5 })
    expect(scaleSelectedPointRadius(4, config)).toBe(4)
    expect(scaleSelectedLineWidth(2, config)).toBe(5)
    expect(scaleSelectedPointRadius(3)).toBe(
      3 * MARK_DENSITY_CONFIG.selection.pointScale
    )
  })

  it('never exposes the curve exponents to stored overrides', () => {
    const config = sanitizeMarkDensity({
      pointRadius: { curveExponent: 3 },
      lineWidth: { curveExponent: 3 }
    })

    expect(config.pointRadius.curveExponent).toBe(
      MARK_DENSITY_CONFIG.pointRadius.curveExponent
    )
    expect(config.lineWidth.curveExponent).toBe(
      MARK_DENSITY_CONFIG.lineWidth.curveExponent
    )
  })
})

function roundMarkSize(size) {
  return Math.round(size * 100) / 100
}

function xScale(width) {
  return (value) => value * width
}
