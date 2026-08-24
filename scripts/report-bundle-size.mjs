import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptPath)
const repositoryDir = resolve(scriptDir, '..')
const distDir = resolve(repositoryDir, 'dist')
const budgetPath = resolve(repositoryDir, 'bundle-budget.json')
const manifestPath = '.vite/manifest.json'

export function readBudget(filePath = budgetPath) {
  const budget = JSON.parse(readFileSync(filePath, 'utf8'))
  assertPositiveInteger(
    budget?.hard?.criticalPath?.maxGzipBytes,
    'hard.criticalPath.maxGzipBytes'
  )

  const routes = budget?.hard?.routes
  if (!routes || Object.keys(routes).length === 0) {
    throw new Error('hard.routes must define at least one route budget.')
  }
  for (const [name, route] of Object.entries(routes)) {
    if (typeof route?.entry !== 'string' || route.entry.length === 0) {
      throw new Error(`hard.routes.${name}.entry must be a source path.`)
    }
    assertPositiveInteger(
      route.maxGzipBytes,
      `hard.routes.${name}.maxGzipBytes`
    )
  }

  const warningFraction = budget?.advisory?.budgetWarningFraction
  if (
    typeof warningFraction !== 'number' ||
    warningFraction <= 0 ||
    warningFraction >= 1
  ) {
    throw new Error(
      'advisory.budgetWarningFraction must be greater than 0 and less than 1.'
    )
  }
  assertPositiveInteger(
    budget?.advisory?.maxSingleChunkGzipBytes,
    'advisory.maxSingleChunkGzipBytes'
  )
  assertPositiveInteger(
    budget?.advisory?.totalGzipBytes,
    'advisory.totalGzipBytes'
  )
  const features = budget?.advisory?.features
  if (!features || Object.keys(features).length === 0) {
    throw new Error('advisory.features must define at least one feature.')
  }
  for (const [name, entry] of Object.entries(features)) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`advisory.features.${name} must be a source path.`)
    }
  }

  return budget
}

export function collectStaticFiles(manifest, startKeys) {
  const files = new Set()
  const visited = new Set()

  function visit(key) {
    if (visited.has(key)) {
      return
    }
    const entry = manifest[key]
    if (!entry) {
      throw new Error(`build manifest is missing entry "${key}".`)
    }

    visited.add(key)
    if (entry.file) {
      files.add(entry.file)
    }
    for (const cssFile of entry.css ?? []) {
      files.add(cssFile)
    }
    for (const assetFile of entry.assets ?? []) {
      files.add(assetFile)
    }
    for (const importedKey of entry.imports ?? []) {
      visit(importedKey)
    }
  }

  for (const key of startKeys) {
    visit(key)
  }
  return files
}

export function evaluateBudget({
  criticalPathGzipBytes,
  routeGzipBytes,
  largestJavaScriptGzipBytes,
  totalGzipBytes,
  budget
}) {
  const violations = []
  const warnings = []
  const checks = [
    {
      name: 'critical path',
      measured: criticalPathGzipBytes,
      maximum: budget.hard.criticalPath.maxGzipBytes
    },
    ...Object.entries(budget.hard.routes).map(([name, route]) => ({
      name: `${name} route`,
      measured: routeGzipBytes[name],
      maximum: route.maxGzipBytes
    }))
  ]

  for (const { name, measured, maximum } of checks) {
    if (!Number.isSafeInteger(measured) || measured < 0) {
      violations.push(`${name} was not measured.`)
      continue
    }
    if (measured > maximum) {
      violations.push(`${name} gzip ${measured} B exceeds ${maximum} B`)
    } else if (measured >= maximum * budget.advisory.budgetWarningFraction) {
      warnings.push(
        `${name} gzip ${measured} B is within ${formatPercent(1 - budget.advisory.budgetWarningFraction)} of its ${maximum} B budget`
      )
    }
  }

  if (largestJavaScriptGzipBytes > budget.advisory.maxSingleChunkGzipBytes) {
    warnings.push(
      `largest JavaScript chunk gzip ${largestJavaScriptGzipBytes} B exceeds the ${budget.advisory.maxSingleChunkGzipBytes} B review threshold`
    )
  }
  if (totalGzipBytes > budget.advisory.totalGzipBytes) {
    warnings.push(
      `total emitted gzip ${totalGzipBytes} B exceeds the ${budget.advisory.totalGzipBytes} B review threshold`
    )
  }

  return { violations, warnings }
}

export function reportBundleSize(directory = distDir, budget = readBudget()) {
  const metrics = createFileMetrics(directory)
  const sortedMetrics = [...metrics.values()].sort(
    (left, right) =>
      right.gzipBytes - left.gzipBytes || left.file.localeCompare(right.file)
  )
  const totalRawBytes = sortedMetrics.reduce(
    (total, metric) => total + metric.rawBytes,
    0
  )
  const totalGzipBytes = sortedMetrics.reduce(
    (total, metric) => total + metric.gzipBytes,
    0
  )
  const largestJavaScript = sortedMetrics.find((metric) =>
    metric.file.endsWith('.js')
  ) ?? { file: 'none', gzipBytes: 0 }

  console.log('Emitted application files:')
  for (const metric of sortedMetrics) {
    console.log(
      `${metric.file}: ${metric.rawBytes} B raw / ${metric.gzipBytes} B gzip`
    )
  }

  let criticalPathGzipBytes = null
  const routeGzipBytes = {}
  const featureGzipBytes = {}
  const measurementErrors = []
  const measurementWarnings = []
  let manifest = null
  let entryKey = null
  let criticalFiles = null

  try {
    manifest = JSON.parse(readFileSync(join(directory, manifestPath), 'utf8'))
    const entryKeys = Object.entries(manifest)
      .filter(([, entry]) => entry.isEntry)
      .map(([key]) => key)
    if (entryKeys.length !== 1) {
      throw new Error(
        entryKeys.length === 0
          ? 'build manifest contains no application entry.'
          : `build manifest contains ${entryKeys.length} application entries; expected exactly one.`
      )
    }

    entryKey = entryKeys[0]
    criticalFiles = collectStaticFiles(manifest, [entryKey])
    criticalPathGzipBytes = measureFiles(metrics, criticalFiles).gzipBytes
  } catch (error) {
    measurementErrors.push(error?.message ?? String(error))
  }

  if (manifest && entryKey && criticalFiles) {
    for (const [name, route] of Object.entries(budget.hard.routes)) {
      try {
        const routeFiles = collectStaticFiles(manifest, [entryKey, route.entry])
        routeGzipBytes[name] = measureFiles(metrics, routeFiles).gzipBytes
      } catch (error) {
        measurementErrors.push(error?.message ?? String(error))
      }
    }

    for (const [name, featureEntry] of Object.entries(
      budget.advisory.features
    )) {
      if (!manifest[featureEntry]) {
        featureGzipBytes[name] = null
        measurementWarnings.push(
          `${name} feature entry "${featureEntry}" was not found in the build manifest`
        )
        continue
      }
      try {
        const featureFiles = collectStaticFiles(manifest, [featureEntry])
        for (const criticalFile of criticalFiles) {
          featureFiles.delete(criticalFile)
        }
        featureGzipBytes[name] = measureFiles(metrics, featureFiles).gzipBytes
      } catch (error) {
        featureGzipBytes[name] = null
        measurementWarnings.push(error?.message ?? String(error))
      }
    }
  }

  console.log('\nInitial route payloads:')
  console.log(
    formatBudgetLine(
      'critical path',
      criticalPathGzipBytes,
      budget.hard.criticalPath.maxGzipBytes
    )
  )
  for (const [name, route] of Object.entries(budget.hard.routes)) {
    console.log(
      formatBudgetLine(
        `${name} route`,
        routeGzipBytes[name],
        route.maxGzipBytes
      )
    )
  }

  if (Object.keys(featureGzipBytes).length > 0) {
    console.log('\nDeferred feature payloads:')
    for (const [name, gzipBytes] of Object.entries(featureGzipBytes)) {
      console.log(
        `${name}: ${Number.isSafeInteger(gzipBytes) ? `${gzipBytes} B gzip` : 'not measured'}`
      )
    }
  }

  console.log(
    `\nLargest JavaScript chunk: ${largestJavaScript.file} / ${largestJavaScript.gzipBytes} B gzip`
  )
  console.log(
    `Total emitted application files: ${totalRawBytes} B raw / ${totalGzipBytes} B gzip`
  )

  const evaluation = evaluateBudget({
    criticalPathGzipBytes,
    routeGzipBytes,
    largestJavaScriptGzipBytes: largestJavaScript.gzipBytes,
    totalGzipBytes,
    budget
  })
  evaluation.violations.unshift(...new Set(measurementErrors))
  evaluation.warnings.unshift(...measurementWarnings)
  for (const warning of evaluation.warnings) {
    reportAdvisory(warning)
  }
  if (evaluation.violations.length > 0) {
    console.error(`Bundle budget exceeded: ${evaluation.violations.join('; ')}`)
  }

  return {
    rawBytes: totalRawBytes,
    gzipBytes: totalGzipBytes,
    criticalPathGzipBytes,
    routeGzipBytes,
    featureGzipBytes,
    largestJavaScriptFile: largestJavaScript.file,
    largestJavaScriptGzipBytes: largestJavaScript.gzipBytes,
    violations: evaluation.violations,
    warnings: evaluation.warnings
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
}

function createFileMetrics(directory) {
  const metrics = new Map()
  for (const filePath of listFiles(directory)) {
    const file = normalizePath(relative(directory, filePath))
    if (file === manifestPath) {
      continue
    }
    const content = readFileSync(filePath)
    metrics.set(file, {
      file,
      rawBytes: content.length,
      gzipBytes: gzipSync(content, { level: 6 }).length
    })
  }
  return metrics
}

function listFiles(directory) {
  const files = []
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name)
  )

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath))
    } else {
      files.push(entryPath)
    }
  }
  return files
}

function measureFiles(metrics, files) {
  let rawBytes = 0
  let gzipBytes = 0
  for (const file of files) {
    const metric = metrics.get(file)
    if (!metric) {
      throw new Error(`build manifest references missing file "${file}".`)
    }
    rawBytes += metric.rawBytes
    gzipBytes += metric.gzipBytes
  }
  return { rawBytes, gzipBytes }
}

function normalizePath(filePath) {
  return filePath.split(sep).join('/')
}

function formatBudgetLine(name, measured, maximum) {
  return `${name}: ${Number.isSafeInteger(measured) ? `${measured} B` : 'not measured'} / ${maximum} B gzip budget`
}

function formatPercent(fraction) {
  return `${Math.round(fraction * 100)}%`
}

function reportAdvisory(message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::warning title=Bundle advisory::${message}`)
  } else {
    console.warn(`Bundle advisory: ${message}`)
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === scriptPath) {
  const { violations } = reportBundleSize()
  if (violations.length > 0) {
    process.exitCode = 1
  }
}
