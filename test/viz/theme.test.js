import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  EPISODE_DENSITIES,
  PALETTES,
  getChartTheme,
  getUiSettings,
  initializeTheme,
  seasonColor,
  updateUiSettings
} from '../../src/viz/theme.js'
import {
  MARK_DENSITY_BOUNDS,
  MARK_DENSITY_CONFIG
} from '../../src/viz/pointSize.js'

const stylesheet = readFileSync(
  resolve(process.cwd(), 'css/styles.css'),
  'utf8'
)
let themeStyle

beforeEach(() => {
  themeStyle = document.createElement('style')
  themeStyle.textContent = stylesheet
  document.head.appendChild(themeStyle)
  window.localStorage.clear()
  initializeTheme()
})

afterEach(() => {
  themeStyle.remove()
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('mark scaling settings', () => {
  it('starts from the shared defaults and exposes them to the chart theme', () => {
    expect(getUiSettings().markDensity).toEqual(MARK_DENSITY_CONFIG)
    expect(getChartTheme().markDensity).toEqual(MARK_DENSITY_CONFIG)
  })

  it('persists sanitized overrides across reloads', () => {
    updateUiSettings({
      markDensity: {
        ramp: { denseSlotWidth: 12, sparseSlotWidth: 500 },
        pointRadius: { minScale: 0.5, maxScale: 2 }
      }
    })

    expect(getUiSettings().markDensity.ramp).toEqual({
      denseSlotWidth: 12,
      sparseSlotWidth: MARK_DENSITY_BOUNDS.ramp.max
    })
    expect(getUiSettings().markDensity.lineWidth).toEqual(
      MARK_DENSITY_CONFIG.lineWidth
    )

    const reloaded = initializeTheme()
    expect(reloaded.markDensity.pointRadius).toMatchObject({
      minScale: 0.5,
      maxScale: 2
    })
    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings')).markDensity
        .ramp.denseSlotWidth
    ).toBe(12)
  })
})

describe('theme defaults', () => {
  it('starts with the mono palette when no preference is stored', () => {
    const settings = initializeTheme()

    expect(settings.palette).toBe('monotone')
    expect(document.documentElement.dataset.palette).toBe('monotone')
  })

  it('follows live system theme changes until the user chooses a theme', () => {
    const listeners = new Set()
    const mediaQuery = {
      matches: false,
      addEventListener: (_event, listener) => listeners.add(listener),
      removeEventListener: (_event, listener) => listeners.delete(listener)
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mediaQuery)
    )

    expect(initializeTheme()).toMatchObject({
      theme: 'light',
      themeSource: 'system'
    })

    mediaQuery.matches = true
    listeners.forEach((listener) => listener({ matches: true }))
    expect(getUiSettings().theme).toBe('dark')

    updateUiSettings({ theme: 'light' })
    expect(getUiSettings().themeSource).toBe('user')
    mediaQuery.matches = true
    listeners.forEach((listener) => listener({ matches: true }))
    expect(getUiSettings().theme).toBe('light')
  })

  it('keeps settings usable when local storage rejects writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError')
    })

    expect(() => updateUiSettings({ absoluteYAxis: true })).not.toThrow()
    expect(getUiSettings().absoluteYAxis).toBe(true)
  })

  it('offers the five season palettes in display order', () => {
    expect(PALETTES).toEqual([
      'monotone',
      'alternating',
      'rainbow',
      'zigzag',
      'maximin'
    ])
  })

  it('defaults to balanced episode density and persists another choice', () => {
    expect(EPISODE_DENSITIES).toEqual(['roomy', 'balanced', 'dense', 'all'])
    expect(initializeTheme().episodeDensity).toBe('balanced')
    expect(document.documentElement.dataset.episodeDensity).toBe('balanced')

    updateUiSettings({ episodeDensity: 'dense' })

    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .episodeDensity
    ).toBe('dense')
    expect(initializeTheme().episodeDensity).toBe('dense')
  })

  it.each([
    ['mono', 'monotone'],
    ['subtle', 'alternating'],
    ['vivid', 'rainbow']
  ])('migrates the legacy %s palette to %s', (legacy, current) => {
    window.localStorage.setItem(
      'graphtv-ui-settings',
      JSON.stringify({ palette: legacy })
    )

    expect(initializeTheme().palette).toBe(current)
  })

  it('defaults to an adaptive y-axis and persists the absolute-scale option', () => {
    expect(initializeTheme().absoluteYAxis).toBe(false)

    updateUiSettings({ absoluteYAxis: true })

    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .absoluteYAxis
    ).toBe(true)
    expect(initializeTheme().absoluteYAxis).toBe(true)
  })

  it('shows source spread by default and persists an opt-out', () => {
    expect(initializeTheme().showSourceSpread).toBe(true)

    updateUiSettings({ showSourceSpread: false })

    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .showSourceSpread
    ).toBe(false)
    expect(initializeTheme().showSourceSpread).toBe(false)
  })

  it('shows the full-series trendline by default and persists an opt-out', () => {
    expect(initializeTheme().fullShowTrendline).toBe(true)

    updateUiSettings({ fullShowTrendline: false })

    expect(
      JSON.parse(window.localStorage.getItem('graphtv-ui-settings'))
        .fullShowTrendline
    ).toBe(false)
    expect(initializeTheme().fullShowTrendline).toBe(false)
  })
})

describe('theme accents', () => {
  it.each([
    ['light', '#c1432e'],
    ['dark', '#d9644d']
  ])(
    'uses the single house accent in the %s theme',
    (theme, expectedAccent) => {
      updateUiSettings({ theme, palette: 'alternating' })
      const chartTheme = getChartTheme()

      expect(chartTheme.spotColor).toBe(expectedAccent)
      expect(chartTheme.spotColorMuted).toBe(expectedAccent)
      expect(Object.values(chartTheme).join(' ')).not.toContain('var(--')
      expect(document.documentElement.dataset.theme).toBe(theme)
    }
  )
})

describe('theme token ownership', () => {
  it('leaves visual and responsive tokens under stylesheet ownership', () => {
    const rootStyle = document.documentElement.style

    expect(rootStyle.getPropertyValue('--canvas')).toBe('')
    expect(rootStyle.getPropertyValue('--font-app')).toBe('')
    expect(rootStyle.getPropertyValue('--searchMaxWidth')).toBe('')
  })

  it('updates the browser theme color from the active CSS palette', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)

    updateUiSettings({ theme: 'dark' })

    expect(meta.content).toBe('#0e0e0d')
    meta.remove()
  })

  it('falls back to visible chart colors when the stylesheet is unavailable', () => {
    themeStyle.remove()

    const chartTheme = getChartTheme()

    expect(chartTheme.text).toBe('currentColor')
    expect(chartTheme.lineSoft).toBe('currentColor')
    expect(chartTheme.background).toBe('transparent')
    expect(chartTheme.seasonColor(0, 1)).toBe('currentColor')
  })
})

describe('season palettes', () => {
  it('alternates between the foreground and a desaturated house accent', () => {
    expect(
      Array.from({ length: 4 }, (_, index) =>
        seasonColor('alternating', index, 4)
      )
    ).toEqual(['#1a1a1a', '#b36d61', '#1a1a1a', '#b36d61'])

    updateUiSettings({ theme: 'dark' })
    expect(seasonColor('alternating', 1, 2)).toBe('#b38780')
  })

  it('preserves the former vivid palette as rainbow', () => {
    expect(seasonColor('rainbow', 0, 1)).toBe('hsl(150 68% 42%)')
    expect(seasonColor('vivid', 0, 1)).toBe(seasonColor('rainbow', 0, 1))

    updateUiSettings({ theme: 'dark' })
    expect(seasonColor('rainbow', 0, 1)).toBe('hsl(150 76% 66%)')
  })

  it('zigzags between opposite hues before rotating', () => {
    updateUiSettings({ theme: 'dark' })
    const darkColors = Array.from({ length: 4 }, (_, index) =>
      seasonColor('zigzag', index, 4)
    )
    updateUiSettings({ theme: 'light' })
    const lightColors = Array.from({ length: 4 }, (_, index) =>
      seasonColor('zigzag', index, 4)
    )

    expect(darkColors).toEqual([
      'oklch(72% 0.13 25)',
      'oklch(72% 0.12 205)',
      'oklch(72% 0.13 90)',
      'oklch(72% 0.13 270)'
    ])
    expect(lightColors).toEqual([
      'oklch(58% 0.16 25)',
      'oklch(58% 0.09 205)',
      'oklch(58% 0.11 90)',
      'oklch(58% 0.16 270)'
    ])
  })

  it.each(['light', 'dark'])(
    'builds a stable, unique maximin prefix in %s mode',
    (theme) => {
      updateUiSettings({ theme })
      const colors = Array.from({ length: 12 }, (_, index) =>
        seasonColor('maximin', index, 12)
      )

      expect(new Set(colors)).toHaveLength(colors.length)
      expect(
        Array.from({ length: 12 }, (_, index) =>
          seasonColor('maximin', index, 12)
        )
      ).toEqual(colors)
    }
  )
})
