const apiKey = 'e0d17059'; // "security": need this for gh pages, the fate of the site is in your hands, pls don't break me

function getParameterByName(name) { // https://stackoverflow.com/a/5158301
  var match = RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
  return match && decodeURIComponent(match[1].replace(/\+/g, ' '));
}



// API HELPERS

function omdbApi(query, callback) {
  $.ajax({
    url: `https://www.omdbapi.com/?${query}&apikey=${apiKey}`,
    success: callback
  });
}

function omdbSearch(searchTerm, callback) {
  omdbApi(`s=${encodeURIComponent(searchTerm)}`, callback);
}

function omdbById(imdbId, callback, season) {
  let _season = (!!season) ? `&Season=${season}` : '';
  omdbApi(`i=${encodeURIComponent(imdbId)}${_season}`, callback);
}



// UI EVENT HANDLERS

// - Search Page Events
function onSearch(e) {
  const searchTerm = $('.search_box').val();
  console.log(searchTerm);

  omdbSearch(searchTerm, function(data) {
    showResults(data.Search);
    console.log(data.Search[0]);
    const imdbId = data.Search[0].imdbID;
  });
}

function showResults(results) {
  let $results = $("<div class='results_container'></div>");
  for (idx in results) {
    let result = results[idx];
    let $result = $(`<div class='result' onclick="onResultClick('${result.imdbID}')"></div>`);
    $result.append(`<div class='result_title'>${result.Title}</div><div class='result_year'>${result.Year}</div>`);
    $results.append($result);
  }
  $('.results_container').replaceWith($results);
}

function onResultClick(imdbId) {
  window.location.href = `${window.location.pathname}?i=${imdbId}`;
}

// - Result Page Events
function onIdData(data, imdbId, season) {
  let $show = $("<div class='show'></div>");
  for (key in data) {
    $show.append($(`<div class='show_info show_${key}'><div class='key'>${key}</div><div class='val'>${data[key]}</div></div>`));
  }

  $('.show').replaceWith($show);
  window.seasons = new Array(data.totalSeasons);
  window.seasonsLeft = data.totalSeasons;
  for (let i = 0; i < data.totalSeasons; i++) {
    omdbById(imdbId, (data) => {
      window.seasons[i] = data;
      window.seasonsLeft--;
      if (!window.seasonsLeft) {
        chartRatings()
      }
    }, i+1);
  }
}


function init() {
  let imdbId = getParameterByName('i');
  if (imdbId) {
    $('.outer_ratings_container').removeClass('hidden');
    omdbById(imdbId, (a, b) => { onIdData(a, imdbId, b) });
  } else {
    $('.outer_search_container').removeClass('hidden');
    $('.search_box').keypress(function(e) {
      if (e.which === 13) {
        onSearch();
      }
    });
    $('.search_box').focus();
  }
}


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
      window.episode_name_dict[x_axis_counter] = `${j+1} - ${season.Episodes[j].Title}`;
      
    }
    data[i] = {
      regression: true,
      name: 'Season ' + (i+1),
      color: `rgba(${(45 + 81*i) % 255}, ${(110 + 81*i) % 255}, ${(180 + 81*i) % 255}, .5)`,
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
          pointFormatter: function() { return `${window.episode_name_dict[parseInt(this.x)]}<br/>${this.y}/10` }
        }
      }
    },
    pane: {
      backgroundColor: '#000000'
    },
    series: data
  });
}
