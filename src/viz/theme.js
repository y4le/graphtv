const STORAGE_KEY = 'graphtv-ui-settings'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const THEMES = ['light', 'dark']
export const PALETTES = ['monotone', 'subtle', 'vivid']

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
    spotColor: '#A63A28',
    spotColorMuted: '#C47A6F',
    controlFill: 'rgba(245, 243, 238, 0.92)',
    debugBg: 'rgba(245, 243, 238, 0.95)'
  },
  dark: {
    canvas: '#1A1A1A',
    canvasSubtle: '#242424',
    textPrimary: '#E8E6E1',
    textSecondary: '#8C8C8C',
    textMuted: '#666666',
    lineSoft: 'rgba(232, 230, 225, 0.12)',
    lineStrong: 'rgba(232, 230, 225, 0.22)',
    trendMacro: '#3D3D3D',
    trendMicro: '#5C5C5C',
    spotColor: '#D4594A',
    spotColorMuted: '#A6534A',
    controlFill: 'rgba(36, 36, 36, 0.92)',
    debugBg: 'rgba(24, 24, 24, 0.95)'
  }
}

const SETTINGS_DEFAULTS = {
  theme: 'light',
  palette: 'subtle'
}

const TYPOGRAPHY_TOKENS = {
  serif: '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif',
  sans: 'Inter, Roboto, "Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif'
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
    palette: PALETTES.includes(candidate.palette) ? candidate.palette : SETTINGS_DEFAULTS.palette
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

export function bindSettingsControls(container) {
  const root = typeof container === 'string' ? document.querySelector(container) : container
  if (!root) {
    return
  }

  root.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      updateUiSettings({ theme: button.dataset.themeOption })
      syncSettingsControls(root)
    })
  })

  root.querySelectorAll('[data-palette-option]').forEach((button) => {
    button.addEventListener('click', () => {
      updateUiSettings({ palette: button.dataset.paletteOption })
      syncSettingsControls(root)
    })
  })

  syncSettingsControls(root)
}

export function syncSettingsControls(container) {
  const root = typeof container === 'string' ? document.querySelector(container) : container
  if (!root) {
    return
  }

  const settings = getUiSettings()

  root.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeOption === settings.theme))
  })

  root.querySelectorAll('[data-palette-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.paletteOption === settings.palette))
  })
}

export function renderDisplayControls() {
  const settings = getUiSettings()

  return `
    <section class="display-controls" aria-label="Display settings">
      <div class="display-group">
        <span class="display-label">Theme</span>
        <div class="display-options" role="group" aria-label="Theme">
          ${THEMES.map((theme) => renderControlButton('theme', theme, settings.theme === theme)).join('')}
        </div>
      </div>
      <div class="display-group">
        <span class="display-label">Season palette</span>
        <div class="display-options" role="group" aria-label="Season palette">
          ${PALETTES.map((palette) => renderControlButton('palette', palette, settings.palette === palette)).join('')}
        </div>
      </div>
    </section>
  `
}

function renderControlButton(kind, value, isActive) {
  const dataAttribute = kind === 'theme' ? 'data-theme-option' : 'data-palette-option'
  const label = value.charAt(0).toUpperCase() + value.slice(1)
  return `
    <button
      class="display-option"
      type="button"
      ${dataAttribute}="${value}"
      aria-pressed="${String(isActive)}"
    >
      ${label}
    </button>
  `
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
