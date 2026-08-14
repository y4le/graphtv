import { renderResultsPage } from './pages/results.js'
import { renderSearchPage } from './pages/search.js'
import { getUrlParams, normalizeLegacyParams } from './lib/url.js'
import { createKeyboardController } from './ui/keyboard.js'
import { createOverlayController } from './ui/overlay.js'
import { initializeTheme } from './viz/theme.js'

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
  let pageController

  if (showRef) {
    pageController = await renderResultsPage(app, showRef)
  } else {
    pageController = renderSearchPage(app)
  }

  createKeyboardController({
    page: pageController,
    overlayController
  })
  pageController.focusInitial?.()
}

bootstrap()
