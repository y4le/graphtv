import { getUrlParams } from './util.js'
import { renderSearchPage } from './searchPage.js'
import { renderResultsPage } from './resultsPage.js'

function init () {
  const params = getUrlParams()
  if (params.i) {
    renderResultsPage(params.i)
  } else if (params.t) {
    renderResultsPage(params.t)
  } else {
    renderSearchPage()
  }
}

init()
