// - Search Page Events
function onSearch(e) {
  const searchTerm = $('.search_box').val();
  console.log(searchTerm);

  omdbSearch(searchTerm, function (data) {
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
    }, i + 1);
  }
}


function init() {
  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });
  let imdbId = params.i
  if (imdbId) {
    $('.outer_ratings_container').removeClass('hidden');
    omdbById(imdbId, (a, b) => { onIdData(a, imdbId, b) });
  } else {
    $('.outer_search_container').removeClass('hidden');
    $('.search_box').keypress(function (e) {
      if (e.which === 13) {
        onSearch();
      }
    });
    $('.search_box').focus();
  }
}
