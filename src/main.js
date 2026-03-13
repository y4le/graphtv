import { renderResultsPage } from './pages/results.js'
import { renderSearchPage } from './pages/search.js'
import { getUrlParams, normalizeLegacyParams } from './lib/url.js'
import { initializeTheme } from './viz/theme.js'

async function bootstrap() {
  const app = document.querySelector('#app')
  initializeTheme()
  const normalizedParams = normalizeLegacyParams()
  const canonicalSearch = normalizedParams.toString()

  if (canonicalSearch !== window.location.search.slice(1)) {
    window.history.replaceState({}, '', canonicalSearch ? `?${canonicalSearch}` : window.location.pathname)
  }

  const params = getUrlParams()
  const showRef = params.get('show')

  if (showRef) {
    await renderResultsPage(app, showRef)
    return
  }

  renderSearchPage(app)
}

bootstrap()
