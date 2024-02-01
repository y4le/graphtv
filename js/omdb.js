const apiKey = 'e0d17059'; // "security": need this for gh pages, the fate of the site is in your hands, pls don't break me

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
