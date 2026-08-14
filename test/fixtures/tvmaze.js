export const tvmazeSearchFixture = [
  {
    score: 1.32811,
    show: {
      id: 179,
      name: 'The Wire',
      premiered: '2002-06-02',
      genres: ['Crime', 'Drama'],
      image: {
        medium:
          'https://static.tvmaze.com/uploads/images/medium_portrait/8/20216.jpg',
        original:
          'https://static.tvmaze.com/uploads/images/original_untouched/8/20216.jpg'
      }
    }
  }
]

export const tvmazeShowFixture = {
  id: 179,
  name: 'The Wire',
  premiered: '2002-06-02',
  summary:
    '<p>Told from the points of view of both the Baltimore homicide and narcotics detectives and their targets.</p>',
  genres: ['Crime', 'Drama'],
  image: {
    medium:
      'https://static.tvmaze.com/uploads/images/medium_portrait/8/20216.jpg',
    original:
      'https://static.tvmaze.com/uploads/images/original_untouched/8/20216.jpg'
  },
  rating: {
    average: 8.9
  },
  externals: {
    imdb: 'tt0306414',
    thetvdb: 79126
  },
  _embedded: {
    seasons: [{ number: 1 }]
  }
}

export const tvmazeSeasonsFixture = [
  {
    id: 7001,
    number: 1,
    name: 'Season 1'
  }
]

export const tvmazeEpisodesFixture = [
  {
    id: 1001,
    name: 'The Target',
    season: 1,
    number: 1,
    airdate: '2002-06-02',
    summary: '<p>McNulty gets pulled into a new detail.</p>',
    image: {
      medium:
        'https://static.tvmaze.com/uploads/images/medium_landscape/1/1111.jpg',
      original:
        'https://static.tvmaze.com/uploads/images/original_untouched/1/1111.jpg'
    },
    rating: {
      average: 8.3
    }
  },
  {
    id: 1002,
    name: 'The Detail',
    season: 1,
    number: 2,
    airdate: '2002-06-09',
    summary: '<p>The unit starts to organize its surveillance.</p>',
    image: {
      medium:
        'https://static.tvmaze.com/uploads/images/medium_landscape/1/1112.jpg',
      original:
        'https://static.tvmaze.com/uploads/images/original_untouched/1/1112.jpg'
    },
    rating: {
      average: 8.1
    }
  },
  {
    id: 1003,
    name: 'The Buys',
    season: 1,
    number: 3,
    airdate: '2002-06-16',
    summary: '<p>The detail starts buying street product.</p>',
    image: null,
    rating: {
      average: null
    }
  }
]
