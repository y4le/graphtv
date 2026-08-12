export const tmdbSearchFixture = {
  page: 1,
  results: [
    {
      id: 1438,
      name: 'The Wire',
      first_air_date: '2002-06-02',
      poster_path: '/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
      overview: 'The Baltimore drug war through detectives and dealers.',
      vote_average: 8.6,
      vote_count: 2000
    }
  ]
}

export const tmdbCollectionFixture = {
  page: 1,
  results: [
    {
      id: 108978,
      name: 'Reacher',
      first_air_date: '2022-02-03',
      poster_path: '/reacher.jpg',
      overview: 'A former military investigator takes on dangerous cases.',
      vote_average: 8.1,
      vote_count: 2400,
      adult: false
    },
    {
      id: 222,
      name: 'New Show',
      first_air_date: '2026-08-01',
      poster_path: '/new-show.jpg',
      overview: 'A newly released series.',
      vote_average: 7.4,
      vote_count: 3,
      adult: false
    },
    {
      id: 333,
      name: 'Adult Show',
      first_air_date: '2020-01-01',
      poster_path: '/adult.jpg',
      vote_average: 6.2,
      vote_count: 800,
      adult: true
    },
    {
      id: 555,
      name: 'No Poster Show',
      first_air_date: '2019-01-01',
      poster_path: null,
      vote_average: 8.5,
      vote_count: 5000,
      adult: false
    }
  ]
}

export const tmdbShowFixture = {
  id: 1438,
  name: 'The Wire',
  first_air_date: '2002-06-02',
  overview: 'The Baltimore drug war through detectives and dealers.',
  poster_path: '/4lbclFySvugI51fwsyxBTOm4DqK.jpg',
  vote_average: 8.6,
  vote_count: 2000,
  number_of_seasons: 1,
  genres: [
    { id: 80, name: 'Crime' },
    { id: 18, name: 'Drama' }
  ]
}

export const tmdbExternalIdsFixture = {
  id: 1438,
  imdb_id: 'tt0306414',
  tvdb_id: 79126
}

export const tmdbSeasonFixture = {
  id: 3848,
  name: 'Season 1',
  overview: 'The detail forms and begins listening to the streets.',
  poster_path: '/blgnd2APWtxsxGyctmZyaMPO4Ym.jpg',
  season_number: 1,
  episodes: [
    {
      id: 66452,
      name: 'The Target',
      overview: 'McNulty gets pulled into a new detail.',
      air_date: '2002-06-02',
      season_number: 1,
      episode_number: 1,
      vote_average: 8.4,
      vote_count: 120,
      still_path: '/tmdb-target.jpg'
    },
    {
      id: 66453,
      name: 'The Detail',
      overview: 'The unit starts to organize its surveillance.',
      air_date: '2002-06-09',
      season_number: 1,
      episode_number: 2,
      vote_average: 8.0,
      vote_count: 110,
      still_path: '/tmdb-detail.jpg'
    },
    {
      id: 66454,
      name: 'The Buys',
      overview: 'The detail starts buying street product.',
      air_date: '2002-06-16',
      season_number: 1,
      episode_number: 3,
      vote_average: 8.5,
      vote_count: 100,
      still_path: '/tmdb-buys.jpg'
    }
  ]
}
