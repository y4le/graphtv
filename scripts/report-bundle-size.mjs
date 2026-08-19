import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptPath)
const distDir = resolve(scriptDir, '../dist')

export function readLimit(name, fallback, environment = process.env) {
  const rawValue = environment[name]
  if (rawValue === undefined) {
    return fallback
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`)
  }
  return value
}

export function evaluateBudget({
  totalGzipBytes,
  entryGzipBytes,
  largestJavaScriptGzipBytes,
  maxTotalGzipBytes,
  maxEntryGzipBytes,
  maxLargestJavaScriptGzipBytes
}) {
  const violations = []

  if (totalGzipBytes > maxTotalGzipBytes) {
    violations.push(
      `total gzip ${totalGzipBytes} B exceeds ${maxTotalGzipBytes} B`
    )
  }

  if (entryGzipBytes.length !== 1) {
    violations.push(
      entryGzipBytes.length === 0
        ? 'no entry chunk matched index-*.js; entry budget was not evaluated'
        : `${entryGzipBytes.length} entry chunks matched index-*.js; expected exactly one`
    )
  } else if (entryGzipBytes[0] > maxEntryGzipBytes) {
    violations.push(
      `entry gzip ${entryGzipBytes[0]} B exceeds ${maxEntryGzipBytes} B`
    )
  }

  if (largestJavaScriptGzipBytes > maxLargestJavaScriptGzipBytes) {
    violations.push(
      `largest JavaScript chunk gzip ${largestJavaScriptGzipBytes} B exceeds ${maxLargestJavaScriptGzipBytes} B`
    )
  }

  return violations
}

function listFiles(dirPath) {
  const entries = readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...listFiles(join(dirPath, entry.name)))
    } else {
      files.push(join(dirPath, entry.name))
    }
  }

  return files
}

export function reportBundleSize(
  directory = distDir,
  environment = process.env
) {
  const maxTotalGzipBytes = readLimit(
    'MAX_TOTAL_GZIP_BYTES',
    105_000,
    environment
  )
  const maxEntryGzipBytes = readLimit(
    'MAX_ENTRY_GZIP_BYTES',
    15_000,
    environment
  )
  const maxLargestJavaScriptGzipBytes = readLimit(
    'MAX_LARGEST_JAVASCRIPT_GZIP_BYTES',
    50_000,
    environment
  )
  const assetFiles = listFiles(directory).filter((filePath) =>
    /\.(css|js)$/u.test(filePath)
  )

  let rawBytes = 0
  let gzipBytes = 0
  const entryGzipBytes = []
  let largestJavaScriptGzipBytes = 0

  for (const filePath of assetFiles) {
    const content = readFileSync(filePath)
    const gzippedBytes = gzipSync(content).length
    rawBytes += statSync(filePath).size
    gzipBytes += gzippedBytes
    if (/\.js$/u.test(filePath)) {
      largestJavaScriptGzipBytes = Math.max(
        largestJavaScriptGzipBytes,
        gzippedBytes
      )
    }
    if (/\/index-[^/]+\.js$/u.test(filePath)) {
      entryGzipBytes.push(gzippedBytes)
    }
    console.log(
      `${join(...filePath.split('/').slice(-2))}: ${content.length} B raw / ${gzippedBytes} B gzip`
    )
  }

  console.log(`Total assets: ${rawBytes} B raw / ${gzipBytes} B gzip`)

  const violations = evaluateBudget({
    totalGzipBytes: gzipBytes,
    entryGzipBytes,
    largestJavaScriptGzipBytes,
    maxTotalGzipBytes,
    maxEntryGzipBytes,
    maxLargestJavaScriptGzipBytes
  })
  if (violations.length > 0) {
    console.error(`Bundle budget exceeded: ${violations.join('; ')}`)
  }

  return {
    rawBytes,
    gzipBytes,
    entryGzipBytes,
    largestJavaScriptGzipBytes,
    violations
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === scriptPath) {
  const { violations } = reportBundleSize()
  if (violations.length > 0) {
    process.exitCode = 1
  }
}
