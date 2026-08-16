import { renderResultsPage } from './pages/results.js'
import { renderSearchPage } from './pages/search.js'
import { getUrlParams, normalizeLegacyParams } from './lib/url.js'
import { createKeyboardController } from './ui/keyboard.js'
import { createOverlayController } from './ui/overlay.js'
import { createDockController } from './ui/dock.js'
import { initializeTheme } from './viz/theme.js'
import { renderError, renderPublisherBrand } from './pages/shared.js'

async function bootstrap() {
  const app = document.querySelector('#app')
  initializeTheme()
  const normalizedParams = normalizeLegacyParams()
  const canonicalSearch = normalizedParams.toString()

  if (canonicalSearch !== window.location.search.slice(1)) {
    window.history.replaceState(
      {},
      '',
      canonicalSearch ? `?${canonicalSearch}` : window.location.pathname
    )
  }

  const params = getUrlParams()
  const showRef = params.get('show')
  const overlayController = createOverlayController()
  const dockController = createDockController()
  let pageController

  if (showRef) {
    pageController = await renderResultsPage(app, showRef)
  } else {
    pageController = renderSearchPage(app)
  }

  const keyboardController = createKeyboardController({
    page: pageController,
    overlayController,
    dockController
  })
  pageController.focusInitial?.()

  let destroyed = false
  const destroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true
    keyboardController.destroy()
    dockController.destroy()
    overlayController.destroy()
    pageController.destroy?.()
  }

  return { destroy, pageController }
}

bootstrap().catch((error) => {
  const app = document.querySelector('#app')
  if (!app) {
    return
  }

  app.innerHTML = `
    <main class="document-shell">
      ${renderPublisherBrand()}
      ${renderError(error?.message || 'graphtv could not start.')}
    </main>
  `
})
