const api_gateway = 'https://rcnec6rb6k.execute-api.us-east-1.amazonaws.com';

function tvdbApi(query, callback) {
  tvdb_bearer_token().then(bearer_token => {
    fetch(`${api_gateway}/${query}`, {
      headers: {
        'Authorization': `Bearer ${bearer_token}`,
        'Accept-Language': 'en'
      }
    })
      .then(response => response.json())
      .then(callback);
  });
}

function tvdb_bearer_token() {
  return new Promise((resolve, reject) => {
    if (window.tvdb_token) {
      resolve(window.tvdb_token);
    } else {
      fetch(`${api_gateway}/login`)
        .then(response => response.json())
        .then(data => {
          window.tvdb_token = data.data.token;
          resolve(window.tvdb_token);
        })
        .catch(reject);
    }
  });
}

function tvdbSearch(searchTerm, callback) {
  const query = `search?query=${encodeURIComponent(searchTerm)}&type=series&limit=20`;
  tvdbApi(query, callback);
}

function tvdbSeries(series_id, callback) {
  const query = `series/${series_id}/extended?meta=episodes`;
  tvdbApi(query, callback);
}
