const STORAGE_KEY = 'graphtv-ui-settings'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const THEMES = ['light', 'dark']
export const PALETTES = ['monotone', 'subtle', 'vivid']
export const APP_FONT_STACK =
  '"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'

const THEME_TOKENS = {
  light: {
    canvas: '#FDFCF8',
    canvasSubtle: '#F5F3EE',
    textPrimary: '#1A1A1A',
    textSecondary: '#737373',
    textMuted: '#9A948A',
    lineSoft: 'rgba(26, 26, 26, 0.12)',
    lineStrong: 'rgba(26, 26, 26, 0.24)',
    trendMacro: '#D1D1D1',
    trendMicro: '#A3A3A3',
    spotColor: '#C1432E',
    spotColorMuted: '#C1432E',
    publisherAccent: '#C1432E'
  },
  dark: {
    canvas: '#0E0E0D',
    canvasSubtle: '#181816',
    textPrimary: '#E8E3D5',
    textSecondary: '#8A857A',
    textMuted: '#66625A',
    lineSoft: '#2A2926',
    lineStrong: '#403E39',
    trendMacro: '#56534D',
    trendMicro: '#777269',
    spotColor: '#C1432E',
    spotColorMuted: '#C1432E',
    publisherAccent: '#C1432E'
  }
}

const SETTINGS_DEFAULTS = {
  theme: 'light',
  palette: 'monotone',
  seasonTrendlines: true,
  fullShowTrendline: false
}

const TYPOGRAPHY_TOKENS = {
  app: APP_FONT_STACK,
  serif: 'var(--font-app)',
  sans: 'var(--font-app)',
  mono: 'var(--font-app)'
}

const SPACING_TOKENS = {
  pageMaxWidth: '75rem',
  searchMaxWidth: '39rem',
  columnGap: 'clamp(2rem, 4vw, 4rem)',
  rhythm: '1.5rem',
  tight: '0.75rem'
}

const CHART_TOKENS = {
  chartDesktopHeight: '25rem',
  chartMobileHeight: '16rem',
  sparklineDesktopHeight: '2.5rem',
  sparklineMobileHeight: '1.875rem'
}

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return SETTINGS_DEFAULTS.theme
  }

  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function sanitizeSettings(candidate = {}) {
  return {
    theme: THEMES.includes(candidate.theme) ? candidate.theme : getSystemTheme(),
    palette: PALETTES.includes(candidate.palette) ? candidate.palette : SETTINGS_DEFAULTS.palette,
    seasonTrendlines:
      typeof candidate.seasonTrendlines === 'boolean'
        ? candidate.seasonTrendlines
        : SETTINGS_DEFAULTS.seasonTrendlines,
    fullShowTrendline:
      typeof candidate.fullShowTrendline === 'boolean'
        ? candidate.fullShowTrendline
        : SETTINGS_DEFAULTS.fullShowTrendline
  }
}

function readStoredSettings() {
  if (typeof window === 'undefined') {
    return sanitizeSettings()
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return sanitizeSettings()
    }

    return sanitizeSettings(JSON.parse(raw))
  } catch {
    return sanitizeSettings()
  }
}

function writeStoredSettings(settings) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function setCssVar(root, token, value) {
  root.style.setProperty(`--${token}`, value)
}

function applyCssTokens(settings) {
  const root = document.documentElement
  const themeTokens = THEME_TOKENS[settings.theme]

  root.dataset.theme = settings.theme
  root.dataset.palette = settings.palette

  Object.entries(themeTokens).forEach(([token, value]) => setCssVar(root, token, value))
  Object.entries(TYPOGRAPHY_TOKENS).forEach(([token, value]) => setCssVar(root, `font-${token}`, value))
  Object.entries(SPACING_TOKENS).forEach(([token, value]) => setCssVar(root, token, value))
  Object.entries(CHART_TOKENS).forEach(([token, value]) => setCssVar(root, token, value))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeTokens.canvas)
}

let uiSettings = SETTINGS_DEFAULTS

export function initializeTheme() {
  uiSettings = readStoredSettings()
  applyCssTokens(uiSettings)

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia(MEDIA_QUERY)
    mediaQuery.addEventListener('change', () => {
      const stored = readStoredSettings()
      if (!stored.theme || !THEMES.includes(stored.theme)) {
        uiSettings = sanitizeSettings(stored)
        applyCssTokens(uiSettings)
        emitSettingsChange()
      }
    })
  }

  return uiSettings
}

function emitSettingsChange() {
  document.dispatchEvent(new CustomEvent('graphtv:settings-change', { detail: uiSettings }))
}

export function getUiSettings() {
  return uiSettings
}

export function updateUiSettings(nextPartial) {
  uiSettings = sanitizeSettings({ ...uiSettings, ...nextPartial })
  writeStoredSettings(uiSettings)
  applyCssTokens(uiSettings)
  emitSettingsChange()
  return uiSettings
}

export function toggleTheme() {
  return updateUiSettings({
    theme: uiSettings.theme === 'light' ? 'dark' : 'light'
  })
}

export function cyclePalette() {
  const currentIndex = PALETTES.indexOf(uiSettings.palette)
  const nextIndex = (currentIndex + 1) % PALETTES.length
  return updateUiSettings({
    palette: PALETTES[nextIndex]
  })
}

export function seasonColor(paletteId, seasonIndex, totalSeasons, themeId = uiSettings.theme) {
  const safeTotal = Math.max(totalSeasons, 1)
  const position = safeTotal === 1 ? 0.5 : seasonIndex / safeTotal
  const themeTokens = THEME_TOKENS[themeId]

  if (paletteId === 'monotone') {
    return themeTokens.textPrimary
  }

  const baseHue = (position * 300 + seasonIndex * 17) % 360

  if (paletteId === 'vivid') {
    const saturation = themeId === 'dark' ? 76 : 68
    const lightness = themeId === 'dark' ? 66 : 42
    return `hsl(${baseHue} ${saturation}% ${lightness}%)`
  }

  const hue = (baseHue + 18) % 360
  const saturation = themeId === 'dark' ? 34 : 28
  const lightness = themeId === 'dark' ? 62 : 44
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

export function getChartTheme(settings = uiSettings) {
  const themeTokens = THEME_TOKENS[settings.theme]

  return {
    themeId: settings.theme,
    paletteId: settings.palette,
    background: themeTokens.canvas,
    text: themeTokens.textPrimary,
    textSecondary: themeTokens.textSecondary,
    lineSoft: themeTokens.lineSoft,
    lineStrong: themeTokens.lineStrong,
    trendMacro: themeTokens.trendMacro,
    trendMicro: themeTokens.trendMicro,
    spotColor: themeTokens.spotColor,
    spotColorMuted: themeTokens.spotColorMuted,
    canvasSubtle: themeTokens.canvasSubtle,
    seasonColor: (seasonIndex, totalSeasons) =>
      seasonColor(settings.palette, seasonIndex, totalSeasons, settings.theme)
  }
}
