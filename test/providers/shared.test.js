import { describe, expect, it } from 'vitest'

import { cleanHtmlSummary } from '../../src/providers/shared.js'

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
})
