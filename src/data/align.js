export const ALIGN_VERSION = 1

export function normalizeEpisodeTitle(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/gu, ' and ')
    .replace(/[’']/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

function episodeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value ?? '') ? value : ''
}

function compareText(left, right) {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function compareEpisodes(left, right) {
  return (
    Number(left.episode ?? 0) - Number(right.episode ?? 0) ||
    compareText(String(left.title ?? ''), String(right.title ?? '')) ||
    compareText(String(left.id ?? ''), String(right.id ?? ''))
  )
}

function describeEpisode(episode) {
  return {
    id: episode.id,
    season: episode.season,
    episode: episode.episode,
    title: episode.title,
    date: episode.date ?? null
  }
}

function groupByKey(episodes, keyForEpisode) {
  const groups = new Map()

  for (const episode of episodes) {
    const key = keyForEpisode(episode)
    if (!key) {
      continue
    }

    const group = groups.get(key) ?? []
    group.push(episode)
    groups.set(key, group)
  }

  return groups
}

function matchingEvidence(primaryEpisode, supplementalEpisode) {
  const primaryTitle = normalizeEpisodeTitle(primaryEpisode.title)
  const supplementalTitle = normalizeEpisodeTitle(supplementalEpisode.title)
  const primaryDate = episodeDate(primaryEpisode.date)
  const supplementalDate = episodeDate(supplementalEpisode.date)

  return {
    title: primaryTitle && primaryTitle === supplementalTitle,
    date: primaryDate && primaryDate === supplementalDate
  }
}

export function alignSupplementalRecord(primarySeasons, supplementalRecord) {
  const matches = new Map()
  const entries = []
  const seasonReports = []
  const primaryBySeason = new Map(primarySeasons.map((season) => [season.number, season]))
  const supplementalBySeason = new Map(
    supplementalRecord.seasons.map((season) => [season.number, season])
  )
  const seasonNumbers = Array.from(
    new Set([...primaryBySeason.keys(), ...supplementalBySeason.keys()])
  ).sort((left, right) => left - right)

  for (const seasonNumber of seasonNumbers) {
    const primaryEpisodes = [...(primaryBySeason.get(seasonNumber)?.episodes ?? [])].sort(
      compareEpisodes
    )
    const supplementalEpisodes = [
      ...(supplementalBySeason.get(seasonNumber)?.episodes ?? [])
    ].sort(compareEpisodes)
    const unmatchedPrimary = new Set(primaryEpisodes)
    const unmatchedSupplemental = new Set(supplementalEpisodes)
    const seasonEntries = []

    function matchUnique(strategy, confidence, keyForEpisode) {
      const primaryGroups = groupByKey(unmatchedPrimary, keyForEpisode)
      const supplementalGroups = groupByKey(unmatchedSupplemental, keyForEpisode)
      const keys = Array.from(primaryGroups.keys())
        .filter((key) => supplementalGroups.has(key))
        .sort()

      for (const key of keys) {
        const primaryGroup = primaryGroups.get(key)
        const supplementalGroup = supplementalGroups.get(key)
        if (primaryGroup.length !== 1 || supplementalGroup.length !== 1) {
          continue
        }

        const primaryEpisode = primaryGroup[0]
        const supplementalEpisode = supplementalGroup[0]
        const match = {
          primaryEpisode,
          supplementalEpisode,
          strategy,
          confidence
        }

        matches.set(primaryEpisode.id, match)
        unmatchedPrimary.delete(primaryEpisode)
        unmatchedSupplemental.delete(supplementalEpisode)
        seasonEntries.push({
          type: 'matched',
          source: supplementalRecord.provider,
          strategy,
          confidence,
          primary: describeEpisode(primaryEpisode),
          supplemental: describeEpisode(supplementalEpisode)
        })
      }
    }

    matchUnique('title-date', 'strong', (episode) => {
      const title = normalizeEpisodeTitle(episode.title)
      const date = episodeDate(episode.date)
      return title && date ? `${title}\u0000${date}` : ''
    })
    matchUnique('title', 'strong', (episode) => normalizeEpisodeTitle(episode.title))
    matchUnique('date', 'moderate', (episode) => episodeDate(episode.date))

    const ambiguousPrimary = new Set()
    const ambiguousSupplemental = new Set()

    for (const primaryEpisode of unmatchedPrimary) {
      const candidates = Array.from(unmatchedSupplemental).filter((supplementalEpisode) => {
        const evidence = matchingEvidence(primaryEpisode, supplementalEpisode)
        return evidence.title || evidence.date
      })

      if (candidates.length === 0) {
        continue
      }

      ambiguousPrimary.add(primaryEpisode)
      candidates.forEach((episode) => ambiguousSupplemental.add(episode))
      seasonEntries.push({
        type: 'ambiguous',
        source: supplementalRecord.provider,
        primary: describeEpisode(primaryEpisode),
        candidates: candidates.sort(compareEpisodes).map(describeEpisode)
      })
    }

    for (const primaryEpisode of unmatchedPrimary) {
      if (ambiguousPrimary.has(primaryEpisode)) {
        continue
      }

      seasonEntries.push({
        type: 'unmatched_primary',
        source: supplementalRecord.provider,
        primary: describeEpisode(primaryEpisode)
      })
    }

    for (const supplementalEpisode of unmatchedSupplemental) {
      if (ambiguousSupplemental.has(supplementalEpisode)) {
        continue
      }

      seasonEntries.push({
        type: 'unmatched_supplemental',
        source: supplementalRecord.provider,
        supplemental: describeEpisode(supplementalEpisode)
      })
    }

    entries.push(...seasonEntries)
    seasonReports.push({
      season: seasonNumber,
      primaryCount: primaryEpisodes.length,
      supplementalCount: supplementalEpisodes.length,
      matched: seasonEntries.filter((entry) => entry.type === 'matched').length,
      ambiguous: seasonEntries.filter((entry) => entry.type === 'ambiguous').length,
      unmatchedPrimary: seasonEntries.filter((entry) => entry.type === 'unmatched_primary').length,
      unmatchedSupplemental: seasonEntries.filter(
        (entry) => entry.type === 'unmatched_supplemental'
      ).length
    })
  }

  return {
    matches,
    report: {
      provider: supplementalRecord.provider,
      alignVersion: ALIGN_VERSION,
      seasons: seasonReports,
      entries
    }
  }
}
