DATASETS = {
  episodes: 'https://datasets.imdbws.com/title.episode.tsv.gz',
  ratings: 'https://datasets.imdbws.com/title.ratings.tsv.gz',
}

// anyorigin = (url, callback) => `http://anyorigin.com/go?url=${url}&callback=${callback || '?'}`
// alloworigin = (url, callback) => `http://alloworigin.com/get?url=${url}&callback=${callback || '?'}&compress=1`
// fuckcors = url => 'http://fuck-cors.com/?url=' + url
thingproxy = url => 'https://thingproxy.freeboard.io/fetch/' + url
crossoriginme = url => 'https://crossorigin.me/' + url
pxy = url => thingproxy(url)

suggest_url = term => `https://v2.sg.media-imdb.com/suggests/titles/${term.charAt(0)}/${term}.json`

function suggestions(term) {
  $.get(pxy(suggest_url(term)), function(resp) {
    data = JSON.parse(resp.substring(resp.indexOf('(')+1, resp.length-1))
    window.last_search = data
    render_suggestions(data.d)
  });
}

function render_suggestions(items) {
  html_str = ''
  for (var i = 0; i < items.length; i++) {
    my_item = items[i]
    if (my_item && my_item.i && my_item.i[0]) {
      html_str += `
        <div class='result' data-id='${my_item.id}'>
          <img class='result_img' src='${my_item.i[0]}'/>
          <div class='result_title'> ${my_item.l} </div>
          <div class='result_year'> ${my_item.y} </div>
          <div class='result_imdb_id'> ${my_item.id} </div>
        </div>
      `
    }
  }
  $('.results_container').replaceWith($(`<div class='results_container'>${html_str}</div>`))
}

rick_and_morty_id = 'tt2861424'
episodes_url = imdb_id => `https://www.imdb.com/search/title/?series=${imdb_id}&count=2500&view=advanced&sort=release_date,desc`

function get_series_info(imdb_id) {
  $.get(pxy(episodes_url(imdb_id)), function(resp) {
    debugger
    data = JSON.parse(resp.substring(resp.indexOf('(')+1, resp.length-1))
    window.last_search = data
    render_suggestions(data.d)
  });
}

function imdb_init() {
  suggestions('rick and m')
  console.log(get_series_info(rick_and_morty_id))
}