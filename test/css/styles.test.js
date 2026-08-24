import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const stylesheetPaths = [
  'css/styles.css',
  'css/overlays.css',
  'css/density-panel.css'
]
const stylesheet = readFileSync(
  resolve(process.cwd(), stylesheetPaths[0]),
  'utf8'
)
const stylesheets = stylesheetPaths
  .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
  .join('\n')

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
    expect(getThemeToken('--lineSubtle')).toBe('rgba(26, 26, 26, 0.07)')

    root.dataset.theme = 'dark'

    expect(getThemeToken('--canvas')).toBe('#0e0e0d')
    expect(getThemeToken('--textPrimary')).toBe('#e8e3d5')
    expect(getThemeToken('--seasonAccentMuted')).toBe('#b38780')
    expect(getThemeToken('--lineSubtle')).toBe('#232220')
  })

  it('defines a dark first-paint fallback before JavaScript sets theme state', () => {
    expect(stylesheet).toContain('@media (prefers-color-scheme: dark)')
    expect(stylesheet).toContain(':root:not([data-theme])')
  })

  it('defines every static custom property used without a fallback', () => {
    const definitions = new Set(
      Array.from(stylesheets.matchAll(/--([\w-]+)\s*:/gu), (match) => match[1])
    )
    const runtimeProperties = new Set(['reading-pane-marker'])
    const unresolved = Array.from(
      stylesheets.matchAll(/var\(\s*--([\w-]+)([^)]*)\)/gu),
      (match) => ({ name: match[1], hasFallback: match[2].includes(',') })
    )
      .filter(
        ({ name, hasFallback }) =>
          !hasFallback && !definitions.has(name) && !runtimeProperties.has(name)
      )
      .map(({ name }) => name)

    expect(Array.from(new Set(unresolved))).toEqual([])
  })

  it('keeps hidden artwork fallbacks out of the rendered layout', () => {
    const fallback = document.createElement('span')
    fallback.className = 'collection-card-artwork-fallback artwork-missing'
    fallback.hidden = true
    document.body.append(fallback)

    expect(getComputedStyle(fallback).display).toBe('none')

    fallback.remove()
  })
})

function getThemeToken(token) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim()
}
