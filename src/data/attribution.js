// Reviewed against RatingsDB docs/requirements.md, "Provider statements
// reviewed", on 2026-08-28. Keep third-party notices no stronger than that
// matrix. IMDb remains link-only until its public-output rights are reconciled.
export const ATTRIBUTION_REVIEWED = '2026-08-28'

export const ATTRIBUTION_SUBJECTS = Object.freeze({
  ratingsdb: Object.freeze({
    name: 'RatingsDB',
    href: null,
    notices: Object.freeze(['Chart data assembled by RatingsDB.']),
    combinedNotice:
      'The combined rating is computed by RatingsDB from the sources listed here.',
    linkLabel: null
  }),
  imdb: Object.freeze({
    name: 'IMDb',
    href: 'https://www.imdb.com/',
    notices: Object.freeze([]),
    linkLabel: 'IMDb'
  }),
  tvmaze: Object.freeze({
    name: 'TVmaze',
    href: 'https://www.tvmaze.com/',
    notices: Object.freeze(['TV data and artwork provided by TVmaze.']),
    license: Object.freeze({
      prefix: 'TVmaze API data is licensed under',
      label: 'CC BY-SA',
      href: 'https://www.tvmaze.com/api#licensing'
    }),
    linkLabel: 'TVmaze'
  }),
  tmdb: Object.freeze({
    name: 'TMDB',
    href: 'https://www.themoviedb.org/',
    notices: Object.freeze([
      'TV data and artwork provided by TMDB.',
      'This product uses the TMDB API but is not endorsed or certified by TMDB.'
    ]),
    logo: true,
    linkLabel: 'TMDB'
  }),
  trakt: Object.freeze({
    name: 'Trakt',
    href: 'https://trakt.tv/',
    notices: Object.freeze([]),
    linkLabel: 'Trakt'
  }),
  rottentomatoes: Object.freeze({
    name: 'Rotten Tomatoes',
    href: 'https://www.rottentomatoes.com/',
    notices: Object.freeze([]),
    linkLabel: 'Rotten Tomatoes'
  }),
  metacritic: Object.freeze({
    name: 'Metacritic',
    href: 'https://www.metacritic.com/',
    notices: Object.freeze([]),
    linkLabel: 'Metacritic'
  }),
  omdb: Object.freeze({
    name: 'OMDb API',
    href: 'https://www.omdbapi.com/',
    notices: Object.freeze([
      'Episode metadata and IMDb ratings provided through the OMDb API.',
      'OMDb is not endorsed by or affiliated with IMDb.com.'
    ]),
    license: Object.freeze({
      prefix: 'OMDb content is licensed under',
      label: 'CC BY-NC 4.0',
      href: 'https://creativecommons.org/licenses/by-nc/4.0/'
    }),
    linkLabel: 'IMDb'
  })
})

export const ATTRIBUTION_BY_SOURCE = Object.freeze({
  imdb: 'imdb',
  tvmaze: 'tvmaze',
  tmdb: 'tmdb',
  trakt: 'trakt',
  rtCritics: 'rottentomatoes',
  rtAudience: 'rottentomatoes',
  mcCritics: 'metacritic',
  mcAudience: 'metacritic',
  omdb: 'omdb'
})
