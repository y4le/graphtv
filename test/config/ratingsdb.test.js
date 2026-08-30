import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getRatingsdbApiBase,
  isConfigured
} from '../../src/config/ratingsdb.js'

describe('RatingsDB deployment configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each([undefined, '', '   '])('treats %j as unconfigured', (value) => {
    expect(getRatingsdbApiBase({ VITE_RATINGSDB_API_BASE: value })).toBeNull()
    expect(isConfigured({ VITE_RATINGSDB_API_BASE: value })).toBe(false)
  })

  it('trims whitespace and trailing slashes', () => {
    expect(
      getRatingsdbApiBase({
        VITE_RATINGSDB_API_BASE: '  https://ratings.example/api///  '
      })
    ).toBe('https://ratings.example/api')
    expect(
      isConfigured({ VITE_RATINGSDB_API_BASE: 'https://ratings.example' })
    ).toBe(true)
  })

  it('accepts an HTTP localhost URL', () => {
    expect(
      getRatingsdbApiBase({
        VITE_RATINGSDB_API_BASE: 'http://localhost:3000/'
      })
    ).toBe('http://localhost:3000')
  })

  it.each(['ftp://ratings.example', 'not a URL', '/api'])(
    '%s is invalid',
    (value) => {
      expect(getRatingsdbApiBase({ VITE_RATINGSDB_API_BASE: value })).toBeNull()
      expect(isConfigured({ VITE_RATINGSDB_API_BASE: value })).toBe(false)
    }
  )

  it('uses the injected environment instead of the build environment', () => {
    vi.stubEnv('VITE_RATINGSDB_API_BASE', 'https://build.example')

    expect(
      getRatingsdbApiBase({
        VITE_RATINGSDB_API_BASE: 'https://injected.example/base/'
      })
    ).toBe('https://injected.example/base')
  })

  it('reads the build environment when no environment is injected', () => {
    vi.stubEnv('VITE_RATINGSDB_API_BASE', 'https://build.example/')

    expect(getRatingsdbApiBase()).toBe('https://build.example')
  })
})
