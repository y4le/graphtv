import { hasCommandModifier } from '../lib/keyboard.js'

export function createOverlayController() {
  const root = document.createElement('div')
  root.className = 'overlay-root'
  root.hidden = true
  document.body.appendChild(root)

  let active = null
  let previousFocus = null
  let backgroundState = null
  let destroyed = false

  function lockBackground() {
    const app = document.querySelector('#app')
    backgroundState = {
      app,
      appWasInert: app?.hasAttribute('inert') ?? false,
      bodyOverflow: document.body.style.overflow
    }
    app?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
  }

  function unlockBackground() {
    if (!backgroundState) {
      return
    }

    const { app, appWasInert, bodyOverflow } = backgroundState
    backgroundState = null
    if (app?.isConnected && !appWasInert) {
      app.removeAttribute('inert')
    }
    document.body.style.overflow = bodyOverflow
  }

  function close() {
    if (!active) {
      return
    }

    const { onClose } = active
    const focusTarget = previousFocus
    root.innerHTML = ''
    root.hidden = true
    active = null
    previousFocus = null
    unlockBackground()

    try {
      onClose?.()
    } finally {
      if (
        !active &&
        focusTarget instanceof HTMLElement &&
        focusTarget.isConnected
      ) {
        focusTarget.focus({ preventScroll: true })
      }
    }
  }

  function open(config) {
    if (destroyed) {
      throw new Error('Cannot open a destroyed overlay controller.')
    }
    if (active) {
      close()
    }

    previousFocus = document.activeElement
    active = config
    lockBackground()
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
    },
    destroy() {
      if (destroyed) {
        return
      }

      destroyed = true
      const { onClose } = active ?? {}
      active = null
      previousFocus = null
      unlockBackground()
      root.remove()
      onClose?.()
    }
  }
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
