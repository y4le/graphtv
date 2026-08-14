import { beforeEach, describe, expect, it } from 'vitest'

import {
  APP_FONT_STACK,
  EPISODE_DENSITIES,
  PALETTES,
  getChartTheme,
  initializeTheme,
  seasonColor,
  updateUiSettings
} from '../../src/viz/theme.js'

beforeEach(() => {
  window.localStorage.clear()
  initializeTheme()
})

describe('theme defaults', () => {
  it('starts with the mono palette when no preference is stored', () => {
    const settings = initializeTheme()

    expect(settings.palette).toBe('monotone')
    expect(document.documentElement.dataset.palette).toBe('monotone')
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
    expect(EPISODE_DENSITIES).toEqual([
      'roomy',
      'balanced',
      'dense',
      'all'
    ])
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

    expect(JSON.parse(window.localStorage.getItem('graphtv-ui-settings')).absoluteYAxis).toBe(true)
    expect(initializeTheme().absoluteYAxis).toBe(true)
  })

  it('shows source spread by default and persists an opt-out', () => {
    expect(initializeTheme().showSourceSpread).toBe(true)

    updateUiSettings({ showSourceSpread: false })

    expect(JSON.parse(window.localStorage.getItem('graphtv-ui-settings')).showSourceSpread).toBe(false)
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
  it.each(['light', 'dark'])('uses the single house accent in the %s theme', (theme) => {
    updateUiSettings({ theme, palette: 'alternating' })
    const chartTheme = getChartTheme({ theme, palette: 'alternating' })

    expect(chartTheme.spotColor).toBe('#C1432E')
    expect(chartTheme.spotColorMuted).toBe('#C1432E')
    expect(document.documentElement.style.getPropertyValue('--publisherAccent')).toBe('#C1432E')
  })
})

describe('theme typography', () => {
  it('maps every typography role to the publisher-signature font stack', () => {
    updateUiSettings({ theme: 'light', palette: 'alternating' })
    const rootStyle = document.documentElement.style

    expect(rootStyle.getPropertyValue('--font-app')).toBe(APP_FONT_STACK)
    expect(rootStyle.getPropertyValue('--font-serif')).toBe('var(--font-app)')
    expect(rootStyle.getPropertyValue('--font-sans')).toBe('var(--font-app)')
    expect(rootStyle.getPropertyValue('--font-mono')).toBe('var(--font-app)')
  })
})

describe('season palettes', () => {
  it('alternates between the foreground and a desaturated house accent', () => {
    expect(
      Array.from({ length: 4 }, (_, index) =>
        seasonColor('alternating', index, 4, 'light')
      )
    ).toEqual(['#1A1A1A', '#B36D61', '#1A1A1A', '#B36D61'])

    expect(seasonColor('alternating', 1, 2, 'dark')).toBe('#B38780')
  })

  it('preserves the former vivid palette as rainbow', () => {
    expect(seasonColor('rainbow', 0, 1, 'light')).toBe('hsl(150 68% 42%)')
    expect(seasonColor('rainbow', 0, 1, 'dark')).toBe('hsl(150 76% 66%)')
    expect(seasonColor('vivid', 0, 1, 'light')).toBe(
      seasonColor('rainbow', 0, 1, 'light')
    )
  })

  it('zigzags between opposite hues before rotating', () => {
    const darkColors = Array.from({ length: 4 }, (_, index) =>
      seasonColor('zigzag', index, 4, 'dark')
    )
    const lightColors = Array.from({ length: 4 }, (_, index) =>
      seasonColor('zigzag', index, 4, 'light')
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

  it.each(['light', 'dark'])('builds a stable, unique maximin prefix in %s mode', (theme) => {
    const colors = Array.from({ length: 12 }, (_, index) =>
      seasonColor('maximin', index, 12, theme)
    )

    expect(new Set(colors)).toHaveLength(colors.length)
    expect(
      Array.from({ length: 12 }, (_, index) =>
        seasonColor('maximin', index, 12, theme)
      )
    ).toEqual(colors)
  })
})
