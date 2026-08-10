import { describe, expect, it } from 'vitest'

import { getChartTheme, updateUiSettings } from '../../src/viz/theme.js'

describe('theme accents', () => {
  it.each(['light', 'dark'])('uses the single house accent in the %s theme', (theme) => {
    updateUiSettings({ theme, palette: 'subtle' })
    const chartTheme = getChartTheme({ theme, palette: 'subtle' })

    expect(chartTheme.spotColor).toBe('#C1432E')
    expect(chartTheme.spotColorMuted).toBe('#C1432E')
    expect(document.documentElement.style.getPropertyValue('--publisherAccent')).toBe('#C1432E')
  })
})
