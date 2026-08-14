import { alignSupplementalRecord } from './align.js'
import {
  createEpisode,
  createSeason,
  createShow,
  sortEpisodes,
  sortSeasons
} from './schema.js'

function mergeRatings(...ratingSets) {
  const merged = new Map()

  for (const ratings of ratingSets) {
    for (const rating of ratings ?? []) {
      merged.set(rating.source, rating)
    }
  }

  return Array.from(merged.values())
}

function pickValue(primaryValue, fallbackValue) {
  return primaryValue ?? fallbackValue ?? null
}

function mergeEpisode(primaryEpisode, alignmentMatch, provider) {
  if (!alignmentMatch) {
    return createEpisode(primaryEpisode)
  }

  const { supplementalEpisode, strategy, confidence, evidence } = alignmentMatch
  const supplementalRatings = supplementalEpisode.ratings.map((rating) => ({
    ...rating,
    provenance: {
      providerEpisodeId: supplementalEpisode.id,
      strategy,
      confidence,
      evidence,
      relation: 'one-to-one'
    }
  }))

  const sourceIds = {
    ...primaryEpisode.sourceIds,
    ...supplementalEpisode.sourceIds
  }
  const nativeProviderId = supplementalEpisode.sourceIds?.[provider]
  if (nativeProviderId) {
    sourceIds[provider] = nativeProviderId
  } else {
    delete sourceIds[provider]
  }

  return createEpisode({
    id: primaryEpisode.id,
    title: primaryEpisode.title,
    plot: pickValue(primaryEpisode.plot, supplementalEpisode.plot),
    season: primaryEpisode.season,
    episode: primaryEpisode.episode,
    date: pickValue(primaryEpisode.date, supplementalEpisode.date),
    ratings: mergeRatings(primaryEpisode.ratings, supplementalRatings),
    poster: pickValue(primaryEpisode.poster, supplementalEpisode.poster),
    sourceIds
  })
}

export function mergeShowRecords(primaryRecord, supplementalRecords = []) {
  const primaryShow = primaryRecord.show
  const mergedShow = createShow({
    ...primaryShow,
    plot: supplementalRecords.reduce(
      (plot, record) => pickValue(plot, record.show.plot),
      primaryShow.plot
    ),
    poster: supplementalRecords.reduce(
      (poster, record) => pickValue(poster, record.show.poster),
      primaryShow.poster
    ),
    totalSeasons: supplementalRecords.reduce(
      (totalSeasons, record) =>
        Math.max(totalSeasons, record.show.totalSeasons),
      primaryShow.totalSeasons
    ),
    ratings: supplementalRecords.reduce(
      (ratings, record) => mergeRatings(ratings, record.show.ratings),
      primaryShow.ratings
    ),
    externalIds: supplementalRecords.reduce(
      (externalIds, record) => ({ ...record.show.externalIds, ...externalIds }),
      primaryShow.externalIds
    )
  })

  const alignments = supplementalRecords.map((record) => ({
    provider: record.provider,
    ...alignSupplementalRecord(primaryRecord.seasons, record)
  }))
  const mergedSeasons = sortSeasons(
    primaryRecord.seasons.map((season) =>
      createSeason({
        number: season.number,
        title: season.title,
        episodes: sortEpisodes(
          season.episodes.map((episode) => {
            let mergedEpisode = createEpisode(episode)

            for (const alignment of alignments) {
              mergedEpisode = mergeEpisode(
                mergedEpisode,
                alignment.matches.get(episode.id),
                alignment.provider
              )
            }

            return mergedEpisode
          })
        )
      })
    )
  )
  const alignmentReports = alignments.map((alignment) => alignment.report)
  const mismatches = alignmentReports.flatMap((report) =>
    report.entries.filter((entry) => entry.type !== 'matched')
  )
  const alignmentIssues = mismatches.filter(
    (entry) => entry.type === 'ambiguous'
  )

  return {
    primarySource: primaryRecord.provider,
    show: mergedShow,
    seasons: mergedSeasons,
    sourceRecords: [primaryRecord, ...supplementalRecords],
    alignment: alignmentReports,
    alignmentIssues,
    mismatches
  }
}
