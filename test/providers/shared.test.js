import { describe, expect, it } from 'vitest'

import { cleanHtmlSummary, createRatings } from '../../src/providers/shared.js'

describe('provider shared helpers', () => {
  it('converts provider HTML to decoded plain text', () => {
    expect(
      cleanHtmlSummary('<p>Tom &amp; Jerry <strong>forever</strong>.</p>')
    ).toBe('Tom & Jerry forever.')
  })

  it('returns null for empty summaries', () => {
    expect(cleanHtmlSummary(' <br> ')).toBeNull()
    expect(cleanHtmlSummary(null)).toBeNull()
  })

  it.each([0, -1, '0.0', 'N/A', 11])(
    'treats the legacy provider sentinel %j as missing',
    (value) => {
      expect(createRatings('tmdb', value, '1,234')).toStrictEqual([
        { source: 'tmdb', rating: null, votes: 1234 }
      ])
    }
  )

  it('parses positive legacy ratings and comma-formatted votes', () => {
    expect(createRatings('omdb', '8.6', '1,234')).toStrictEqual([
      { source: 'omdb', rating: 8.6, votes: 1234 }
    ])
  })
})
