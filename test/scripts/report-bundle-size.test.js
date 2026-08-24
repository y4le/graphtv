import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectStaticFiles,
  evaluateBudget,
  readBudget,
  reportBundleSize
} from '../../scripts/report-bundle-size.mjs'

describe('bundle-size budget', () => {
  const temporaryDirectories = []

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('loads and validates the committed budget', () => {
    expect(readBudget()).toMatchObject({
      hard: {
        criticalPath: { maxGzipBytes: 27_000 },
        routes: {
          search: { entry: 'src/pages/search.js', maxGzipBytes: 45_000 },
          results: { entry: 'src/pages/results.js' },
          compare: { entry: 'src/pages/compare.js' }
        }
      }
    })

    const invalidCriticalPath = createFileFixture(
      'budget.json',
      JSON.stringify(createBudget({ criticalPath: 0 }))
    )
    expect(() => readBudget(invalidCriticalPath)).toThrow(
      'hard.criticalPath.maxGzipBytes must be a positive integer.'
    )

    const invalidRoute = createBudget()
    invalidRoute.hard.routes.search.entry = ''
    const invalidRoutePath = createFileFixture(
      'budget.json',
      JSON.stringify(invalidRoute)
    )
    expect(() => readBudget(invalidRoutePath)).toThrow(
      'hard.routes.search.entry must be a source path.'
    )

    const invalidFeature = createBudget()
    invalidFeature.advisory.features.help = ''
    const invalidFeaturePath = createFileFixture(
      'budget.json',
      JSON.stringify(invalidFeature)
    )
    expect(() => readBudget(invalidFeaturePath)).toThrow(
      'advisory.features.help must be a source path.'
    )
  })

  it('walks static imports and assets once without following dynamic imports', () => {
    const manifest = {
      route: {
        file: 'route.js',
        imports: ['left', 'right'],
        css: ['route.css'],
        assets: ['route.woff2'],
        dynamicImports: ['lazy']
      },
      left: { file: 'left.js', imports: ['shared'] },
      right: { file: 'right.js', imports: ['shared'] },
      shared: { file: 'shared.js' },
      lazy: { file: 'lazy.js' }
    }

    expect([...collectStaticFiles(manifest, ['route'])].sort()).toEqual([
      'left.js',
      'right.js',
      'route.css',
      'route.js',
      'route.woff2',
      'shared.js'
    ])
  })

  it('hard-fails route regressions while keeping packaging metrics advisory', () => {
    const result = evaluateBudget({
      criticalPathGzipBytes: 80,
      routeGzipBytes: { search: 101, results: 80, compare: 80 },
      largestJavaScriptGzipBytes: 121,
      totalGzipBytes: 201,
      budget: createBudget()
    })

    expect(result.violations).toEqual(['search route gzip 101 B exceeds 100 B'])
    expect(result.warnings).toEqual([
      'largest JavaScript chunk gzip 121 B exceeds the 120 B review threshold',
      'total emitted gzip 201 B exceeds the 200 B review threshold'
    ])
  })

  it('hard-fails a critical-path regression', () => {
    const result = evaluateBudget({
      criticalPathGzipBytes: 101,
      routeGzipBytes: { search: 80, results: 80, compare: 80 },
      largestJavaScriptGzipBytes: 100,
      totalGzipBytes: 150,
      budget: createBudget()
    })

    expect(result.violations).toEqual([
      'critical path gzip 101 B exceeds 100 B'
    ])
  })

  it('warns before a hard budget is exhausted and fails closed on missing routes', () => {
    const result = evaluateBudget({
      criticalPathGzipBytes: 90,
      routeGzipBytes: { search: 90, results: 80 },
      largestJavaScriptGzipBytes: 100,
      totalGzipBytes: 150,
      budget: createBudget()
    })

    expect(result.warnings).toEqual([
      'critical path gzip 90 B is within 10% of its 100 B budget',
      'search route gzip 90 B is within 10% of its 100 B budget'
    ])
    expect(result.violations).toEqual(['compare route was not measured.'])
  })

  it('measures manifest-derived route and deferred-feature closures', () => {
    const fixture = createDistFixture()
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, createBudget(1000))

    expect(result.criticalPathGzipBytes).toBe(
      gzipBytes(fixture.files['assets/index-build.js']) +
        gzipBytes(fixture.files['assets/styles.css']) +
        gzipBytes(fixture.files['assets/entry-font.woff2'])
    )
    expect(result.routeGzipBytes.search).toBeGreaterThan(
      result.criticalPathGzipBytes
    )
    expect(result.routeGzipBytes.results).toBeGreaterThan(
      result.routeGzipBytes.search
    )
    expect(result.featureGzipBytes.help).toBeGreaterThan(0)
    expect(result.rawBytes).toBe(
      Object.entries(fixture.files)
        .filter(([file]) => file !== '.vite/manifest.json')
        .reduce((total, [, content]) => total + content.length, 0)
    )
    expect(result.violations).toEqual([])
  })

  it('identifies the application entry from the manifest, not its filename', () => {
    const fixture = createDistFixture({
      'assets/index-unrelated.js': 'unrelated lazy module'
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, createBudget(1000))

    expect(result.criticalPathGzipBytes).toBe(
      gzipBytes(fixture.files['assets/index-build.js']) +
        gzipBytes(fixture.files['assets/styles.css']) +
        gzipBytes(fixture.files['assets/entry-font.woff2'])
    )
    expect(result.violations).toEqual([])
  })

  it('fails closed when the manifest has multiple application entries', () => {
    const fixture = createDistFixture()
    const manifest = JSON.parse(fixture.files['.vite/manifest.json'])
    manifest.other = { file: 'assets/shared.js', isEntry: true }
    writeFileSync(
      join(fixture.directory, '.vite/manifest.json'),
      JSON.stringify(manifest)
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, createBudget(1000))

    expect(result.violations).toContain(
      'build manifest contains 2 application entries; expected exactly one.'
    )
  })

  it('fails closed when the manifest references an absent file', () => {
    const fixture = createDistFixture()
    const manifest = JSON.parse(fixture.files['.vite/manifest.json'])
    manifest['index.html'].assets.push('assets/missing.woff2')
    writeFileSync(
      join(fixture.directory, '.vite/manifest.json'),
      JSON.stringify(manifest)
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, createBudget(1000))

    expect(result.violations).toContain(
      'build manifest references missing file "assets/missing.woff2".'
    )
  })

  it('fails closed when a configured route is absent from the manifest', () => {
    const fixture = createDistFixture()
    const manifest = JSON.parse(fixture.files['.vite/manifest.json'])
    delete manifest['src/pages/compare.js']
    writeFileSync(
      join(fixture.directory, '.vite/manifest.json'),
      JSON.stringify(manifest)
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, createBudget(1000))

    expect(result.violations).toContain(
      'build manifest is missing entry "src/pages/compare.js".'
    )
  })

  it('advises instead of silently dropping a missing optional feature', () => {
    const fixture = createDistFixture()
    const budget = createBudget(1000)
    budget.advisory.features.ghost = 'src/ui/ghost.js'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = reportBundleSize(fixture.directory, budget)

    expect(result.featureGzipBytes.ghost).toBeNull()
    expect(result.warnings).toContain(
      'ghost feature entry "src/ui/ghost.js" was not found in the build manifest'
    )
    expect(result.violations).toEqual([])
  })

  it('emits advisories as GitHub Actions annotations', () => {
    const fixture = createDistFixture()
    const budget = createBudget(1000)
    budget.advisory.totalGzipBytes = 1
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    reportBundleSize(fixture.directory, budget)

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(
        /^::warning title=Bundle advisory::total emitted gzip/u
      )
    )
  })

  function createDistFixture(extraFiles = {}) {
    const manifest = {
      'index.html': {
        file: 'assets/index-build.js',
        isEntry: true,
        css: ['assets/styles.css'],
        assets: ['assets/entry-font.woff2'],
        dynamicImports: [
          'src/pages/search.js',
          'src/pages/results.js',
          'src/pages/compare.js',
          'src/ui/helpOverlay.js'
        ]
      },
      shared: { file: 'assets/shared.js' },
      'src/pages/search.js': {
        file: 'assets/search.js',
        imports: ['index.html', 'shared']
      },
      'src/pages/results.js': {
        file: 'assets/results.js',
        imports: ['index.html', 'shared', 'chart']
      },
      'src/pages/compare.js': {
        file: 'assets/compare.js',
        imports: ['index.html', 'shared', 'chart']
      },
      chart: { file: 'assets/chart.js' },
      'src/ui/helpOverlay.js': {
        file: 'assets/help.js',
        imports: ['index.html', 'debug'],
        css: ['assets/overlays.css']
      },
      debug: { file: 'assets/debug.js' }
    }
    const files = {
      'index.html': '<main>GraphTV</main>',
      'assets/index-build.js': 'entry',
      'assets/styles.css': 'styles',
      'assets/entry-font.woff2': 'font data',
      'assets/shared.js': 'shared',
      'assets/search.js': 'search',
      'assets/results.js': 'results payload',
      'assets/compare.js': 'compare payload',
      'assets/chart.js': 'shared chart payload',
      'assets/help.js': 'help',
      'assets/debug.js': 'debug',
      'assets/overlays.css': 'overlays',
      '.vite/manifest.json': JSON.stringify(manifest),
      ...extraFiles
    }
    const directory = createDirectoryFixture(files)
    return { directory, files }
  }

  function createFileFixture(relativePath, content) {
    const directory = createDirectoryFixture({ [relativePath]: content })
    return join(directory, relativePath)
  }

  function createDirectoryFixture(files) {
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

function createBudget(options = {}) {
  const normalized =
    typeof options === 'number' ? { maximum: options } : options
  const maximum = normalized.maximum ?? 100
  const criticalPath = normalized.criticalPath ?? maximum
  return {
    hard: {
      criticalPath: { maxGzipBytes: criticalPath },
      routes: {
        search: { entry: 'src/pages/search.js', maxGzipBytes: maximum },
        results: { entry: 'src/pages/results.js', maxGzipBytes: maximum },
        compare: { entry: 'src/pages/compare.js', maxGzipBytes: maximum }
      }
    },
    advisory: {
      budgetWarningFraction: 0.9,
      maxSingleChunkGzipBytes: 120,
      totalGzipBytes: 200,
      features: {
        help: 'src/ui/helpOverlay.js'
      }
    }
  }
}

function gzipBytes(content) {
  return gzipSync(content, { level: 6 }).length
}
