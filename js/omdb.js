function omdbApi(query, callback) {
  const apiKey = 'e0d17059'; // "security": need this for gh pages, the fate of the site is in your hands, pls don't break me
  fetch(`https://www.omdbapi.com/?${query}&apikey=${apiKey}`)
    .then((response) => {
      return response.json();
    })
    .then(callback);
}

function omdbSearch(searchTerm, callback) {
  omdbApi(`s=${encodeURIComponent(searchTerm)}`, callback);
}

function omdbById(imdbId, callback, season) {
  let _season = (!!season) ? `&Season=${season}` : '';
  omdbApi(`i=${encodeURIComponent(imdbId)}${_season}`, callback);
}
