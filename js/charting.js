function createLineChart (seasons) {
  const ctx = document.querySelector('.ratings').getContext('2d')
  const data = []
  const labels = []
  const episodeNames = []

  let episodeCounter = 0

  seasons.forEach((season, seasonIndex) => {
    const episodeData = []
    for (let i = 0; i < episodeCounter; i++) {
      episodeData.push(NaN)
    }

    season.episodes.forEach((episode, episodeIndex) => {
      episodeCounter += 1
      const episodeNumber = episodeIndex + 1
      episodeNames[episodeNumber] = `${episodeNumber} - ${episode.title}`
      labels.push(`S${seasonIndex + 1}E${episodeNumber}`)
      episodeData.push(parseFloat(episode.rating))
    })

    data.push({
      label: `Season ${seasonIndex + 1}`,
      backgroundColor: `rgba(${(45 + 81 * seasonIndex) % 255}, ${(110 + 81 * seasonIndex) % 255}, ${(180 + 81 * seasonIndex) % 255}, .5)`,
      borderColor: `rgba(${(45 + 81 * seasonIndex) % 255}, ${(110 + 81 * seasonIndex) % 255}, ${(180 + 81 * seasonIndex) % 255}, 1)`,
      data: episodeData,
      fill: false
    })
  })

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: data
    },
    options: {
      scales: {
        y: {
          grace: '20%',
          max: 10
        }
      },
      tooltips: {
        callbacks: {
          label: function (tooltipItem, chart) {
            const episodeLabel = episodeNames[tooltipItem.index + 1]
            return `${episodeLabel}: ${tooltipItem.yLabel}/10`
          }
        }
      }
    }
  }
  new Chart(ctx, config) // eslint-disable-line
}

export { createLineChart }
