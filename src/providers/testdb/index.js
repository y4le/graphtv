import {
  omdbSeasonFixture,
  omdbShowFixture
} from '../../../test/fixtures/omdb.js'
import {
  tmdbExternalIdsFixture,
  tmdbSeasonFixture,
  tmdbShowFixture
} from '../../../test/fixtures/tmdb.js'
import {
  tvmazeEpisodesFixture,
  tvmazeSearchFixture,
  tvmazeShowFixture
} from '../../../test/fixtures/tvmaze.js'
import { normalizeOmdbSeason, normalizeOmdbShow } from '../omdb/normalize.js'
import {
  normalizeTmdbExternalIds,
  normalizeTmdbSeason,
  normalizeTmdbShow
} from '../tmdb/normalize.js'
import {
  normalizeTvmazeEpisodes,
  normalizeTvmazeSearch,
  normalizeTvmazeShow
} from '../tvmaze/normalize.js'

const tvmazeShow = normalizeTvmazeShow(tvmazeShowFixture)
const tmdbShow = normalizeTmdbShow(
  tmdbShowFixture,
  normalizeTmdbExternalIds(tmdbExternalIdsFixture)
)
const omdbShow = normalizeOmdbShow(omdbShowFixture)

const primaryRecord = {
  provider: 'testdb',
  show: { ...tvmazeShow, id: 'testdb:the-wire' },
  seasons: normalizeTvmazeEpisodes(tvmazeEpisodesFixture)
}

const supplementalRecords = [
  {
    provider: 'tmdb',
    show: tmdbShow,
    seasons: [normalizeTmdbSeason(tmdbSeasonFixture)]
  },
  {
    provider: 'omdb',
    show: omdbShow,
    seasons: [normalizeOmdbSeason(omdbSeasonFixture)]
  }
]

export async function search(query, _options = {}) {
  const normalizedSearch = normalizeTvmazeSearch(tvmazeSearchFixture).map(
    (show) => ({
      ...show,
      id: 'testdb:the-wire'
    })
  )
  return normalizedSearch.filter((show) =>
    show.title.toLowerCase().includes(query.toLowerCase())
  )
}

export async function getShow(id) {
  const shows = {
    'testdb:the-wire': primaryRecord.show,
    'tmdb:1438': tmdbShow,
    'omdb:tt0306414': omdbShow
  }

  return shows[id]
}

export async function getSeasons(id) {
  if (id.startsWith('testdb:')) {
    return primaryRecord.seasons
  }

  if (id.startsWith('tmdb:')) {
    return supplementalRecords[0].seasons
  }

  if (id.startsWith('omdb:')) {
    return supplementalRecords[1].seasons
  }

  return []
}

export async function resolveShowRef({ externalIds }) {
  if (externalIds?.imdb === 'tt0306414') {
    return 'testdb:the-wire'
  }

  return null
}
