import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  evaluateBudget,
  readLimit,
  reportBundleSize
} from '../../scripts/report-bundle-size.mjs'

describe('bundle-size budget', () => {
  const temporaryDirectories = []

  afterEach(() => {
    vi.restoreAllMocks()
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('uses defaults and validates overrides', () => {
    expect(readLimit('LIMIT', 90_000, {})).toBe(90_000)
    expect(readLimit('LIMIT', 90_000, { LIMIT: '1234' })).toBe(1234)
    expect(() => readLimit('LIMIT', 90_000, { LIMIT: '0' })).toThrow(
      'LIMIT must be a positive integer.'
    )
    expect(() => readLimit('LIMIT', 90_000, { LIMIT: 'nope' })).toThrow(
      'LIMIT must be a positive integer.'
    )
  })

  it('accepts a single entry within both budgets', () => {
    expect(
      evaluateBudget({
        totalGzipBytes: 80_000,
        entryGzipBytes: [70_000],
        largestJavaScriptGzipBytes: 70_000,
        maxTotalGzipBytes: 90_000,
        maxEntryGzipBytes: 75_000,
        maxLargestJavaScriptGzipBytes: 75_000
      })
    ).toEqual([])
  })

  it('reports total, entry, and largest chunk budget violations', () => {
    expect(
      evaluateBudget({
        totalGzipBytes: 90_001,
        entryGzipBytes: [75_001],
        largestJavaScriptGzipBytes: 80_001,
        maxTotalGzipBytes: 90_000,
        maxEntryGzipBytes: 75_000,
        maxLargestJavaScriptGzipBytes: 80_000
      })
    ).toEqual([
      'total gzip 90001 B exceeds 90000 B',
      'entry gzip 75001 B exceeds 75000 B',
      'largest JavaScript chunk gzip 80001 B exceeds 80000 B'
    ])
  })

  it('fails closed when the entry chunk cannot be identified uniquely', () => {
    expect(
      evaluateBudget({
        totalGzipBytes: 10,
        entryGzipBytes: [],
        largestJavaScriptGzipBytes: 5,
        maxTotalGzipBytes: 90_000,
        maxEntryGzipBytes: 75_000,
        maxLargestJavaScriptGzipBytes: 80_000
      })
    ).toContain(
      'no entry chunk matched index-*.js; entry budget was not evaluated'
    )

    expect(
      evaluateBudget({
        totalGzipBytes: 10,
        entryGzipBytes: [5, 5],
        largestJavaScriptGzipBytes: 5,
        maxTotalGzipBytes: 90_000,
        maxEntryGzipBytes: 75_000,
        maxLargestJavaScriptGzipBytes: 80_000
      })
    ).toContain('2 entry chunks matched index-*.js; expected exactly one')
  })

  it('measures generated assets and identifies the entry chunk', () => {
    const directory = createDistFixture({
      'assets/index-build.js': 'entry',
      'assets/styles.css': 'styles',
      'assets/ignored.txt': 'ignored'
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = reportBundleSize(directory, {})

    expect(result.rawBytes).toBe(11)
    expect(result.entryGzipBytes).toHaveLength(1)
    expect(result.largestJavaScriptGzipBytes).toBeGreaterThan(0)
    expect(result.violations).toEqual([])
  })

  it('fails closed when generated assets do not contain a named entry', () => {
    const directory = createDistFixture({
      'assets/main-build.js': 'entry'
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = reportBundleSize(directory, {})

    expect(result.violations).toContain(
      'no entry chunk matched index-*.js; entry budget was not evaluated'
    )
    expect(process.exitCode).not.toBe(1)
  })

  function createDistFixture(files) {
    const directory = mkdtempSync(join(tmpdir(), 'graphtv-bundle-'))
    temporaryDirectories.push(directory)

    for (const [relativePath, content] of Object.entries(files)) {
      const parentDirectory = join(directory, relativePath, '..')
      mkdirSync(parentDirectory, { recursive: true })
      writeFileSync(join(directory, relativePath), content)
    }

    return directory
  }
})
