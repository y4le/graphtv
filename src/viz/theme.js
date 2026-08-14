const STORAGE_KEY = 'graphtv-ui-settings'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const THEMES = ['light', 'dark']
export const THEME_CHOICES = ['system', ...THEMES]
export const EPISODE_DENSITIES = ['roomy', 'balanced', 'dense', 'all']
export const PALETTES = [
  'monotone',
  'alternating',
  'rainbow',
  'zigzag',
  'maximin'
]
export const APP_FONT_STACK =
  '"Geist Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace'

const LEGACY_PALETTE_IDS = {
  mono: 'monotone',
  subtle: 'alternating',
  vivid: 'rainbow'
}

const MAXIMIN_PALETTE_STATE = new Map()
const MAXIMIN_CONFIG = {
  light: {
    lightnesses: [0.42, 0.52, 0.62],
    chromas: [0.09, 0.15, 0.21],
    seed: { lightness: 0.52, chroma: 0.15, hue: 30 }
  },
  dark: {
    lightnesses: [0.62, 0.72, 0.82],
    chromas: [0.09, 0.15, 0.21],
    seed: { lightness: 0.72, chroma: 0.15, hue: 30 }
  }
}

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
    seasonAccentMuted: '#B36D61',
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
    seasonAccentMuted: '#B38780',
    publisherAccent: '#C1432E'
  }
}

const SETTINGS_DEFAULTS = {
  theme: 'light',
  themeSource: 'system',
  palette: 'monotone',
  seasonTrendlines: true,
  fullShowTrendline: true,
  showSourceSpread: true,
  absoluteYAxis: false,
  episodeDensity: 'balanced'
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
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return SETTINGS_DEFAULTS.theme
  }

  return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
}

function normalizePaletteId(paletteId) {
  const normalized = LEGACY_PALETTE_IDS[paletteId] ?? paletteId
  return PALETTES.includes(normalized) ? normalized : SETTINGS_DEFAULTS.palette
}

function sanitizeSettings(candidate = {}) {
  const themeSource =
    candidate.themeSource === 'system'
      ? 'system'
      : candidate.themeSource === 'user' || THEMES.includes(candidate.theme)
        ? 'user'
        : 'system'

  return {
    theme:
      themeSource === 'user' && THEMES.includes(candidate.theme)
        ? candidate.theme
        : getSystemTheme(),
    themeSource,
    palette: normalizePaletteId(candidate.palette),
    seasonTrendlines:
      typeof candidate.seasonTrendlines === 'boolean'
        ? candidate.seasonTrendlines
        : SETTINGS_DEFAULTS.seasonTrendlines,
    fullShowTrendline:
      typeof candidate.fullShowTrendline === 'boolean'
        ? candidate.fullShowTrendline
        : SETTINGS_DEFAULTS.fullShowTrendline,
    showSourceSpread:
      typeof candidate.showSourceSpread === 'boolean'
        ? candidate.showSourceSpread
        : SETTINGS_DEFAULTS.showSourceSpread,
    absoluteYAxis:
      typeof candidate.absoluteYAxis === 'boolean'
        ? candidate.absoluteYAxis
        : SETTINGS_DEFAULTS.absoluteYAxis,
    episodeDensity: EPISODE_DENSITIES.includes(candidate.episodeDensity)
      ? candidate.episodeDensity
      : SETTINGS_DEFAULTS.episodeDensity
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

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Settings still apply for this session when persistence is unavailable.
  }
}

function setCssVar(root, token, value) {
  root.style.setProperty(`--${token}`, value)
}

function applyCssTokens(settings) {
  const root = document.documentElement
  const themeTokens = THEME_TOKENS[settings.theme]

  root.dataset.theme = settings.theme
  root.dataset.palette = settings.palette
  root.dataset.episodeDensity = settings.episodeDensity

  Object.entries(themeTokens).forEach(([token, value]) =>
    setCssVar(root, token, value)
  )
  Object.entries(TYPOGRAPHY_TOKENS).forEach(([token, value]) =>
    setCssVar(root, `font-${token}`, value)
  )
  Object.entries(SPACING_TOKENS).forEach(([token, value]) =>
    setCssVar(root, token, value)
  )
  Object.entries(CHART_TOKENS).forEach(([token, value]) =>
    setCssVar(root, token, value)
  )
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', themeTokens.canvas)
}

let uiSettings = SETTINGS_DEFAULTS
let systemThemeQuery = null
let systemThemeListener = null

export function initializeTheme() {
  uiSettings = readStoredSettings()
  applyCssTokens(uiSettings)

  systemThemeQuery?.removeEventListener?.('change', systemThemeListener)
  systemThemeQuery = null
  systemThemeListener = null

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    systemThemeQuery = window.matchMedia(MEDIA_QUERY)
    systemThemeListener = () => {
      if (uiSettings.themeSource === 'system') {
        uiSettings = sanitizeSettings({ ...uiSettings, themeSource: 'system' })
        applyCssTokens(uiSettings)
        emitSettingsChange()
      }
    }
    systemThemeQuery.addEventListener('change', systemThemeListener)
  }

  return uiSettings
}

function emitSettingsChange() {
  document.dispatchEvent(
    new CustomEvent('graphtv:settings-change', { detail: uiSettings })
  )
}

export function getUiSettings() {
  return uiSettings
}

export function updateUiSettings(nextPartial) {
  const candidate = { ...uiSettings, ...nextPartial }
  if (
    Object.hasOwn(nextPartial, 'theme') &&
    !Object.hasOwn(nextPartial, 'themeSource')
  ) {
    candidate.themeSource = 'user'
  }
  uiSettings = sanitizeSettings(candidate)
  writeStoredSettings(uiSettings)
  applyCssTokens(uiSettings)
  emitSettingsChange()
  return uiSettings
}

export function cyclePalette() {
  const currentIndex = PALETTES.indexOf(uiSettings.palette)
  const nextIndex = (currentIndex + 1) % PALETTES.length
  return updateUiSettings({
    palette: PALETTES[nextIndex]
  })
}

export function seasonColor(
  paletteId,
  seasonIndex,
  totalSeasons,
  themeId = uiSettings.theme
) {
  const normalizedPaletteId = normalizePaletteId(paletteId)
  const safeTotal = Math.max(totalSeasons, 1)
  const safeIndex = Math.max(0, Math.trunc(seasonIndex))
  const position = safeTotal === 1 ? 0.5 : safeIndex / safeTotal
  const themeTokens = THEME_TOKENS[themeId]

  if (normalizedPaletteId === 'monotone') {
    return themeTokens.textPrimary
  }

  if (normalizedPaletteId === 'alternating') {
    return safeIndex % 2 === 0
      ? themeTokens.textPrimary
      : themeTokens.seasonAccentMuted
  }

  const baseHue = (position * 300 + safeIndex * 17) % 360

  if (normalizedPaletteId === 'rainbow') {
    const saturation = themeId === 'dark' ? 76 : 68
    const lightness = themeId === 'dark' ? 66 : 42
    return `hsl(${baseHue} ${saturation}% ${lightness}%)`
  }

  if (normalizedPaletteId === 'zigzag') {
    const hue =
      (25 + Math.floor(safeIndex / 2) * 65 + (safeIndex % 2) * 180) % 360
    const lightness = themeId === 'dark' ? 72 : 58
    const chroma = fitChromaToSrgb(
      lightness / 100,
      hue,
      themeId === 'dark' ? 0.13 : 0.16
    )
    return `oklch(${lightness}% ${chroma} ${hue})`
  }

  if (normalizedPaletteId === 'maximin') {
    return maximinSeasonColor(themeId, safeIndex, safeTotal)
  }

  return themeTokens.textPrimary
}

function maximinSeasonColor(themeId, seasonIndex, totalSeasons) {
  const state = getMaximinPaletteState(themeId)
  const requestedCount = Math.min(
    Math.max(Math.ceil(totalSeasons), seasonIndex + 1),
    state.selected.length + state.remaining.length
  )

  while (state.selected.length < requestedCount && state.remaining.length > 0) {
    let bestIndex = 0
    let bestMinimumDistance = -Infinity
    let bestPreviousDistance = -Infinity

    state.remaining.forEach((candidate, candidateIndex) => {
      const distances = state.selected.map((selected) =>
        oklabDistanceSquared(candidate, selected)
      )
      const minimumDistance = Math.min(...distances)
      const previousDistance = distances.at(-1)

      if (
        minimumDistance > bestMinimumDistance ||
        (minimumDistance === bestMinimumDistance &&
          previousDistance > bestPreviousDistance)
      ) {
        bestIndex = candidateIndex
        bestMinimumDistance = minimumDistance
        bestPreviousDistance = previousDistance
      }
    })

    state.selected.push(state.remaining.splice(bestIndex, 1)[0])
  }

  return formatOklch(state.selected[seasonIndex % state.selected.length])
}

function getMaximinPaletteState(themeId) {
  if (MAXIMIN_PALETTE_STATE.has(themeId)) {
    return MAXIMIN_PALETTE_STATE.get(themeId)
  }

  const config = MAXIMIN_CONFIG[themeId]
  const candidates = config.lightnesses
    .flatMap((lightness) =>
      config.chromas.flatMap((chroma) =>
        Array.from({ length: 24 }, (_, index) =>
          createOklchCandidate(lightness, chroma, index * 15)
        )
      )
    )
    .filter(isInSrgbGamut)
  const seedIndex = candidates.reduce((bestIndex, candidate, index) => {
    const bestDistance = oklchParameterDistance(
      candidates[bestIndex],
      config.seed
    )
    return oklchParameterDistance(candidate, config.seed) < bestDistance
      ? index
      : bestIndex
  }, 0)
  const state = {
    selected: candidates.splice(seedIndex, 1),
    remaining: candidates
  }

  MAXIMIN_PALETTE_STATE.set(themeId, state)
  return state
}

function createOklchCandidate(lightness, chroma, hue) {
  const radians = (hue * Math.PI) / 180
  return {
    lightness,
    chroma,
    hue,
    a: chroma * Math.cos(radians),
    b: chroma * Math.sin(radians)
  }
}

function oklchParameterDistance(candidate, target) {
  const hueDistance = Math.min(
    Math.abs(candidate.hue - target.hue),
    360 - Math.abs(candidate.hue - target.hue)
  )
  return (
    Math.abs(candidate.lightness - target.lightness) +
    Math.abs(candidate.chroma - target.chroma) +
    hueDistance / 360
  )
}

function oklabDistanceSquared(left, right) {
  return (
    (left.lightness - right.lightness) ** 2 +
    (left.a - right.a) ** 2 +
    (left.b - right.b) ** 2
  )
}

function isInSrgbGamut({ lightness, a, b }) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]

  return channels.every((channel) => channel >= 0 && channel <= 1)
}

function fitChromaToSrgb(lightness, hue, targetChroma) {
  let chroma = targetChroma

  while (
    chroma > 0.04 &&
    !isInSrgbGamut(createOklchCandidate(lightness, chroma, hue))
  ) {
    chroma = Number((chroma - 0.01).toFixed(2))
  }

  return chroma
}

function formatOklch({ lightness, chroma, hue }) {
  return `oklch(${lightness * 100}% ${chroma} ${hue})`
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
