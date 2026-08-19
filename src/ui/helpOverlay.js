import { escapeHtml } from '../lib/html.js'
import { getMotionBehavior } from './overlayMotion.js'
import { openCreditsOverlay } from './creditsOverlay.js'
import { openDebugOverlay } from './debugOverlay.js'
import '../../css/overlays.css'

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

function resultsHelpSections() {
  return [
    {
      title: 'Global',
      items: [
        { keys: ['/', 'q'], action: 'Return to search' },
        { keys: ['o'], action: 'Open view options' },
        { keys: ['m'], action: 'Toggle mark scaling panel' },
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
      title: 'Episode comparison',
      items: [
        { keys: ['v'], action: 'Start or exit episode comparison' },
        { keys: ['Enter'], action: 'Compare with previewed episode' }
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
        { keys: ['Escape'], action: 'Return to full-series trend' }
      ]
    },
    {
      title: 'Ratings',
      items: [{ keys: ['p'], action: 'Cycle primary rating provider' }]
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
