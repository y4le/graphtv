import { renderCreditsContent } from './credits.js'
import { getMotionBehavior } from './overlayMotion.js'
import { openHelpOverlay } from './helpOverlay.js'
import '../../css/overlays.css'

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
