import { generateXAxisLabels, getColorStep } from './util.js'
import { offsetLinearRegression } from './stats.js'

function chartjs (seasons) {
  const datasets = []
  const episodeNames = []

  let episodeCounter = 0

  seasons.forEach((season, seasonIndex) => {
    const episodeData = []

    season.episodes.forEach((episode, episodeIndex) => {
      episodeCounter += 1
      const episodeNumber = episodeIndex + 1
      episodeNames[episodeNumber] = `${episodeNumber} - ${episode.title}`
      episodeData.push({ x: episodeCounter, y: parseFloat(episode.rating) })
    })

    const color = getColorStep(seasons.length, seasonIndex)

    datasets.push({
      label: `Season ${seasonIndex + 1}`,
      backgroundColor: color,
      borderColor: color,
      data: episodeData
    })

    const trendData = offsetLinearRegression(
      episodeData.map((e) => e.y),
      1,
      episodeData.length
    ).map(([x, y]) => {
      return { x: episodeData[x - 1].x, y }
    })

    datasets.push({
      label: `Season ${seasonIndex + 1} trend`,
      backgroundColor: color,
      borderColor: color,
      data: trendData,
      type: 'line',
      fill: false
    })
  })

  const config = {
    type: 'scatter', // Changed from 'line' to 'scatter'
    data: {
      labels: generateXAxisLabels(seasons),
      datasets
    },
    options: {
      scales: {
        x: {
          type: 'linear',
          position: 'bottom'
        },
        y: {
          grace: '20%',
          max: 10
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          filter: function (tooltipItem) {
            return !tooltipItem.dataset.label.includes('trend')
          },
          callbacks: {
            label: function (tooltipItem, chart) {
              const episodeLabel = episodeNames[tooltipItem.index + 1]
              return `${episodeLabel}: ${tooltipItem.yLabel}/10`
            }
          }
        }
      }
    }
  }

  const $container = document.querySelector('.ratings_container')
  const $ratings = document.createElement('canvas')
  $ratings.id = 'ratings'
  $container.appendChild($ratings)
  const ctx = $ratings.getContext('2d')
  new Chart(ctx, config) // eslint-disable-line
}

export { chartjs }
