import {
  EPISODE_DENSITIES,
  PALETTES,
  THEME_CHOICES,
  THEMES,
  getUiSettings,
  updateUiSettings,
  cyclePalette
} from '../viz/theme.js'
import { hasCommandModifier } from '../lib/keyboard.js'
import { escapeHtml } from '../lib/html.js'
import { clearApiCache } from '../data/apiCache.js'
import { resetAllAppData } from '../data/appData.js'
import { renderCreditsContent } from './credits.js'

const VIEW_OPTION_SHORTCUTS = {
  c: 'palette',
  d: 'episode-density',
  f: 'full-show-trendline',
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

export function createOverlayController() {
  const root = document.createElement('div')
  root.className = 'overlay-root'
  root.hidden = true
  document.body.appendChild(root)

  let active = null
  let previousFocus = null

  function close() {
    if (!active) {
      return
    }

    const { onClose } = active
    root.innerHTML = ''
    root.hidden = true
    active = null
    onClose?.()

    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true })
    }
  }

  function open(config) {
    previousFocus = document.activeElement
    active = config
    root.hidden = false
    root.innerHTML = `
      <div class="overlay-backdrop" data-overlay-backdrop>
        <section class="overlay-panel ${config.className ?? ''}" role="dialog" aria-modal="true" aria-labelledby="overlay-title" tabindex="-1">
          <header class="overlay-header">
            <h2 id="overlay-title" class="overlay-title">${config.title}</h2>
            <button type="button" class="overlay-close" data-overlay-close aria-label="Close overlay">${config.compactClose ? '<span aria-hidden="true">&times;</span>' : 'Close'}</button>
          </header>
          <div class="overlay-content" data-overlay-content></div>
        </section>
      </div>
    `

    const backdrop = root.querySelector('[data-overlay-backdrop]')
    const panel = root.querySelector('.overlay-panel')
    const content = root.querySelector('[data-overlay-content]')

    if (typeof config.content === 'string') {
      content.innerHTML = config.content
    } else if (config.content instanceof Node) {
      content.appendChild(config.content)
    }

    panel.addEventListener('keydown', (event) => {
      if (hasCommandModifier(event)) {
        return
      }

      if (event.key === 'Escape' || event.key === 'q') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      if (
        (config.id === 'help' && (event.key === '?' || event.key === 'F1')) ||
        (config.id === 'view-options' && event.key === 'o') ||
        (config.id === 'debug' && event.key === 'D')
      ) {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      if (event.key === 'Tab') {
        trapFocus(event, panel)
        return
      }

      config.onKeyDown?.(event, {
        panel,
        content,
        close
      })
    })

    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) {
        close()
      }
    })

    root.querySelector('[data-overlay-close]').addEventListener('click', close)
    config.onMount?.({ panel, content, close })
    if (!panel.contains(document.activeElement)) {
      focusInitial(panel)
    }
  }

  return {
    open,
    close,
    isOpen() {
      return Boolean(active)
    },
    getActiveId() {
      return active?.id ?? null
    }
  }
}

export function openHelpOverlay(overlayController, page, options = {}) {
  const sections =
    page.kind === 'results' ? resultsHelpSections() : searchHelpSections()
  const openCredits = () => {
    overlayController.close()
    openCreditsOverlay(overlayController, page)
  }

  overlayController.open({
    id: 'help',
    title: 'Keyboard shortcuts',
    className: `overlay-help overlay-help-${page.kind}`,
    compactClose: true,
    content: `
      <div class="help-sections help-sections-${page.kind}">
        ${sections
          .map(
            (section) => `
              <section class="help-section">
                <h3>${section.title}</h3>
                <dl class="help-grid">
                  ${section.items
                    .map(
                      (item) => `
                        <dt class="help-keys">${renderHelpKeys(
                          item.keys,
                          page.debugEnabled === false ? null : item.keyAction
                        )}</dt>
                        <dd>${item.action}</dd>
                      `
                    )
                    .join('')}
                </dl>
              </section>
            `
          )
          .join('')}
      </div>
      <div class="help-footer">
        <button type="button" class="help-credits-action" data-help-action="credits">
          Credits &amp; attribution <span aria-hidden="true">→</span>
        </button>
      </div>
    `,
    onMount({ content }) {
      content
        .querySelector('[data-help-action="debug"]')
        ?.addEventListener('click', () => {
          overlayController.close()
          openDebugOverlay(overlayController, page)
        })
      const creditsAction = content.querySelector(
        '[data-help-action="credits"]'
      )
      creditsAction.addEventListener('click', openCredits)
      if (options.focusCreditsAction) {
        creditsAction.focus({ preventScroll: true })
      }
    },
    onKeyDown(event, { content }) {
      if (event.key === 'a' || event.key === 'c') {
        event.preventDefault()
        event.stopPropagation()
        openCredits()
        return
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        content.scrollBy({ top: 56, behavior: getMotionBehavior() })
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        content.scrollBy({ top: -56, behavior: getMotionBehavior() })
      }
    }
  })
}

export function openCreditsOverlay(overlayController, page) {
  overlayController.open({
    id: 'credits',
    title: 'Credits & attribution',
    className: 'overlay-credits',
    compactClose: true,
    content: renderCreditsContent(page),
    onMount({ content }) {
      const backButton = content.querySelector('[data-credits-back]')
      backButton.addEventListener('click', () => {
        overlayController.close()
        openHelpOverlay(overlayController, page, { focusCreditsAction: true })
      })
      backButton.focus({ preventScroll: true })
    },
    onKeyDown(event, { content }) {
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        content.scrollBy({ top: 56, behavior: getMotionBehavior() })
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        content.scrollBy({ top: -56, behavior: getMotionBehavior() })
      }
    }
  })
}

export function openDebugOverlay(overlayController, page, options = {}) {
  if (!page.debugEnabled) {
    return
  }

  const sections = page.getDebugSections()
  const clearCaches = options.clearCaches ?? clearApiCache
  const fullReset = options.fullReset ?? resetAllAppData
  const confirmFullReset =
    options.confirmFullReset ??
    (() =>
      window.confirm(
        'Reset graphtv? This clears provider caches, view settings, request history, and all other graphtv data stored in this browser. This cannot be undone.'
      ))
  const reloadPage = options.reloadPage ?? (() => window.location.reload())

  overlayController.open({
    id: 'debug',
    title: 'Debug',
    className: 'overlay-debug',
    content: `
      <div class="debug-data-actions" aria-label="Debug data actions">
        <div class="debug-data-action">
          <button type="button" class="debug-cache-button" data-debug-clear-caches>Clear caches</button>
          <p>Clear cached provider responses and reload. View settings are kept.</p>
        </div>
        <div class="debug-data-action">
          <button type="button" class="debug-cache-button" data-debug-full-reset>Full reset</button>
          <p>Clear every graphtv setting and stored value, then reload. Requires confirmation.</p>
        </div>
        <p class="debug-cache-status" data-debug-cache-status role="status" aria-live="polite"></p>
      </div>
      <div class="debug-overlay-sections">
        ${sections
          .map(
            (section, index) => `
              <section class="debug-section">
                <div class="debug-section-header">
                  <h3>${section.title}</h3>
                  ${renderRawJsonLink(section)}
                </div>
                ${renderDebugSection(section, index)}
              </section>
            `
          )
          .join('')}
      </div>
    `,
    onMount({ content }) {
      hydrateDebugTrees(content, sections)
      bindDebugDataActions(content, {
        clearCaches,
        confirmFullReset,
        fullReset,
        reloadPage
      })
    },
    onKeyDown(event, { content }) {
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        content.scrollBy({ top: 56, behavior: getMotionBehavior() })
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        content.scrollBy({ top: -56, behavior: getMotionBehavior() })
      }
    }
  })
}

function bindDebugDataActions(
  content,
  { clearCaches, confirmFullReset, fullReset, reloadPage }
) {
  const buttons = Array.from(content.querySelectorAll('.debug-cache-button'))
  const clearButton = content.querySelector('[data-debug-clear-caches]')
  const resetButton = content.querySelector('[data-debug-full-reset]')
  const status = content.querySelector('[data-debug-cache-status]')

  async function runAction(button, action, pendingMessage, successMessage) {
    buttons.forEach((item) => {
      item.disabled = true
    })
    button.textContent = 'Clearing…'
    status.dataset.state = 'pending'
    status.textContent = pendingMessage

    try {
      await action()
      button.textContent = successMessage
      status.dataset.state = 'success'
      status.textContent = `${successMessage}. Reloading…`
      reloadPage()
    } catch (error) {
      buttons.forEach((item) => {
        item.disabled = false
      })
      clearButton.textContent = 'Clear caches'
      resetButton.textContent = 'Full reset'
      status.dataset.state = 'error'
      status.textContent = `Could not clear browser data: ${error?.message ?? String(error)}`
    }
  }

  clearButton.addEventListener('click', () =>
    runAction(
      clearButton,
      clearCaches,
      'Clearing cached provider responses…',
      'Caches cleared'
    )
  )

  resetButton.addEventListener('click', () => {
    if (!confirmFullReset()) {
      return
    }

    return runAction(
      resetButton,
      fullReset,
      'Resetting all graphtv browser data…',
      'Full reset complete'
    )
  })
}

function renderDebugSection(section, index) {
  if (section.title === 'Provider catalog' && Array.isArray(section.data)) {
    return renderProviderCatalogTable(section.data)
  }

  return `<div class="debug-json-tree" data-debug-tree-index="${index}"></div>`
}

function renderRawJsonLink(section) {
  if (!isRawJsonSection(section)) {
    return ''
  }

  const href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(section.data, null, 2))}`

  return `<a class="debug-raw-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">raw</a>`
}

function isRawJsonSection(section) {
  return (
    section.title === 'Provider diagnostics' ||
    section.title === 'Merged bundle'
  )
}

function renderProviderCatalogTable(rows) {
  const columns = [
    { key: 'provider', label: 'Provider' },
    {
      key: 'configured',
      label: 'Status',
      format: (value) => (value ? 'configured' : 'missing')
    },
    { key: 'access', label: 'Access' },
    {
      key: 'requirement',
      label: 'Requirement',
      format: (value) => value || 'none'
    }
  ]

  return `
    <div class="debug-provider-table" role="table" aria-label="Provider settings">
      <div class="debug-provider-row debug-provider-row-header" role="row">
        ${columns
          .map(
            (column) =>
              `<span class="debug-provider-cell" role="columnheader">${column.label}</span>`
          )
          .join('')}
      </div>
      ${rows
        .map(
          (row) => `
            <div class="debug-provider-row" role="row">
              ${columns
                .map((column) => {
                  const rawValue = row[column.key]
                  const value = column.format
                    ? column.format(rawValue, row)
                    : rawValue
                  return `<span class="debug-provider-cell" role="cell">${escapeHtml(String(value))}</span>`
                })
                .join('')}
            </div>
          `
        )
        .join('')}
    </div>
  `
}

function hydrateDebugTrees(content, sections) {
  content.querySelectorAll('[data-debug-tree-index]').forEach((root) => {
    const index = Number(root.dataset.debugTreeIndex)
    const section = sections[index]
    const shouldOpen =
      section.title === 'Provider diagnostics' ||
      section.title === 'Merged bundle'
    root.replaceChildren(createJsonNode(section.data, 0, shouldOpen))
  })
}

function createJsonNode(value, depth, shouldOpen = false, keyLabel = null) {
  if (Array.isArray(value)) {
    return createJsonBranchNode({
      keyLabel,
      summary: `Array(${value.length})`,
      depth,
      shouldOpen,
      entries: value.map((item, index) => [String(index), item])
    })
  }

  if (value && typeof value === 'object') {
    return createJsonBranchNode({
      keyLabel,
      summary: `Object(${Object.keys(value).length})`,
      depth,
      shouldOpen,
      entries: Object.entries(value)
    })
  }

  const leaf = document.createElement('div')
  leaf.className = 'debug-json-leaf'
  leaf.style.setProperty('--debug-depth', depth)

  if (keyLabel !== null) {
    leaf.appendChild(createJsonTextSpan('debug-json-key', `${keyLabel}:`))
  }

  leaf.appendChild(
    createJsonTextSpan('debug-json-value', formatJsonValue(value))
  )
  return leaf
}

function createJsonBranchNode({
  keyLabel,
  summary,
  depth,
  shouldOpen,
  entries
}) {
  const details = document.createElement('details')
  details.className = 'debug-json-branch'
  details.style.setProperty('--debug-depth', depth)
  details.open = shouldOpen

  const summaryNode = document.createElement('summary')
  summaryNode.className = 'debug-json-summary'
  if (keyLabel !== null) {
    summaryNode.appendChild(
      createJsonTextSpan('debug-json-key', `${keyLabel}:`)
    )
  }
  summaryNode.appendChild(createJsonTextSpan('debug-json-meta', summary))
  details.appendChild(summaryNode)

  const childrenNode = document.createElement('div')
  childrenNode.className = 'debug-json-children'
  details.appendChild(childrenNode)

  let populated = false
  const populate = () => {
    if (populated) {
      return
    }
    populated = true
    progressivelyAppendJsonChildren(childrenNode, entries, depth + 1)
  }

  if (shouldOpen) {
    populate()
  } else {
    details.addEventListener(
      'toggle',
      () => {
        if (details.open) {
          populate()
        }
      },
      { once: true }
    )
  }

  return details
}

function progressivelyAppendJsonChildren(container, entries, depth) {
  const queue = [...entries]

  function appendChunk() {
    const fragment = document.createDocumentFragment()
    let remaining = 40

    while (queue.length > 0 && remaining > 0) {
      const [key, value] = queue.shift()
      fragment.appendChild(createJsonNode(value, depth, false, key))
      remaining -= 1
    }

    container.appendChild(fragment)

    if (queue.length > 0) {
      requestAnimationFrame(appendChunk)
    }
  }

  appendChunk()
}

function createJsonTextSpan(className, text) {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
}

function formatJsonValue(value) {
  if (typeof value === 'string') {
    return `"${value}"`
  }

  if (value === null) {
    return 'null'
  }

  return String(value)
}

export function openViewOptionsOverlay(overlayController) {
  overlayController.open({
    id: 'view-options',
    title: 'View options',
    className: 'overlay-view-options',
    content: renderViewOptionsContent(),
    onMount({ content }) {
      bindViewOptions(content)
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
        if (!event.repeat) {
          activateViewOption(rows[currentIndex]?.dataset.option)
        }
        syncViewOptions(content)
        return
      }

      const option = VIEW_OPTION_SHORTCUTS[event.key]
      if (option) {
        event.preventDefault()
        const row = content.querySelector(`[data-option="${option}"]`)
        row?.focus()
        if (!event.repeat) {
          activateViewOption(option)
          syncViewOptions(content)
        }
      }
    }
  })
}

function renderViewOptionsContent() {
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
    </div>
  `
}

function bindViewOptions(content) {
  bindViewOptionInfo(content)

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

function resultsHelpSections() {
  return [
    {
      title: 'Global',
      items: [
        { keys: ['/', 'q'], action: 'Return to search' },
        { keys: ['o'], action: 'Open view options' },
        { keys: ['?', 'F1'], action: 'Open help' },
        {
          keys: ['D'],
          action: 'Toggle debug overlay',
          keyAction: 'debug'
        }
      ]
    },
    {
      title: 'Chart navigation',
      items: [
        { keys: ['ArrowLeft', 'h'], action: 'Previous episode' },
        { keys: ['ArrowRight', 'l'], action: 'Next episode' },
        { keys: ['ArrowUp', 'k'], action: 'Previous season or trendline' },
        { keys: ['ArrowDown', 'j'], action: 'Next season or trendline' },
        { keys: ['Home', 'gg'], action: 'First episode' },
        { keys: ['End', 'G'], action: 'Last episode' }
      ]
    },
    {
      title: 'Viewport',
      items: [
        { keys: ['Ctrl-U'], action: 'Pan back half a viewport' },
        { keys: ['Ctrl-D'], action: 'Pan forward half a viewport' },
        { keys: ['f'], action: 'Fit entire series' },
        { keys: ['r'], action: 'Reset zoom' },
        { keys: ['-'], action: 'Zoom out' },
        { keys: ['=', '+'], action: 'Zoom in' }
      ]
    },
    {
      title: 'Trend selection',
      items: [
        { keys: ['t'], action: 'Select full-series trend' },
        {
          keys: ['b'],
          action: 'Select best breakpoint (ignores confidence threshold)'
        },
        {
          keys: ['T'],
          action: 'Select current season / reset to first available'
        },
        { keys: ['Escape'], action: 'Clear chart selection' }
      ]
    }
  ]
}

function searchHelpSections() {
  return [
    {
      title: 'Global',
      items: [
        { keys: ['/'], action: 'Focus search input' },
        { keys: ['o'], action: 'Open view options' },
        { keys: ['?', 'F1'], action: 'Open help' },
        {
          keys: ['D'],
          action: 'Toggle debug overlay',
          keyAction: 'debug'
        }
      ]
    },
    {
      title: 'Results list',
      items: [
        { keys: ['ArrowDown', 'j'], action: 'Next result' },
        { keys: ['ArrowUp', 'k'], action: 'Previous result' },
        { keys: ['Enter', 'l'], action: 'Open result' },
        { keys: ['Home', 'gg'], action: 'First result' },
        { keys: ['End', 'G'], action: 'Last result' }
      ]
    }
  ]
}

function renderHelpKeys(keys, keyAction = null) {
  const labels = {
    ArrowDown: { glyph: '↓', name: 'Down arrow' },
    ArrowLeft: { glyph: '←', name: 'Left arrow' },
    ArrowRight: { glyph: '→', name: 'Right arrow' },
    ArrowUp: { glyph: '↑', name: 'Up arrow' }
  }

  return keys
    .map((key) => {
      const label = labels[key]
      const accessibleName = label
        ? ` aria-label="${label.name}" title="${label.name}"`
        : ''

      if (keyAction === 'debug' && key === 'D') {
        return '<button type="button" class="help-key shortcut-action keycap" data-help-action="debug" aria-label="Open debug menu">D</button>'
      }

      return `<kbd class="help-key keycap"${accessibleName}>${escapeHtml(label?.glyph ?? key)}</kbd>`
    })
    .join('<span class="help-key-separator" aria-hidden="true">/</span>')
}

function focusInitial(panel) {
  const focusable = getFocusable(panel)
  ;(focusable[0] ?? panel).focus({ preventScroll: true })
}

function trapFocus(event, panel) {
  const focusable = getFocusable(panel)
  if (focusable.length === 0) {
    event.preventDefault()
    panel.focus({ preventScroll: true })
    return
  }

  const currentIndex = focusable.indexOf(document.activeElement)
  const direction = event.shiftKey ? -1 : 1
  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + direction + focusable.length) % focusable.length

  event.preventDefault()
  focusable[nextIndex].focus({ preventScroll: true })
}

function getFocusable(root) {
  return Array.from(
    root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden')
  )
}

function getMotionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}
