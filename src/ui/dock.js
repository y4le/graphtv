import { hasCommandModifier, isEditableElement } from '../lib/keyboard.js'

// A dock is a non-modal panel pinned to the bottom of the viewport. Unlike an
// overlay it never makes the page inert or traps focus, so the chart stays
// readable and interactive while the panel is open. Only one dock is open at
// a time; opening another replaces it.
export function createDockController() {
  const root = document.createElement('div')
  root.className = 'dock-root'
  root.hidden = true
  root.dataset.keyboardLocal = ''
  document.body.appendChild(root)

  let active = null
  let previousFocus = null
  let destroyed = false
  let resizeObserver = null

  function publishHeight(height) {
    document.documentElement.style.setProperty(
      '--dock-height',
      `${Math.max(0, Math.round(height))}px`
    )
  }

  function clearHeight() {
    document.documentElement.style.removeProperty('--dock-height')
  }

  function observeHeight(panel) {
    resizeObserver?.disconnect()
    resizeObserver = null

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() =>
        publishHeight(root.offsetHeight)
      )
      resizeObserver.observe(panel)
    }
    publishHeight(root.offsetHeight)
  }

  function close() {
    if (!active) {
      return
    }

    const { onClose } = active
    const focusWasInside = root.contains(document.activeElement)
    const focusTarget = previousFocus
    resizeObserver?.disconnect()
    resizeObserver = null
    root.innerHTML = ''
    root.hidden = true
    root.classList.remove('is-open')
    active = null
    previousFocus = null
    clearHeight()

    try {
      onClose?.()
    } finally {
      if (
        focusWasInside &&
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
      throw new Error('Cannot open a destroyed dock controller.')
    }
    if (active) {
      close()
    }

    previousFocus = document.activeElement
    active = config
    root.hidden = false
    root.classList.add('is-open')
    root.innerHTML = `
      <section class="dock-panel ${config.className ?? ''}" role="region" aria-labelledby="dock-title" tabindex="-1">
        <header class="dock-header">
          <h2 id="dock-title" class="dock-title">${config.title}</h2>
          ${config.subtitle ? `<p class="dock-subtitle">${config.subtitle}</p>` : ''}
          <div class="dock-header-actions" data-dock-actions></div>
          <button type="button" class="dock-close" data-dock-close aria-label="Close ${config.title.toLowerCase()} panel"><span aria-hidden="true">&times;</span></button>
        </header>
        <div class="dock-content" data-dock-content></div>
      </section>
    `

    const panel = root.querySelector('.dock-panel')
    const content = root.querySelector('[data-dock-content]')
    const actions = root.querySelector('[data-dock-actions]')

    if (typeof config.content === 'string') {
      content.innerHTML = config.content
    } else if (config.content instanceof Node) {
      content.appendChild(config.content)
    }

    if (typeof config.actions === 'string') {
      actions.innerHTML = config.actions
    } else if (config.actions instanceof Node) {
      actions.appendChild(config.actions)
    }

    panel.addEventListener('keydown', (event) => {
      if (hasCommandModifier(event)) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      // Range inputs and buttons ignore letters, so the toggle key can close
      // the panel from inside it. Text fields keep their letters.
      if (
        config.toggleKey &&
        event.key === config.toggleKey &&
        !isTextEntryElement(event.target)
      ) {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      config.onKeyDown?.(event, { panel, content, close })
    })

    root.querySelector('[data-dock-close]').addEventListener('click', close)
    observeHeight(panel)
    config.onMount?.({ panel, content, actions, close })
    if (!panel.contains(document.activeElement)) {
      focusInitial(content, panel)
    }
  }

  function toggle(config) {
    if (active?.id === config.id) {
      close()
      return false
    }

    open(config)
    return true
  }

  return {
    open,
    close,
    toggle,
    isOpen() {
      return Boolean(active)
    },
    getActiveId() {
      return active?.id ?? null
    },
    contains(node) {
      return root.contains(node)
    },
    destroy() {
      if (destroyed) {
        return
      }

      destroyed = true
      const { onClose } = active ?? {}
      active = null
      previousFocus = null
      resizeObserver?.disconnect()
      resizeObserver = null
      clearHeight()
      root.remove()
      onClose?.()
    }
  }
}

function isTextEntryElement(element) {
  if (!isEditableElement(element)) {
    return false
  }

  if (element.tagName.toLowerCase() !== 'input') {
    return true
  }

  return !['range', 'checkbox', 'radio', 'button'].includes(element.type)
}

function focusInitial(content, panel) {
  const focusable = Array.from(
    content.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (element) =>
      !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden')
  )
  ;(focusable[0] ?? panel).focus({ preventScroll: true })
}
