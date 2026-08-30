import '../css/styles.css'

import { getActiveProvider, resolveActiveShowRef } from './data/showRef.js'
import { buildUrl, getUrlParams, normalizeLegacyParams } from './lib/url.js'
import { createKeyboardController } from './ui/keyboard.js'
import { createOverlayController } from './ui/overlayController.js'
import { createDockController } from './ui/dock.js'
import { initializeTheme } from './viz/theme.js'
import { renderError, renderPublisherBrand } from './pages/shared.js'

async function bootstrap() {
  const app = document.querySelector('#app')
  initializeTheme()
  const normalizedParams = normalizeLegacyParams()
  const activeProvider = getActiveProvider(normalizedParams)
  for (const key of ['show', 'vs']) {
    if (normalizedParams.has(key)) {
      normalizedParams.set(
        key,
        resolveActiveShowRef(normalizedParams.get(key), activeProvider)
      )
    }
  }
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
  let comparisonRef = params.get('vs')
  if (showRef && comparisonRef === showRef) {
    params.delete('vs')
    params.delete('select')
    window.history.replaceState({}, '', buildUrl(params))
    comparisonRef = null
  }
  const overlayController = createOverlayController()
  const dockController = createDockController()
  let pageController

  if (showRef && comparisonRef) {
    const { renderComparisonPage } = await import('./pages/compare.js')
    pageController = await renderComparisonPage(app, showRef, comparisonRef)
  } else if (showRef) {
    const { renderResultsPage } = await import('./pages/results.js')
    pageController = await renderResultsPage(app, showRef)
  } else {
    const { renderSearchPage } = await import('./pages/search.js')
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
