import { getSeries, getSeason } from './api.js'
import { hichart } from './hichart.js'

function renderResultsPage (seriesId) {
  document.querySelector('.outer_ratings_container').classList.remove('hidden')
  getSeries(seriesId).then((data) => { onIdData(data, seriesId) })
  window.onresize = function (event) {
    reloadResultsPage()
  }
}

function onIdData (data, seriesId) {
  const $show = document.createElement('div')
  $show.classList.add('show')

  document.querySelector('.poster').src = data.poster

  for (const key in data) {
    const $key = document.createElement('div')
    $key.classList.add('key')
    $key.textContent = key
    $key.classList.add('start_hidden')

    const $val = document.createElement('div')
    $val.classList.add('val')
    $val.textContent = data[key]
    $val.classList.add(`show_${key}`)
    if (key !== 'title') {
      $val.classList.add('start_hidden')
    }

    $show.appendChild($key)
    $show.appendChild($val)
  }

  document.querySelector('.show').replaceWith($show)

  window.seasons = new Array(data.totalSeasons)
  window.seasonsLeft = data.totalSeasons
  for (let i = 0; i < data.totalSeasons; i++) {
    getSeason(seriesId, i + 1).then((data) => {
      window.seasons[i] = data
      window.seasonsLeft--
      if (!window.seasonsLeft) {
        reloadResultsPage()
      }
    })
  }
}

function reloadResultsPage () {
  hichart(window.seasons)
}

export { renderResultsPage }
