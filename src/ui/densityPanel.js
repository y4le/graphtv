import {
  MARK_DENSITY_BOUNDS,
  MARK_DENSITY_CONFIG,
  isDefaultMarkDensity,
  sanitizeMarkDensity
} from '../viz/pointSize.js'
import { getUiSettings, updateUiSettings } from '../viz/theme.js'
import { escapeHtml } from '../lib/html.js'
import '../../css/density-panel.css'

export const MARK_DENSITY_DOCK_ID = 'mark-density'
export const MARK_DENSITY_TOGGLE_KEY = 'm'

// Each control is a two-thumb range: the low thumb applies at dense spacing
// (small slot widths) and the high thumb at sparse spacing.
const DENSITY_CONTROLS = [
  {
    key: 'pointRadius',
    lowKey: 'minScale',
    highKey: 'maxScale',
    label: 'Point size',
    lowName: 'Point size at dense spacing',
    highName: 'Point size at sparse spacing',
    format: formatScale
  },
  {
    key: 'lineWidth',
    lowKey: 'minScale',
    highKey: 'maxScale',
    label: 'Line width',
    lowName: 'Line width at dense spacing',
    highName: 'Line width at sparse spacing',
    format: formatScale
  },
  {
    key: 'ramp',
    lowKey: 'denseSlotWidth',
    highKey: 'sparseSlotWidth',
    label: 'Ramp',
    lowName: 'Pixels per episode where dense sizing applies',
    highName: 'Pixels per episode where sparse sizing applies',
    format: formatPixels
  },
  {
    key: 'selection',
    single: true,
    highKey: 'pointScale',
    label: 'Selected point',
    highName: 'Selected point size relative to resting size',
    format: formatScale
  },
  {
    key: 'selection',
    single: true,
    highKey: 'lineScale',
    label: 'Selected line',
    highName: 'Selected line width relative to resting width',
    format: formatScale
  }
]

const DENSITY_MARKERS = [
  { key: 'chartSlotWidth', label: 'chart' },
  { key: 'sparklineSlotWidth', label: 'overview' }
]

export function openMarkDensityDock(dockController, page = {}) {
  return dockController.toggle(createMarkDensityDockConfig(page))
}

export function createMarkDensityDockConfig(page = {}) {
  let cleanup = null

  return {
    id: MARK_DENSITY_DOCK_ID,
    title: 'Mark scaling',
    subtitle: 'left thumb applies at dense spacing, right thumb at sparse',
    className: 'dock-mark-density',
    toggleKey: MARK_DENSITY_TOGGLE_KEY,
    actions: renderActions(),
    content: renderContent(),
    onMount({ panel }) {
      cleanup = bindMarkDensityPanel(panel, page)
    },
    onClose() {
      cleanup?.()
      cleanup = null
    }
  }
}

function renderActions() {
  return `
    <button type="button" class="dock-action" data-density-reset>Reset</button>
  `
}

function renderContent() {
  return `
    <div class="density-panel">
      ${DENSITY_CONTROLS.map(renderControl).join('')}
      <p class="density-readout" data-density-readout aria-live="polite"></p>
    </div>
  `
}

function controlId(control) {
  return control.single ? `${control.key}-${control.highKey}` : control.key
}

function renderControl(control) {
  const bounds = MARK_DENSITY_BOUNDS[control.key]
  const id = controlId(control)
  const rangeAttributes = `min="${bounds.min}" max="${bounds.max}" step="${bounds.step}"`
  const markers =
    control.key === 'ramp'
      ? DENSITY_MARKERS.map(
          (marker) =>
            `<span class="density-marker density-marker-${marker.key}" data-density-marker="${marker.key}" hidden></span>`
        ).join('')
      : ''

  if (control.single) {
    return `
      <div class="density-control density-control-single" data-density-control="${id}">
        <span class="density-control-label">${control.label}</span>
        <output class="density-value density-value-low" data-density-value="high" for="density-${id}-high"></output>
        <div class="density-track">
          <span class="density-track-fill" data-density-fill></span>
          <input type="range" id="density-${id}-high" class="density-thumb" data-density-thumb="high" ${rangeAttributes} aria-label="${escapeHtml(control.highName)}">
        </div>
      </div>
    `
  }

  return `
    <div class="density-control" data-density-control="${id}">
      <span class="density-control-label">${control.label}</span>
      <output class="density-value density-value-low" data-density-value="low" for="density-${id}-low"></output>
      <div class="density-track">
        <span class="density-track-fill" data-density-fill></span>
        ${markers}
        <input type="range" id="density-${id}-low" class="density-thumb" data-density-thumb="low" ${rangeAttributes} aria-label="${escapeHtml(control.lowName)}">
        <input type="range" id="density-${id}-high" class="density-thumb" data-density-thumb="high" ${rangeAttributes} aria-label="${escapeHtml(control.highName)}">
      </div>
      <output class="density-value density-value-high" data-density-value="high" for="density-${id}-high"></output>
    </div>
  `
}

function bindMarkDensityPanel(panel, page) {
  const resetButton = panel.querySelector('[data-density-reset]')
  const readout = panel.querySelector('[data-density-readout]')
  const controls = DENSITY_CONTROLS.map((control) => ({
    ...control,
    bounds: MARK_DENSITY_BOUNDS[control.key],
    root: panel.querySelector(`[data-density-control="${controlId(control)}"]`)
  }))
  let metrics = page.chart?.getDensityMetrics?.() ?? null

  function sync() {
    const config = getUiSettings().markDensity
    controls.forEach((control) => syncControl(control, config[control.key]))
    resetButton.disabled = isDefaultMarkDensity(config)
    syncMetrics()
  }

  function syncMetrics() {
    const ramp = controls.find((control) => control.key === 'ramp')
    const parts = []

    DENSITY_MARKERS.forEach((marker) => {
      const node = ramp.root.querySelector(
        `[data-density-marker="${marker.key}"]`
      )
      const value = metrics?.[marker.key]
      if (!Number.isFinite(value)) {
        node.hidden = true
        return
      }

      const clamped = Math.min(
        Math.max(value, ramp.bounds.min),
        ramp.bounds.max
      )
      node.hidden = false
      node.style.setProperty(
        '--position',
        `${toPercent(clamped, ramp.bounds)}%`
      )
      node.classList.toggle('is-clamped', clamped !== value)
      node.title = `${marker.label}: ${formatPixels(value)} per episode`
      parts.push(`${marker.label} ${formatPixels(value)}`)
    })

    readout.textContent = parts.length
      ? `Now: ${parts.join(' · ')} per episode`
      : ''
  }

  function commit(control, low, high) {
    const current = getUiSettings().markDensity
    const values = control.single
      ? { ...current[control.key], [control.highKey]: high }
      : { [control.lowKey]: low, [control.highKey]: high }
    updateUiSettings({
      markDensity: sanitizeMarkDensity({ ...current, [control.key]: values })
    })
  }

  controls.forEach((control) => {
    const lowThumb = control.root.querySelector('[data-density-thumb="low"]')
    const highThumb = control.root.querySelector('[data-density-thumb="high"]')
    const minimumGap = control.key === 'ramp' ? control.bounds.step : 0

    if (control.single) {
      highThumb.addEventListener('input', () => {
        commit(control, null, Number(highThumb.value))
      })
      return
    }

    lowThumb.addEventListener('input', () => {
      const high = Number(highThumb.value)
      const low = Math.min(Number(lowThumb.value), high - minimumGap)
      commit(control, low, high)
    })
    highThumb.addEventListener('input', () => {
      const low = Number(lowThumb.value)
      const high = Math.max(Number(highThumb.value), low + minimumGap)
      commit(control, low, high)
    })
  })

  resetButton.addEventListener('click', () => {
    updateUiSettings({ markDensity: MARK_DENSITY_CONFIG })
    panel.querySelector('[data-density-thumb]')?.focus({ preventScroll: true })
  })

  const onSettingsChange = () => sync()
  const onDensityChange = (event) => {
    metrics = event.detail ?? null
    syncMetrics()
  }
  document.addEventListener('graphtv:settings-change', onSettingsChange)
  document.addEventListener('graphtv:chart-density', onDensityChange)

  sync()

  return () => {
    document.removeEventListener('graphtv:settings-change', onSettingsChange)
    document.removeEventListener('graphtv:chart-density', onDensityChange)
  }
}

function syncControl(control, values) {
  const high = values[control.highKey]
  const highThumb = control.root.querySelector('[data-density-thumb="high"]')
  const fill = control.root.querySelector('[data-density-fill]')

  if (Number(highThumb.value) !== high) {
    highThumb.value = String(high)
  }
  highThumb.setAttribute('aria-valuetext', control.format(high))
  control.root.querySelector('[data-density-value="high"]').textContent =
    control.format(high)
  fill.style.setProperty('--high', `${toPercent(high, control.bounds)}%`)

  if (control.single) {
    fill.style.setProperty('--low', '0%')
    return
  }

  const low = values[control.lowKey]
  const lowThumb = control.root.querySelector('[data-density-thumb="low"]')
  if (Number(lowThumb.value) !== low) {
    lowThumb.value = String(low)
  }
  lowThumb.setAttribute('aria-valuetext', control.format(low))
  control.root.querySelector('[data-density-value="low"]').textContent =
    control.format(low)
  fill.style.setProperty('--low', `${toPercent(low, control.bounds)}%`)
}

function toPercent(value, bounds) {
  const ratio = (value - bounds.min) / (bounds.max - bounds.min)
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 1000) / 10
}

function formatScale(value) {
  return `${value.toFixed(2)}×`
}

function formatPixels(value) {
  return `${Math.round(value)}px`
}
