import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(scriptDir, '../dist')

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

const files = listFiles(distDir)
const assetFiles = files.filter((filePath) => /\.(css|js)$/.test(filePath))

let rawBytes = 0
let gzipBytes = 0

for (const filePath of assetFiles) {
  const content = readFileSync(filePath)
  const gzipped = gzipSync(content).length
  rawBytes += statSync(filePath).size
  gzipBytes += gzipped
  console.log(`${join(...filePath.split('/').slice(-2))}: ${content.length} B raw / ${gzipped} B gzip`)
}

console.log(`Total assets: ${rawBytes} B raw / ${gzipBytes} B gzip`)
