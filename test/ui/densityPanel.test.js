import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDockController } from '../../src/ui/dock.js'
import { openMarkDensityDock } from '../../src/ui/densityPanel.js'
import {
  MARK_DENSITY_BOUNDS,
  MARK_DENSITY_CONFIG
} from '../../src/viz/pointSize.js'
import {
  getUiSettings,
  initializeTheme,
  updateUiSettings
} from '../../src/viz/theme.js'

let dockController

beforeEach(() => {
  window.localStorage.clear()
  initializeTheme()
  dockController = createDockController()
})

afterEach(() => {
  dockController.destroy()
  document.body.replaceChildren()
})

function thumb(controlKey, end) {
  return document.querySelector(
    `[data-density-control="${controlKey}"] [data-density-thumb="${end}"]`
  )
}

function slide(input, value) {
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('mark scaling panel', () => {
  it('renders one two-thumb range per setting, seeded from the current values', () => {
    openMarkDensityDock(dockController, {})

    expect(dockController.getActiveId()).toBe('mark-density')
    expect(document.querySelector('.dock-title').textContent).toBe(
      'Mark scaling'
    )
    const controls = Array.from(
      document.querySelectorAll('[data-density-control]'),
      (node) => node.dataset.densityControl
    )
    expect(controls).toEqual([
      'pointRadius',
      'lineWidth',
      'ramp',
      'selection-pointScale',
      'selection-lineScale'
    ])
    expect(
      document.querySelectorAll(
        '[data-density-control="selection-lineScale"] [data-density-thumb]'
      )
    ).toHaveLength(1)

    const pointLow = thumb('pointRadius', 'low')
    expect(pointLow.min).toBe(String(MARK_DENSITY_BOUNDS.pointRadius.min))
    expect(pointLow.max).toBe(String(MARK_DENSITY_BOUNDS.pointRadius.max))
    expect(pointLow.step).toBe(String(MARK_DENSITY_BOUNDS.pointRadius.step))
    expect(Number(pointLow.value)).toBe(
      MARK_DENSITY_CONFIG.pointRadius.minScale
    )
    expect(Number(thumb('pointRadius', 'high').value)).toBe(
      MARK_DENSITY_CONFIG.pointRadius.maxScale
    )
    expect(Number(thumb('ramp', 'low').value)).toBe(
      MARK_DENSITY_CONFIG.ramp.denseSlotWidth
    )
    expect(pointLow.getAttribute('aria-label')).toBe(
      'Point size at dense spacing'
    )
    expect(pointLow.getAttribute('aria-valuetext')).toBe('0.80×')
    expect(
      document.querySelector(
        '[data-density-control="ramp"] [data-density-value="high"]'
      ).textContent
    ).toBe('80px')
    expect(document.activeElement).toBe(pointLow)
    expect(document.querySelector('[data-density-reset]').disabled).toBe(true)
  })

  it('writes slider changes straight into the persisted ui settings', () => {
    openMarkDensityDock(dockController, {})

    slide(thumb('pointRadius', 'high'), 2.5)
    expect(getUiSettings().markDensity.pointRadius).toMatchObject({
      minScale: 0.8,
      maxScale: 2.5
    })
    slide(thumb('lineWidth', 'low'), 0.5)
    expect(getUiSettings().markDensity.lineWidth).toMatchObject({
      minScale: 0.5,
      maxScale: 1
    })
    slide(thumb('ramp', 'high'), 110)
    expect(getUiSettings().markDensity.ramp).toEqual({
      denseSlotWidth: 8,
      sparseSlotWidth: 110
    })
    expect(
      document.querySelector(
        '[data-density-control="ramp"] [data-density-value="high"]'
      ).textContent
    ).toBe('110px')
    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings')).markDensity
        .ramp.sparseSlotWidth
    ).toBe(110)
    expect(document.querySelector('[data-density-reset]').disabled).toBe(false)
  })

  it('writes single-thumb selection emphasis into the settings', () => {
    openMarkDensityDock(dockController, {})
    const lineThumb = document.querySelector(
      '[data-density-control="selection-lineScale"] [data-density-thumb="high"]'
    )
    expect(Number(lineThumb.value)).toBe(
      MARK_DENSITY_CONFIG.selection.lineScale
    )
    expect(lineThumb.getAttribute('aria-label')).toBe(
      'Selected line width relative to resting width'
    )

    slide(lineThumb, 2.2)
    expect(getUiSettings().markDensity.selection).toEqual({
      pointScale: MARK_DENSITY_CONFIG.selection.pointScale,
      lineScale: 2.2
    })
    expect(
      document.querySelector(
        '[data-density-control="selection-lineScale"] [data-density-value="high"]'
      ).textContent
    ).toBe('2.20×')
  })

  it('keeps thumbs ordered when one is dragged past the other', () => {
    openMarkDensityDock(dockController, {})

    slide(thumb('pointRadius', 'low'), 3)
    expect(getUiSettings().markDensity.pointRadius).toMatchObject({
      minScale: 2.75,
      maxScale: 2.75
    })
    expect(Number(thumb('pointRadius', 'low').value)).toBe(2.75)

    slide(thumb('ramp', 'high'), 4)
    expect(getUiSettings().markDensity.ramp).toEqual({
      denseSlotWidth: 8,
      sparseSlotWidth: 9
    })
    expect(Number(thumb('ramp', 'high').value)).toBe(9)
  })

  it('resets to the defaults and follows external settings changes', () => {
    openMarkDensityDock(dockController, {})
    slide(thumb('lineWidth', 'high'), 3)

    document.querySelector('[data-density-reset]').click()
    expect(getUiSettings().markDensity).toEqual(MARK_DENSITY_CONFIG)
    expect(Number(thumb('lineWidth', 'high').value)).toBe(1)
    expect(document.querySelector('[data-density-reset]').disabled).toBe(true)

    updateUiSettings({
      markDensity: { ramp: { denseSlotWidth: 40, sparseSlotWidth: 120 } }
    })
    expect(Number(thumb('ramp', 'low').value)).toBe(40)
    expect(Number(thumb('ramp', 'high').value)).toBe(120)
  })

  it('marks the current chart and overview slot widths on the ramp', () => {
    const page = {
      chart: {
        getDensityMetrics: () => ({
          chartSlotWidth: 61,
          sparklineSlotWidth: 12
        })
      }
    }
    openMarkDensityDock(dockController, page)

    const chartMarker = document.querySelector(
      '[data-density-marker="chartSlotWidth"]'
    )
    const overviewMarker = document.querySelector(
      '[data-density-marker="sparklineSlotWidth"]'
    )
    expect(chartMarker.hidden).toBe(false)
    expect(chartMarker.style.getPropertyValue('--position')).toBe('50%')
    expect(overviewMarker.style.getPropertyValue('--position')).toBe('8.5%')
    expect(document.querySelector('[data-density-readout]').textContent).toBe(
      'Now: chart 61px · overview 12px per episode'
    )

    document.dispatchEvent(
      new CustomEvent('graphtv:chart-density', {
        detail: { chartSlotWidth: 600, sparklineSlotWidth: 12 }
      })
    )
    expect(chartMarker.classList.contains('is-clamped')).toBe(true)
    expect(chartMarker.style.getPropertyValue('--position')).toBe('100%')

    dockController.close()
    document.dispatchEvent(
      new CustomEvent('graphtv:chart-density', {
        detail: { chartSlotWidth: 20, sparklineSlotWidth: 20 }
      })
    )
    expect(document.querySelector('[data-density-readout]')).toBeNull()
  })

  it('toggles closed when opened a second time', () => {
    openMarkDensityDock(dockController, {})
    expect(dockController.isOpen()).toBe(true)
    openMarkDensityDock(dockController, {})
    expect(dockController.isOpen()).toBe(false)
  })
})
