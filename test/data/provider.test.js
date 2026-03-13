import { describe, expect, it } from 'vitest'

import { getProviderLabel, parseShowRef } from '../../src/data/provider.js'

describe('data/provider', () => {
  it('parses show refs into provider and id parts', () => {
    expect(parseShowRef('tvmaze:179')).toEqual({
      provider: 'tvmaze',
      id: '179'
    })
  })

  it('throws on invalid refs', () => {
    expect(() => parseShowRef('not-valid')).toThrow('Invalid show reference')
  })

  it('returns friendly provider labels', () => {
    expect(getProviderLabel('tvmaze')).toBe('TVmaze')
    expect(getProviderLabel('unknown')).toBe('unknown')
  })
})
