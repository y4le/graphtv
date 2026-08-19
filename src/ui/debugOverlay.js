import { clearApiCache } from '../data/apiCache.js'
import { resetAllAppData } from '../data/appData.js'
import { escapeHtml } from '../lib/html.js'
import { getMotionBehavior } from './overlayMotion.js'
import '../../css/overlays.css'

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
