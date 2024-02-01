function createLineChart(seasons) {
  const ctx = document.querySelector('.ratings').getContext('2d');
  const data = [];
  let labels = [];
  episode_name_dict = [];

  episode_counter = 0;

  seasons.forEach((season, seasonIndex) => {
    const episodeData = [];
    for (let i = 0; i < episode_counter; i++) {
      episodeData.push(NaN);
    }

    season.Episodes.forEach(function (episode, episodeIndex) {
      episode_counter += 1;
      let episodeNumber = episodeIndex + 1;
      episode_name_dict[episodeNumber] = `${episodeNumber} - ${episode.Title}`;
      labels.push(`S${seasonIndex + 1}E${episodeNumber}`);
      episodeData.push(parseFloat(episode.imdbRating));
    });

    data.push({
      label: `Season ${seasonIndex + 1}`,
      backgroundColor: `rgba(${(45 + 81 * seasonIndex) % 255}, ${(110 + 81 * seasonIndex) % 255}, ${(180 + 81 * seasonIndex) % 255}, .5)`,
      borderColor: `rgba(${(45 + 81 * seasonIndex) % 255}, ${(110 + 81 * seasonIndex) % 255}, ${(180 + 81 * seasonIndex) % 255}, 1)`,
      data: episodeData,
      fill: false,
    });
  });

  const config = {
    type: 'line',
    data: {
      labels: labels,
      datasets: data,
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
          label: function(tooltipItem, chart) {
            const episodeLabel = episode_name_dict[tooltipItem.index + 1];
            return `${episodeLabel}: ${tooltipItem.yLabel}/10`;
          }
        }
      }
    }
  };
  new Chart(ctx, config);
}
