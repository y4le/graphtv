import { performance } from 'node:perf_hooks'

import { createCachedSeriesBreakpointDetector } from '../src/data/stats.js'
import { buildChartModel } from '../src/viz/scales.js'

const SAMPLE_COUNT = 5
const scenarios = [
  { seasons: 10, episodesPerSeason: 20 },
  { seasons: 20, episodesPerSeason: 25 },
  { seasons: 30, episodesPerSeason: 30 }
]

for (const scenario of scenarios) {
  const primary = createSeasons(scenario)
  const supplemented = createSeasons(scenario, { supplemental: true })
  buildChartModel(primary)

  const uncached = measure(() => buildChartModel(supplemented))
  const breakpointDetector = createCachedSeriesBreakpointDetector()
  buildChartModel(primary, { breakpointDetector })
  const cached = measure(() =>
    buildChartModel(supplemented, { breakpointDetector })
  )
  const episodeCount = scenario.seasons * scenario.episodesPerSeason

  console.log(
    `${episodeCount} episodes: uncached ${formatMilliseconds(uncached)}, cached supplemental ${formatMilliseconds(cached)}, ${Math.round(uncached / cached)}x faster`
  )
}

function measure(operation) {
  const samples = []

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const start = performance.now()
    operation()
    samples.push(performance.now() - start)
  }

  return samples.reduce((sum, sample) => sum + sample, 0) / samples.length
}

function formatMilliseconds(value) {
  return `${value.toFixed(1)} ms`
}

function createSeasons(
  { seasons, episodesPerSeason },
  { supplemental = false } = {}
) {
  let episodeId = 0

  return Array.from({ length: seasons }, (_, seasonIndex) => ({
    number: seasonIndex + 1,
    episodes: Array.from({ length: episodesPerSeason }, (_, episodeIndex) => {
      episodeId += 1
      const midpoint = (seasons * episodesPerSeason) / 2
      const rating = (episodeId < midpoint ? 8 : 6.5) + (episodeId % 5) / 10

      return {
        id: `episode-${episodeId}`,
        title: `Episode ${episodeId}`,
        season: seasonIndex + 1,
        episode: episodeIndex + 1,
        ratings: [
          { source: 'tvmaze', rating, votes: 1000 },
          ...(supplemental ? [{ source: 'tmdb', rating: 7.5, votes: 100 }] : [])
        ]
      }
    })
  }))
}
