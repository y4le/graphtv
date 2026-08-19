import {
  EPISODE_DENSITIES,
  PALETTES,
  THEME_CHOICES,
  THEMES,
  getUiSettings,
  updateUiSettings,
  cyclePalette
} from '../viz/theme.js'
import '../../css/overlays.css'

const VIEW_OPTION_SHORTCUTS = {
  c: 'palette',
  d: 'episode-density',
  f: 'full-show-trendline',
  m: 'mark-density',
  r: 'source-spread',
  s: 'season-trendlines',
  t: 'theme',
  y: 'absolute-y-axis'
}

const VIEW_OPTION_SETTING_KEYS = {
  'absolute-y-axis': 'absoluteYAxis',
  'full-show-trendline': 'fullShowTrendline',
  'season-trendlines': 'seasonTrendlines',
  'source-spread': 'showSourceSpread'
}

export function openViewOptionsOverlay(overlayController, options = {}) {
  const { onOpenMarkDensity = null } = options
  const activate = (option) => {
    if (option === 'mark-density') {
      onOpenMarkDensity?.()
      return
    }
    activateViewOption(option)
  }

  overlayController.open({
    id: 'view-options',
    title: 'View options',
    className: 'overlay-view-options',
    content: renderViewOptionsContent({
      markDensity: Boolean(onOpenMarkDensity)
    }),
    onMount({ content }) {
      bindViewOptions(content, { onOpenMarkDensity })
      syncViewOptions(content)
      content.querySelector('.view-option-row')?.focus()
    },
    onKeyDown(event, { content }) {
      if (event.target.closest?.('[data-view-option-info]')) {
        return
      }

      const rows = Array.from(content.querySelectorAll('.view-option-row'))
      const focusedRow = document.activeElement?.closest?.('.view-option-row')
      const currentIndex = rows.indexOf(focusedRow)

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        rows[Math.min(currentIndex + 1, rows.length - 1)]?.focus()
        return
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        rows[Math.max(currentIndex - 1, 0)]?.focus()
        return
      }

      if (event.key === 'h' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setViewOptionDirection(rows[currentIndex]?.dataset.option, -1)
        syncViewOptions(content)
        return
      }

      if (event.key === 'l' || event.key === 'ArrowRight') {
        event.preventDefault()
        setViewOptionDirection(rows[currentIndex]?.dataset.option, 1)
        syncViewOptions(content)
        return
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) {
          activate(rows[currentIndex]?.dataset.option)
        }
        if (overlayController.getActiveId() === 'view-options') {
          syncViewOptions(content)
        }
        return
      }

      const option = VIEW_OPTION_SHORTCUTS[event.key]
      const row = option
        ? content.querySelector(`[data-option="${option}"]`)
        : null
      if (row) {
        event.preventDefault()
        event.stopPropagation()
        row.focus()
        if (!event.repeat) {
          activate(option)
          if (overlayController.getActiveId() === 'view-options') {
            syncViewOptions(content)
          }
        }
      }
    }
  })
}

function renderViewOptionsContent({ markDensity = false } = {}) {
  const settings = getUiSettings()

  return `
    <div class="view-options-list">
      <div class="view-option-row" data-option="theme" tabindex="0">
        <span class="view-option-label">Theme</span>
        <span class="view-option-values">
          ${THEME_CHOICES.map((theme) => renderValueButton('theme', theme, getThemeChoice(settings) === theme)).join('')}
        </span>
        <kbd class="view-option-hint keycap">t</kbd>
      </div>
      <div class="view-option-row" data-option="palette" tabindex="0">
        <span class="view-option-label">Palette</span>
        <span class="view-option-values">
          ${PALETTES.map((palette) => renderValueButton('palette', palette, settings.palette === palette)).join('')}
        </span>
        <kbd class="view-option-hint keycap">c</kbd>
      </div>
      <div class="view-option-row" data-option="episode-density" tabindex="0">
        ${renderViewOptionLabel(
          'Episode density',
          'Sets how tightly episodes can be packed in the default view. Shows with only a few episodes are shown in full, so this setting will not affect them.',
          'view-option-episode-density-info'
        )}
        <span class="view-option-values">
          ${EPISODE_DENSITIES.map((density) => renderValueButton('episodeDensity', density, settings.episodeDensity === density)).join('')}
        </span>
        <kbd class="view-option-hint keycap">d</kbd>
      </div>
      <div class="view-option-row" data-option="season-trendlines" tabindex="0">
        <span class="view-option-label">Season trendlines</span>
        <span class="view-option-values">
          ${renderToggleButtons('seasonTrendlines', settings.seasonTrendlines)}
        </span>
        <kbd class="view-option-hint keycap">s</kbd>
      </div>
      <div class="view-option-row" data-option="full-show-trendline" tabindex="0">
        <span class="view-option-label">Full-show trendline</span>
        <span class="view-option-values">
          ${renderToggleButtons('fullShowTrendline', settings.fullShowTrendline)}
        </span>
        <kbd class="view-option-hint keycap">f</kbd>
      </div>
      <div class="view-option-row" data-option="source-spread" tabindex="0">
        ${renderViewOptionLabel(
          'Rating source spread',
          'When an episode has ratings from multiple sources, such as IMDb and TMDB, a vertical mark shows the range between their scores. Turn this off to show only the score used for the episode point.',
          'view-option-source-spread-info'
        )}
        <span class="view-option-values">
          ${renderToggleButtons('showSourceSpread', settings.showSourceSpread)}
        </span>
        <kbd class="view-option-hint keycap">r</kbd>
      </div>
      <div class="view-option-row" data-option="absolute-y-axis" tabindex="0">
        <span class="view-option-label">Absolute y-axis (0–10)</span>
        <span class="view-option-values">
          ${renderToggleButtons('absoluteYAxis', settings.absoluteYAxis)}
        </span>
        <kbd class="view-option-hint keycap">y</kbd>
      </div>
      ${
        markDensity
          ? `
      <div class="view-option-row" data-option="mark-density" tabindex="0">
        ${renderViewOptionLabel(
          'Mark scaling',
          'Opens a panel below the chart for tuning how point size and line width scale with episode spacing. The chart stays interactive while it is open.',
          'view-option-mark-density-info'
        )}
        <span class="view-option-values">
          <button type="button" class="view-value" data-view-mark-density>Open panel</button>
        </span>
        <kbd class="view-option-hint keycap">m</kbd>
      </div>`
          : ''
      }
    </div>
  `
}

function bindViewOptions(content, { onOpenMarkDensity = null } = {}) {
  bindViewOptionInfo(content)

  content
    .querySelector('[data-view-mark-density]')
    ?.addEventListener('click', (event) => {
      event.stopPropagation()
      onOpenMarkDensity?.()
    })

  content.querySelectorAll('[data-view-theme]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      selectThemeChoice(button.dataset.viewTheme)
      syncViewOptions(content)
    })
  })

  content.querySelectorAll('[data-view-palette]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      updateUiSettings({ palette: button.dataset.viewPalette })
      syncViewOptions(content)
    })
  })

  content.querySelectorAll('[data-view-episode-density]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      updateUiSettings({
        episodeDensity: button.dataset.viewEpisodeDensity
      })
      syncViewOptions(content)
    })
  })

  content.querySelectorAll('[data-view-toggle]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const key = button.dataset.viewToggle
      const value = button.dataset.viewToggleValue === 'true'
      updateUiSettings({ [key]: value })
      syncViewOptions(content)
    })
  })
}

function syncViewOptions(content) {
  const settings = getUiSettings()
  content.querySelectorAll('[data-view-theme]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.viewTheme === getThemeChoice(settings))
    )
  })
  content.querySelectorAll('[data-view-palette]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.viewPalette === settings.palette)
    )
  })
  content.querySelectorAll('[data-view-episode-density]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.viewEpisodeDensity === settings.episodeDensity)
    )
  })
  content.querySelectorAll('[data-view-toggle]').forEach((button) => {
    const key = button.dataset.viewToggle
    const value = button.dataset.viewToggleValue === 'true'
    button.setAttribute(
      'aria-pressed',
      String(Boolean(settings[key]) === value)
    )
  })
}

function renderValueButton(kind, value, isActive) {
  const dataAttribute =
    kind === 'theme'
      ? `data-view-theme="${value}"`
      : kind === 'palette'
        ? `data-view-palette="${value}"`
        : `data-view-episode-density="${value}"`
  const label = formatViewValueLabel(value)
  return `<button type="button" class="view-value" ${dataAttribute} aria-pressed="${String(isActive)}">${label}</button>`
}

function formatViewValueLabel(value) {
  if (value === 'monotone') {
    return 'Mono'
  }
  if (value === 'all') {
    return 'Full series'
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function renderViewOptionLabel(label, tooltip = null, tooltipId = null) {
  if (!tooltip) {
    return `<span class="view-option-label">${label}</span>`
  }

  return `
    <span class="view-option-label">
      <span>${label}</span>
      <span class="view-option-info-control">
        <button type="button" class="view-option-info-button" data-view-option-info aria-label="Explain ${label.toLowerCase()}" aria-expanded="false" aria-controls="${tooltipId}" aria-describedby="${tooltipId}">ⓘ</button>
        <span class="view-option-info-tooltip" id="${tooltipId}" role="tooltip" hidden>${tooltip}</span>
      </span>
    </span>
  `
}

function bindViewOptionInfo(content) {
  const controls = Array.from(
    content.querySelectorAll('.view-option-info-control')
  )

  function sync(control) {
    const expanded =
      control.dataset.dismissed !== 'true' &&
      ['hovered', 'focused', 'pinned'].some(
        (state) => control.dataset[state] === 'true'
      )
    const button = control.querySelector('[data-view-option-info]')
    button.setAttribute('aria-expanded', String(expanded))
    control.querySelector('[role="tooltip"]').hidden = !expanded
  }

  function dismiss(control) {
    control.dataset.hovered = 'false'
    control.dataset.focused = 'false'
    control.dataset.pinned = 'false'
    control.dataset.dismissed = 'true'
    sync(control)
  }

  controls.forEach((control) => {
    const button = control.querySelector('[data-view-option-info]')

    control.addEventListener('mouseenter', () => {
      control.dataset.hovered = 'true'
      control.dataset.dismissed = 'false'
      sync(control)
    })
    control.addEventListener('mouseleave', () => {
      control.dataset.hovered = 'false'
      sync(control)
    })
    button.addEventListener('focus', () => {
      control.dataset.focused = 'true'
      control.dataset.dismissed = 'false'
      sync(control)
    })
    button.addEventListener('blur', () => {
      control.dataset.focused = 'false'
      sync(control)
    })
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const pinned = control.dataset.pinned === 'true'
      control.dataset.pinned = String(!pinned)
      control.dataset.dismissed = String(pinned)
      sync(control)
    })
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      dismiss(control)
    })
  })

  content.addEventListener(
    'click',
    (event) => {
      controls.forEach((control) => {
        if (!control.contains(event.target)) {
          dismiss(control)
        }
      })
    },
    true
  )
}

function renderToggleButtons(settingKey, isEnabled) {
  return [
    renderToggleButton(settingKey, false, !isEnabled),
    renderToggleButton(settingKey, true, isEnabled)
  ].join('')
}

function renderToggleButton(settingKey, value, isActive) {
  return `<button type="button" class="view-value" data-view-toggle="${settingKey}" data-view-toggle-value="${String(value)}" aria-pressed="${String(isActive)}">${value ? 'On' : 'Off'}</button>`
}

function toggleSetting(key) {
  const settings = getUiSettings()
  updateUiSettings({ [key]: !settings[key] })
}

function activateViewOption(option) {
  if (option === 'theme') {
    const settings = getUiSettings()
    selectThemeChoice(stepValue(THEME_CHOICES, getThemeChoice(settings), 1))
    return
  }

  if (option === 'palette') {
    cyclePalette()
    return
  }

  if (option === 'episode-density') {
    updateUiSettings({
      episodeDensity: stepValue(
        EPISODE_DENSITIES,
        getUiSettings().episodeDensity,
        1
      )
    })
    return
  }

  const settingKey = VIEW_OPTION_SETTING_KEYS[option]
  if (settingKey) {
    toggleSetting(settingKey)
  }
}

function setViewOptionDirection(option, direction) {
  const settings = getUiSettings()

  if (option === 'theme') {
    selectThemeChoice(
      stepValue(THEME_CHOICES, getThemeChoice(settings), direction)
    )
    return
  }

  if (option === 'palette') {
    updateUiSettings({
      palette: stepValue(PALETTES, settings.palette, direction)
    })
    return
  }

  if (option === 'episode-density') {
    updateUiSettings({
      episodeDensity: stepValue(
        EPISODE_DENSITIES,
        settings.episodeDensity,
        direction
      )
    })
    return
  }

  const settingKey = VIEW_OPTION_SETTING_KEYS[option]
  if (settingKey) {
    updateUiSettings({ [settingKey]: direction > 0 })
  }
}

function getThemeChoice(settings) {
  return settings.themeSource === 'system' ? 'system' : settings.theme
}

function selectThemeChoice(choice) {
  if (choice === 'system') {
    updateUiSettings({ themeSource: 'system' })
    return
  }

  if (THEMES.includes(choice)) {
    updateUiSettings({ theme: choice, themeSource: 'user' })
  }
}

function stepValue(values, currentValue, direction) {
  const currentIndex = Math.max(values.indexOf(currentValue), 0)
  return values[(currentIndex + direction + values.length) % values.length]
}
