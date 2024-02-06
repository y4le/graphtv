import { generateXaxis } from './util.js'

const MAX_POINTS_FOR_LABELS = 30 // disable point labels to prevent crowdedness

function hichart (seasons) {
  const episodeData = []
  const series = seasons.map((season, seasonIndex) => {
    const episodeRatings = season.episodes.map((episode, episodeIndex) => {
      episodeData.push(episode)
      return [episodeData.length, episode.rating]
    })
    return {
      name: `Season ${seasonIndex + 1}`,
      data: episodeRatings
    }
  })

  const textColor = 'white'
  const style = { color: textColor }

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
      categories: generateXaxis(seasons),
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
      }
    },
    tooltip: {
      formatter: function () {
        const e = episodeData[this.point.x - 1]
        return `<b>${this.x}</b><br/>${e.title}<br/>${e.rating.toFixed(2)}<br/>${e.date}<br/>${e.plot}`
      }
    },
    plotOptions: {
      scatter: {
        dataLabels: {
          enabled: episodeData.length < MAX_POINTS_FOR_LABELS
        },
        enableMouseTracking: true
      }
    },
    series
  }

  const $container = document.querySelector('.ratings_container')
  const $ratings = document.createElement('div')
  $ratings.id = 'ratings'
  $container.appendChild($ratings)
  Highcharts.chart('ratings', hichartsOptions) // eslint-disable-line
}

export { hichart }
