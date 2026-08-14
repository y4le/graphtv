import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  resolve(process.cwd(), 'css/styles.css'),
  'utf8'
)

describe('theme stylesheet', () => {
  let style

  beforeEach(() => {
    style = document.createElement('style')
    style.textContent = stylesheet
    document.head.appendChild(style)
  })

  afterEach(() => {
    delete document.documentElement.dataset.theme
    style.remove()
  })

  it('owns responsive layout tokens without runtime overrides', () => {
    const rootStyle = getComputedStyle(document.documentElement)

    expect(rootStyle.getPropertyValue('--searchMaxWidth').trim()).toBe(
      'clamp(39rem, calc(24rem + 12vw), 52rem)'
    )
    expect(rootStyle.getPropertyValue('--pageMaxWidth').trim()).toBe('75rem')
  })

  it('provides complete light and dark palettes through theme state', () => {
    const root = document.documentElement
    root.dataset.theme = 'light'

    expect(getThemeToken('--canvas')).toBe('#fdfcf8')
    expect(getThemeToken('--textPrimary')).toBe('#1a1a1a')
    expect(getThemeToken('--seasonAccentMuted')).toBe('#b36d61')

    root.dataset.theme = 'dark'

    expect(getThemeToken('--canvas')).toBe('#0e0e0d')
    expect(getThemeToken('--textPrimary')).toBe('#e8e3d5')
    expect(getThemeToken('--seasonAccentMuted')).toBe('#b38780')
  })

  it('defines a dark first-paint fallback before JavaScript sets theme state', () => {
    expect(stylesheet).toContain('@media (prefers-color-scheme: dark)')
    expect(stylesheet).toContain(':root:not([data-theme])')
  })
})

function getThemeToken(token) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim()
}
