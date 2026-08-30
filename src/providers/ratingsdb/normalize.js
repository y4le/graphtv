import {
  createEpisode,
  createProviderRating,
  createSeason,
  createShow
} from '../../data/schema.js'
import { isSeriesRef } from './seriesRef.js'

const DIAGNOSTIC_STATUSES = new Map([
  ['fresh', 'loaded'],
  ['stale', 'loaded'],
  ['computed', 'loaded'],
  ['failed', 'failed'],
  ['disabled', 'skipped'],
  ['redacted', 'skipped'],
  ['pending', 'pending']
])

function normalizeRating(rating, sourceIds = {}) {
  const metadata = {}

  if (rating.metric) {
    metadata.metric = rating.metric
  }
  if (rating.contributors) {
    metadata.contributors = [...rating.contributors]
  }
  if (rating.alignment) {
    metadata.provenance = {
      providerEpisodeId: sourceIds[rating.source] ?? null,
      strategy: rating.alignment.strategy,
      confidence: rating.alignment.confidence,
      evidence: rating.alignment.evidence
        ? { ...rating.alignment.evidence }
        : null,
      relation: 'one-to-one'
    }
  }

  return createProviderRating(
    rating.source,
    rating.rating ?? null,
    rating.votes ?? null,
    metadata
  )
}

function normalizeEpisode(episode) {
  const sourceIds = { ...episode.sourceIds }

  return createEpisode({
    id: episode.id,
    title: episode.title,
    plot: episode.plot,
    season: episode.season,
    episode: episode.episode,
    date: episode.date,
    poster: episode.poster,
    ratings: episode.ratings.map((rating) =>
      normalizeRating(rating, sourceIds)
    ),
    sourceIds
  })
}

function normalizeDiagnostic(provider) {
  return {
    provider: 'ratingsdb',
    role: 'source',
    source: provider.source,
    status: DIAGNOSTIC_STATUSES.get(provider.status) ?? 'skipped',
    serverStatus: provider.status,
    contributed: provider.contributed,
    reason: provider.reason ?? null,
    lastSuccessAt: provider.lastSuccessAt ?? null,
    expiresAt: provider.expiresAt ?? null
  }
}

export function normalizeRatingsdbCard(card) {
  if (
    !isSeriesRef(card?.id) ||
    typeof card?.title !== 'string' ||
    card.title.length === 0
  ) {
    return null
  }

  return createShow({
    id: `ratingsdb:${card.id}`,
    title: card.title,
    year: typeof card.year === 'string' ? card.year : '',
    poster: typeof card.poster === 'string' ? card.poster : null,
    genres: Array.isArray(card.genres) ? [...card.genres] : [],
    ratings: [],
    externalIds:
      card.externalIds && typeof card.externalIds === 'object'
        ? { ...card.externalIds }
        : {}
  })
}

export function normalizeRatingsdbSearch(body) {
  if (!Array.isArray(body?.results)) {
    return []
  }

  return body.results.map(normalizeRatingsdbCard).filter(Boolean)
}

export function normalizeRatingsdbBundle(bundle) {
  const show = createShow({
    id: `ratingsdb:${bundle.show.id}`,
    title: bundle.show.title,
    year: bundle.show.year,
    endYear: bundle.show.endYear,
    plot: bundle.show.plot,
    poster: bundle.show.poster,
    totalSeasons: bundle.show.totalSeasons,
    genres: [...bundle.show.genres],
    ratings: bundle.show.ratings.map((rating) => normalizeRating(rating)),
    externalIds: { ...bundle.show.externalIds }
  })
  const seasons = bundle.seasons.map((season) =>
    createSeason({
      number: season.number,
      title: season.title,
      episodes: season.episodes.map(normalizeEpisode)
    })
  )

  return {
    show,
    seasons,
    diagnostics: bundle.providers.map(normalizeDiagnostic),
    meta: {
      schemaVersion: bundle.schemaVersion,
      contentVersion: bundle.contentVersion,
      generatedAt: bundle.generatedAt,
      scoringProfile: bundle.scoringProfile,
      incomplete: bundle.incomplete,
      stats: {
        ...bundle.stats,
        rated: { ...bundle.stats.rated }
      }
    }
  }
}
