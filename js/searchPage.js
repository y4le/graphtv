import { search } from './api.js'
import { preserveParams } from './util.js'

function renderSearchPage () {
  document.querySelector('.outer_search_container').classList.remove('hidden')
  const $searchBox = document.querySelector('.search_box')
  $searchBox.addEventListener('keypress', function (e) {
    if (e.which === 13) {
      onSearch()
    }
  })
  $searchBox.focus()
}

function onSearch (e) {
  const searchTerm = document.querySelector('.search_box').value

  search(searchTerm).then((data) => {
    showResults(data)
  })
}

function showResults (results) {
  // expect results is [{title: xxx, year: xxx, imdb_id: xxx, tmdb_id: xxx}]
  const $results = document.createElement('div')
  $results.classList.add('results_container')

  for (const result of results) {
    const $result = document.createElement('div')
    $result.classList.add('result')
    if (result.imdbId) {
      $result.onclick = function () {
        const link = preserveParams(`${window.location.pathname}?i=${result.imdbId}`)
        window.location.href = link
      }
    } else if (result.tmdbId) {
      $result.onclick = function () {
        const link = preserveParams(`${window.location.pathname}?t=${result.tmdbId}`)
        window.location.href = link
      }
    } else {
      console.warn(`missing series ID for ${result.title}`)
    }

    const $resultTitle = document.createElement('div')
    $resultTitle.classList.add('result_title')
    $resultTitle.textContent = result.title
    $result.appendChild($resultTitle)

    const $resultYear = document.createElement('div')
    $resultYear.classList.add('result_year')
    $resultYear.textContent = result.year
    $result.appendChild($resultYear)

    $results.appendChild($result)
  }

  document.querySelector('.results_container').replaceWith($results)
}

export { renderSearchPage }
