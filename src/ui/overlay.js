import {
  PALETTES,
  THEMES,
  getUiSettings,
  toggleTheme,
  updateUiSettings,
  cyclePalette
} from '../viz/theme.js'
import { hasCommandModifier } from '../lib/keyboard.js'

const VIEW_OPTION_SHORTCUTS = {
  c: 'palette',
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
            <button type="button" class="overlay-close" data-overlay-close aria-label="Close overlay">Close</button>
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
        (config.id === 'view-options' && event.key === 'v') ||
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

export function openHelpOverlay(overlayController, page) {
  const sections =
    page.kind === 'results' ? resultsHelpSections() : searchHelpSections()
  overlayController.open({
    id: 'help',
    title: 'Keyboard help',
    className: 'overlay-help',
    content: `
      <div class="help-sections">
        ${sections
          .map(
            (section) => `
              <section class="help-section">
                <h3>${section.title}</h3>
                <dl class="help-grid">
                  ${section.items
                    .map(
                      (item) => `
                        <dt class="help-keys">${renderHelpKeys(item.keys)}</dt>
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
    `,
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

export function openDebugOverlay(overlayController, page) {
  if (!page.debugEnabled) {
    return
  }

  const sections = page.getDebugSections()

  overlayController.open({
    id: 'debug',
    title: 'Debug',
    className: 'overlay-debug',
    content: `
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

  return `<a class="debug-raw-link" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">raw</a>`
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
          ${THEMES.map((theme) => renderValueButton('theme', theme, settings.theme === theme)).join('')}
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
        <span class="view-option-label">Rating source spread</span>
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
  content.querySelectorAll('[data-view-theme]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      updateUiSettings({ theme: button.dataset.viewTheme })
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
      String(button.dataset.viewTheme === settings.theme)
    )
  })
  content.querySelectorAll('[data-view-palette]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.viewPalette === settings.palette)
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
      : `data-view-palette="${value}"`
  const label =
    value === 'monotone'
      ? 'Mono'
      : value.charAt(0).toUpperCase() + value.slice(1)
  return `<button type="button" class="view-value" ${dataAttribute} aria-pressed="${String(isActive)}">${label}</button>`
}

function renderToggleButtons(settingKey, isEnabled) {
  return [
    renderToggleButton(settingKey, true, isEnabled),
    renderToggleButton(settingKey, false, !isEnabled)
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
    toggleTheme()
    return
  }

  if (option === 'palette') {
    cyclePalette()
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
    updateUiSettings({ theme: stepValue(THEMES, settings.theme, direction) })
    return
  }

  if (option === 'palette') {
    updateUiSettings({
      palette: stepValue(PALETTES, settings.palette, direction)
    })
    return
  }

  const settingKey = VIEW_OPTION_SETTING_KEYS[option]
  if (settingKey) {
    updateUiSettings({ [settingKey]: direction > 0 })
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
        { keys: ['v'], action: 'Open view options' },
        { keys: ['?', 'F1'], action: 'Open help' },
        { keys: ['D'], action: 'Toggle debug overlay' }
      ]
    },
    {
      title: 'Chart navigation',
      items: [
        { keys: ['ArrowLeft', 'h'], action: 'Previous episode' },
        { keys: ['ArrowRight', 'l'], action: 'Next episode' },
        { keys: ['ArrowUp', 'k'], action: 'Previous season' },
        { keys: ['ArrowDown', 'j'], action: 'Next season' },
        { keys: ['Home', 'gg'], action: 'First episode' },
        { keys: ['End', 'G'], action: 'Last episode' }
      ]
    },
    {
      title: 'Viewport',
      items: [
        { keys: ['f'], action: 'Fit entire series' },
        { keys: ['r'], action: 'Reset zoom' },
        { keys: ['-'], action: 'Zoom out' },
        { keys: ['=', '+'], action: 'Zoom in' }
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
        { keys: ['v'], action: 'Open view options' },
        { keys: ['?', 'F1'], action: 'Open help' },
        { keys: ['D'], action: 'Toggle debug overlay' }
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

function renderHelpKeys(keys) {
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

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', '&quot;')
}

function getMotionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}
