import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ALIGN_VERSION, alignSupplementalRecord } from '../../src/data/align.js'

const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'alignment')
const requiredEpisodeKeys = ['id', 'season', 'episode', 'title', 'date']
const fixtures = readdirSync(fixtureDirectory)
  .filter((filename) => filename.endsWith('.json'))
  .sort()
  .map((filename) => ({
    filename,
    ...JSON.parse(readFileSync(join(fixtureDirectory, filename), 'utf8'))
  }))

function groupBySeason(episodes) {
  const seasons = new Map()
  for (const episode of episodes) {
    for (const key of requiredEpisodeKeys) {
      if (!Object.hasOwn(episode, key)) {
        throw new Error(`alignment fixture episode is missing ${key}`)
      }
    }

    const group = seasons.get(episode.season) ?? []
    group.push(episode)
    seasons.set(episode.season, group)
  }
  return [...seasons].map(([number, groupedEpisodes]) => ({
    number,
    episodes: groupedEpisodes
  }))
}

describe('shared alignment fixtures', () => {
  it('keeps the canonical fixture count stable', () => {
    expect(fixtures).toHaveLength(10)
  })

  it.each(fixtures)('$filename: $name', (fixture) => {
    expect(fixture.alignVersion).toBe(ALIGN_VERSION)
    const alignment = alignSupplementalRecord(groupBySeason(fixture.primary), {
      provider: fixture.provider,
      seasons: groupBySeason(fixture.supplemental)
    })

    expect(alignment.report).toStrictEqual(fixture.expected)
    expect(alignment.report.alignVersion).toBe(ALIGN_VERSION)
    if (fixture.filename === '10-duplicate-primary-id.json') {
      expect(alignment.matches.get('duplicate')?.supplementalEpisode.id).toBe(
        's:two'
      )
    }
  })
})
