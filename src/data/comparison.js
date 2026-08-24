import {
  MIN_PRIMARY_RATING_COVERAGE,
  RATING_SOURCE_PRIORITY,
  isUsableProviderRating,
  selectPrimaryRatingSource
} from './stats.js'

export const COMPARISON_SLOT_IDS = Object.freeze(['a', 'b'])

export function getComparisonEpisodeCount(seasons = []) {
  return seasons.reduce(
    (count, season) => count + (season.episodes?.length ?? 0),
    0
  )
}

export function selectComparisonRatingSource(
  seasonsBySlot,
  {
    priority = RATING_SOURCE_PRIORITY,
    minimumCoverage = MIN_PRIMARY_RATING_COVERAGE
  } = {}
) {
  const reports = Object.fromEntries(
    COMPARISON_SLOT_IDS.map((slot) => {
      const episodes = (seasonsBySlot?.[slot] ?? []).flatMap(
        (season) => season.episodes ?? []
      )
      return [
        slot,
        selectPrimaryRatingSource(episodes, { priority, minimumCoverage })
      ]
    })
  )
  const coverageBySlot = Object.fromEntries(
    COMPARISON_SLOT_IDS.map((slot) => [
      slot,
      new Map(reports[slot].coverage.map((entry) => [entry.source, entry]))
    ])
  )
  const discoveredSources = COMPARISON_SLOT_IDS.flatMap((slot) =>
    reports[slot].coverage.map((entry) => entry.source)
  )
  const candidates = [...priority, ...discoveredSources].filter(
    (source, index, values) => source && values.indexOf(source) === index
  )
  const availableSources = candidates.filter((source) =>
    COMPARISON_SLOT_IDS.every(
      (slot) =>
        (coverageBySlot[slot].get(source)?.coverage ?? 0) >= minimumCoverage
    )
  )

  return {
    source: availableSources[0] ?? null,
    availableSources,
    comparable: availableSources.length > 0,
    minimumCoverage,
    reports,
    fallbackSources: Object.fromEntries(
      COMPARISON_SLOT_IDS.map((slot) => [slot, reports[slot].source])
    )
  }
}

export function getComparisonRatings(seasons = [], source) {
  if (!source) {
    return []
  }

  return seasons
    .flatMap((season) => season.episodes ?? [])
    .map((episode) =>
      episode.ratings?.find(
        (rating) => rating.source === source && isUsableProviderRating(rating)
      )
    )
    .filter(Boolean)
    .map((rating) => rating.rating)
}

export function parseComparisonSelection(value) {
  const match = /^(a|b):(.+)$/u.exec(value ?? '')
  return match ? { slot: match[1], selection: match[2] } : null
}

export function parseComparisonSelections(value) {
  const selections = String(value ?? '')
    .split(',')
    .map(parseComparisonSelection)
    .filter(Boolean)
  const bySlot = new Map(
    selections.map((selection) => [selection.slot, selection])
  )
  return COMPARISON_SLOT_IDS.map((slot) => bySlot.get(slot)).filter(Boolean)
}

export function formatComparisonSelection(slot, selection) {
  return COMPARISON_SLOT_IDS.includes(slot) && selection
    ? `${slot}:${selection}`
    : null
}

export function formatComparisonSelections(selections = []) {
  const bySlot = new Map(
    selections
      .filter(Boolean)
      .map((selection) => [selection.slot, selection.selection])
  )
  return COMPARISON_SLOT_IDS.map((slot) =>
    formatComparisonSelection(slot, bySlot.get(slot))
  )
    .filter(Boolean)
    .join(',')
}
