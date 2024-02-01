// - Search Page Events
function onSearch(e) {
  const searchTerm = document.querySelector('.search_box').value
  console.log(searchTerm);

  omdbSearch(searchTerm, function (data) {
    showResults(data.Search);
    console.log(data.Search[0]);
    const imdbId = data.Search[0].imdbID;
  });
}

function showResults(results) {
  let results_el = document.createElement('div');
  results_el.classList.add('results_container');

  for (idx in results) {
    let result_data = results[idx];
    let result_el = document.createElement('div');
    result_el.classList.add('result');
    result_el.onclick = function() {
      onResultClick(result_data.imdbID);
    };

    const result_title_el = document.createElement('div');
    result_title_el.classList.add('result_title');
    result_title_el.textContent = result_data.Title;
    result_el.appendChild(result_title_el);

    const result_year_el = document.createElement('div');
    result_year_el.classList.add('result_year');
    result_year_el.textContent = result_data.Year;
    result_el.appendChild(result_year_el);

    results_el.appendChild(result_el);
  }

  document.querySelector('.results_container').replaceWith(results_el);
}

function onResultClick(imdbId) {
  window.location.href = `${window.location.pathname}?i=${imdbId}`;
}

// - Result Page Events
function onIdData(data, imdbId, season) {
  const show_el = document.createElement('div');
  show_el.classList.add('show');

  for (key in data) {
    const datum_el = document.createElement('div');
    datum_el.classList.add('show_info');
    datum_el.classList.add(`show_${key}`);

    const key_el = document.createElement('div');
    key_el.classList.add('key');
    key_el.textContent = key;
    datum_el.appendChild(key_el);

    const val_el = document.createElement('div');
    val_el.classList.add('val');
    val_el.textContent = data[key];
    datum_el.appendChild(val_el);

    show_el.appendChild(datum_el);
  }

  document.querySelector('.show').replaceWith(show_el);

  window.seasons = new Array(data.totalSeasons);
  window.seasonsLeft = data.totalSeasons;
  for (let i = 0; i < data.totalSeasons; i++) {
    omdbById(imdbId, (data) => {
      window.seasons[i] = data;
      window.seasonsLeft--;
      if (!window.seasonsLeft) {
        createLineChart(window.seasons);
        // chartRatings()
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
    document.querySelector('.outer_ratings_container').classList.remove('hidden');
    omdbById(imdbId, (a, b) => { onIdData(a, imdbId, b) });
  } else {
    document.querySelector('.outer_search_container').classList.remove('hidden');
    search_box_el = document.querySelector('.search_box');
    search_box_el.addEventListener('keypress', function(e) {
      if (e.which === 13) {
        onSearch();
      }
    });
    search_box_el.focus();
  }
}
