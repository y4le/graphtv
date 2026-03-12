import { createEpisode, createSeason, createShow, sortEpisodes, sortSeasons } from './schema.js'

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

function episodeKey(episode) {
  return `${episode.season}:${episode.episode}`
}

function mergeEpisode(primaryEpisode, fallbackEpisode) {
  return createEpisode({
    id: primaryEpisode.id,
    title: primaryEpisode.title,
    plot: pickValue(primaryEpisode.plot, fallbackEpisode?.plot),
    season: primaryEpisode.season,
    episode: primaryEpisode.episode,
    date: pickValue(primaryEpisode.date, fallbackEpisode?.date),
    ratings: mergeRatings(primaryEpisode.ratings, fallbackEpisode?.ratings),
    poster: pickValue(primaryEpisode.poster, fallbackEpisode?.poster)
  })
}

function findExtraEpisodes(primarySeasons, supplementalRecord) {
  const primaryEpisodeKeys = new Set(
    primarySeasons.flatMap((season) => season.episodes.map((episode) => episodeKey(episode)))
  )

  const mismatches = []

  for (const season of supplementalRecord.seasons) {
    for (const episode of season.episodes) {
      if (!primaryEpisodeKeys.has(episodeKey(episode))) {
        mismatches.push({
          source: supplementalRecord.provider,
          type: 'extra_episode',
          season: episode.season,
          episode: episode.episode,
          title: episode.title
        })
      }
    }
  }

  return mismatches
}

export function mergeShowRecords(primaryRecord, supplementalRecords = []) {
  const primaryShow = primaryRecord.show
  const mergedShow = createShow({
    ...primaryShow,
    plot: supplementalRecords.reduce((plot, record) => pickValue(plot, record.show.plot), primaryShow.plot),
    poster: supplementalRecords.reduce(
      (poster, record) => pickValue(poster, record.show.poster),
      primaryShow.poster
    ),
    totalSeasons: supplementalRecords.reduce(
      (totalSeasons, record) => Math.max(totalSeasons, record.show.totalSeasons),
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

  const supplementalEpisodeMaps = supplementalRecords.map((record) => ({
    provider: record.provider,
    episodes: new Map(
      record.seasons.flatMap((season) =>
        season.episodes.map((episode) => [episodeKey(episode), episode])
      )
    )
  }))

  const mergedSeasons = sortSeasons(
    primaryRecord.seasons.map((season) =>
      createSeason({
        number: season.number,
        title: season.title,
        episodes: sortEpisodes(
          season.episodes.map((episode) => {
            let mergedEpisode = episode

            for (const supplementalMap of supplementalEpisodeMaps) {
              mergedEpisode = mergeEpisode(
                mergedEpisode,
                supplementalMap.episodes.get(episodeKey(episode))
              )
            }

            return mergedEpisode
          })
        )
      })
    )
  )

  return {
    primarySource: primaryRecord.provider,
    show: mergedShow,
    seasons: mergedSeasons,
    sourceRecords: [primaryRecord, ...supplementalRecords],
    mismatches: supplementalRecords.flatMap((record) => findExtraEpisodes(primaryRecord.seasons, record))
  }
}
