import { getSeries, getSeason } from './api.js'
import { createLineChart } from './charting.js'

function renderResultsPage (seriesId) {
  document.querySelector('.outer_ratings_container').classList.remove('hidden')
  getSeries(seriesId).then((data) => { onIdData(data, seriesId) })
}

function onIdData (data, seriesId) {
  const $show = document.createElement('div')
  $show.classList.add('show')

  document.querySelector('.poster').src = data.poster

  for (const key in data) {
    const $datum = document.createElement('div')
    $datum.classList.add('show_info')
    $datum.classList.add(`show_${key}`)

    const $key = document.createElement('div')
    $key.classList.add('key')
    $key.textContent = key
    $datum.appendChild($key)

    const $val = document.createElement('div')
    $val.classList.add('val')
    $val.textContent = data[key]
    $datum.appendChild($val)

    $show.appendChild($datum)
  }

  document.querySelector('.show').replaceWith($show)

  window.seasons = new Array(data.totalSeasons)
  window.seasonsLeft = data.totalSeasons
  for (let i = 0; i < data.totalSeasons; i++) {
    getSeason(seriesId, i + 1).then((data) => {
      window.seasons[i] = data
      window.seasonsLeft--
      if (!window.seasonsLeft) {
        createLineChart(window.seasons)
        // chartRatings()
      }
    })
  }
}

export { renderResultsPage }
