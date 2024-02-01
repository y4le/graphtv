function chartRatings() {
  data = new Array(window.seasons.length);

  let x_axis_counter = 0;
  window.episode_name_dict = [];

  for (let i = 0; i < window.seasons.length; i++) {
    let season = window.seasons[i];
    episodeData = new Array(season.Episodes.length);
    for (let j = 0; j < episodeData.length; j++) {
      x_axis_counter++;
      episodeData[j] = [
        parseFloat(x_axis_counter),
        parseFloat(season.Episodes[j].imdbRating)
      ];
      window.episode_name_dict[x_axis_counter] = `${j + 1} - ${season.Episodes[j].Title}`;

    }
    data[i] = {
      regression: true,
      regressionSettings: {
        tooltip: { enabled: false }
      },
      name: 'Season ' + (i + 1),
      color: `rgba(${(45 + 81 * i) % 255}, ${(110 + 81 * i) % 255}, ${(180 + 81 * i) % 255}, .5)`,
      data: episodeData
    }
  }


  $('.ratings').highcharts({
    chart: {
      type: 'scatter',
      width: $(window).width() * .9,
      height: 500,
      plotBackgroundColor: '#000000',
      zoomType: 'xy'
    },
    title: {
      enabled: false,
      text: 'Ratings'
    },
    xAxis: {
      title: {
        enabled: false,
        text: 'episode #'
      },
      startOnTick: true,
      endOnTick: true,
      showLastLabel: true
    },
    yAxis: {
      title: {
        enabled: true,
        text: 'Episode Rating'
      }
    },
    legend: {
      enabled: false,
    },
    plotOptions: {
      scatter: {
        marker: {
          radius: 4,
          symbol: 'circle',
          states: {
            hover: {
              enabled: true,
              lineColor: 'rgb(100,100,100)'
            }
          }
        },
        states: {
          hover: {
            marker: {
              enabled: false
            }
          }
        },
        tooltip: {
          pointFormatter: function () {
            if (this.series.name.indexOf('Season') > -1) {
              return `${window.episode_name_dict[parseInt(this.x)]}<br/>${this.y}/10`
            }
            return false;
          }
        }
      }
    },
    pane: {
      backgroundColor: '#000000'
    },
    series: data
  });
}