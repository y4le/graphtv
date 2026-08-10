import { describe, expect, it } from 'vitest'

import { POPULAR_SHOW_TITLES } from '../../src/data/popularShows.js'

describe('POPULAR_SHOW_TITLES', () => {
  it('preserves the curated list invariants', () => {
    const normalizedTitles = POPULAR_SHOW_TITLES.map((title) => title.toLowerCase())

    expect(POPULAR_SHOW_TITLES).toHaveLength(100)
    expect(new Set(normalizedTitles).size).toBe(POPULAR_SHOW_TITLES.length)
    expect(POPULAR_SHOW_TITLES.every((title) => title.length > 0 && title === title.trim())).toBe(true)
    expect(POPULAR_SHOW_TITLES.every((title) => /^[\x20-\x7e]+$/.test(title))).toBe(true)
    expect(Object.isFrozen(POPULAR_SHOW_TITLES)).toBe(true)
  })
})
