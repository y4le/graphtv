import { generateXAxisLabels, getColorStep, clampNum } from './util.js'
import { offsetLinearRegression } from './stats.js'

const POINT_MIN_SIZE = 3
const POINT_MAX_SIZE = 20

function hichart (seasons) {
  const episodeData = []
  const xAxisLabels = generateXAxisLabels(seasons)
  const potentialRadius = -0.2 * xAxisLabels.length + 24
  const pointRadius = clampNum(POINT_MIN_SIZE, potentialRadius, POINT_MAX_SIZE)

  const seasonSeries = seasons.map((season, seasonIndex) => {
    const initialX = episodeData.length
    const episodeRatings = season.episodes.map((episode, episodeIndex) => {
      episodeData.push(episode)
      return [episodeData.length, episode.rating]
    })
    return {
      name: `Season ${seasonIndex + 1}`,
      data: episodeRatings,
      type: 'scatter',
      color: getColorStep(seasons.length, seasonIndex),
      marker: {
        radius: pointRadius
      },
      custom_data: {
        initialX,
        finalX: episodeData.length
      }
    }
  })

  const series = []
  seasonSeries.forEach((seasonSerie) => {
    const rawRatings = seasonSerie.data.map((datum) => { return datum[1] })

    const regressionSerie = {
      name: `${seasonSerie.name} trend`,
      type: 'line',
      color: seasonSerie.color,
      data: offsetLinearRegression(
        rawRatings,
        seasonSerie.custom_data.initialX,
        seasonSerie.custom_data.finalX
      )
    }

    series.push(regressionSerie)
    series.push(seasonSerie)
  })

  const style = { color: 'white' }

  const hichartsOptions = {
    chart: {
      type: 'scatter',
      backgroundColor: 'black'
    },
    title: {
      text: 'TV Show Ratings by Episode',
      style
    },
    xAxis: {
      categories: xAxisLabels,
      title: {
        text: 'Episodes',
        style
      },
      labels: {
        enabled: false,
        style
      }
    },
    yAxis: {
      title: {
        text: 'Rating',
        style
      },
      labels: {
        enabled: true,
        style
      }
    },
    tooltip: {
      formatter: function () {
        const e = episodeData[this.point.x - 1]
        return `<b>${this.x}</b><br/>${e.title}<br/>${e.rating.toFixed(2)}<br/>${e.date}<br/>${e.plot}`
      }
    },
    legend: {
      enabled: false
    },
    plotOptions: {
      scatter: {
        dataLabels: {
          enabled: false
        },
        enableMouseTracking: true
      },
      line: {
        enableMouseTracking: false
      }
    },
    series
  }

  const $container = document.querySelector('.ratings_container')
  const $ratings = document.createElement('div')
  $ratings.id = 'ratings'
  $container.appendChild($ratings)
  Highcharts.chart('ratings', hichartsOptions) // eslint-disable-line

  window.onresize = function (_) {
    hichart(window.seasons)
  }
}

export { hichart }
