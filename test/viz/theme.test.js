import { describe, expect, it } from 'vitest'

import { APP_FONT_STACK, getChartTheme, updateUiSettings } from '../../src/viz/theme.js'

describe('theme accents', () => {
  it.each(['light', 'dark'])('uses the single house accent in the %s theme', (theme) => {
    updateUiSettings({ theme, palette: 'subtle' })
    const chartTheme = getChartTheme({ theme, palette: 'subtle' })

    expect(chartTheme.spotColor).toBe('#C1432E')
    expect(chartTheme.spotColorMuted).toBe('#C1432E')
    expect(document.documentElement.style.getPropertyValue('--publisherAccent')).toBe('#C1432E')
  })
})

describe('theme typography', () => {
  it('maps every typography role to the publisher-signature font stack', () => {
    updateUiSettings({ theme: 'light', palette: 'subtle' })
    const rootStyle = document.documentElement.style

    expect(rootStyle.getPropertyValue('--font-app')).toBe(APP_FONT_STACK)
    expect(rootStyle.getPropertyValue('--font-serif')).toBe('var(--font-app)')
    expect(rootStyle.getPropertyValue('--font-sans')).toBe('var(--font-app)')
    expect(rootStyle.getPropertyValue('--font-mono')).toBe('var(--font-app)')
  })
})
