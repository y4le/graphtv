import { PALETTES, THEMES, getUiSettings, toggleTheme, updateUiSettings, cyclePalette } from '../viz/theme.js'

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
      if (event.key === 'Escape' || event.key === 'q') {
        event.preventDefault()
        close()
        return
      }

      if (
        (config.id === 'help' && (event.key === '?' || event.key === 'F1')) ||
        (config.id === 'view-options' && event.key === 'v') ||
        (config.id === 'debug' && event.key === 'D')
      ) {
        event.preventDefault()
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
    focusInitial(panel)
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
  const sections = page.kind === 'results' ? resultsHelpSections() : searchHelpSections()
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
                        <dt>${item.keys}</dt>
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

  overlayController.open({
    id: 'debug',
    title: 'Debug',
    className: 'overlay-debug',
    content: `
      <div class="debug-overlay-sections">
        ${page
          .getDebugSections()
          .map(
            (section) => `
              <section class="debug-section">
                <h3>${section.title}</h3>
                <pre>${escapeHtml(JSON.stringify(section.data, null, 2))}</pre>
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
      const currentIndex = rows.findIndex((row) => row === document.activeElement)

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        rows[Math.min(currentIndex + 1, rows.length - 1)]?.focus()
      }

      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        rows[Math.max(currentIndex - 1, 0)]?.focus()
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const row = rows[currentIndex]
        if (row?.dataset.option === 'theme') {
          toggleTheme()
        }
        if (row?.dataset.option === 'palette') {
          cyclePalette()
        }
        syncViewOptions(content)
      }

      if (event.key === 't') {
        event.preventDefault()
        toggleTheme()
        syncViewOptions(content)
      }

      if (event.key === 'c') {
        event.preventDefault()
        cyclePalette()
        syncViewOptions(content)
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
        <span class="view-option-hint">t</span>
      </div>
      <div class="view-option-row" data-option="palette" tabindex="0">
        <span class="view-option-label">Palette</span>
        <span class="view-option-values">
          ${PALETTES.map((palette) => renderValueButton('palette', palette, settings.palette === palette)).join('')}
        </span>
        <span class="view-option-hint">c</span>
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
}

function syncViewOptions(content) {
  const settings = getUiSettings()
  content.querySelectorAll('[data-view-theme]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.viewTheme === settings.theme))
  })
  content.querySelectorAll('[data-view-palette]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.viewPalette === settings.palette))
  })
}

function renderValueButton(kind, value, isActive) {
  const dataAttribute = kind === 'theme' ? `data-view-theme="${value}"` : `data-view-palette="${value}"`
  const label = value === 'monotone' ? 'Mono' : value.charAt(0).toUpperCase() + value.slice(1)
  return `<button type="button" class="view-value" ${dataAttribute} aria-pressed="${String(isActive)}">${label}</button>`
}

function resultsHelpSections() {
  return [
    {
      title: 'Global',
      items: [
        { keys: '/, q', action: 'Return to search' },
        { keys: 'v', action: 'Open view options' },
        { keys: '?, F1', action: 'Open help' },
        { keys: 'D', action: 'Toggle debug overlay' }
      ]
    },
    {
      title: 'Chart',
      items: [
        { keys: 'ArrowLeft / h', action: 'Previous episode' },
        { keys: 'ArrowRight / l', action: 'Next episode' },
        { keys: 'ArrowUp / k / b', action: 'Previous season' },
        { keys: 'ArrowDown / j / w', action: 'Next season' },
        { keys: 'Home / 0 / gg', action: 'First episode' },
        { keys: 'End / $ / G', action: 'Last episode' }
      ]
    }
  ]
}

function searchHelpSections() {
  return [
    {
      title: 'Global',
      items: [
        { keys: '/', action: 'Focus search input' },
        { keys: 'v', action: 'Open view options' },
        { keys: '?, F1', action: 'Open help' },
        { keys: 'D', action: 'Toggle debug overlay' }
      ]
    },
    {
      title: 'Results list',
      items: [
        { keys: 'ArrowDown / j', action: 'Next result' },
        { keys: 'ArrowUp / k', action: 'Previous result' },
        { keys: 'Enter / l', action: 'Open result' },
        { keys: 'Home / gg', action: 'First result' },
        { keys: 'End / G', action: 'Last result' }
      ]
    }
  ]
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
  ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden'))
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function getMotionBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
