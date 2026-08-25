// Builds the opaque raster fallbacks for GraphTV's theme-adaptive icon.
//
// The 16px ICO frame is hand-hinted instead of downscaled so the breakpoint
// marker remains one full-intensity pixel column. Larger app icons are drawn
// from the same 32-unit master with platform-safe padding.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const PAPER = [0xfd, 0xfc, 0xf8]
const INK = [0x1a, 0x1a, 0x1a]
const SPOT = [0xc1, 0x43, 0x2e]

const MASTER_RECTS = Object.freeze([
  { x: 4, y: 8, width: 11, height: 4, color: INK },
  { x: 15, y: 6, width: 2, height: 20, color: SPOT },
  { x: 17, y: 20, width: 11, height: 4, color: INK }
])

const FAVICON_RECTS = Object.freeze({
  16: [
    { x: 2, y: 4, width: 6, height: 2, color: INK },
    { x: 8, y: 3, width: 1, height: 10, color: SPOT },
    { x: 9, y: 10, width: 5, height: 2, color: INK }
  ],
  32: MASTER_RECTS
})

export function buildFavicons(outputDirectory = resolve('public')) {
  mkdirSync(outputDirectory, { recursive: true })

  const faviconFrames = [16, 32].map((size) => ({
    size,
    pixels: renderRects(size, FAVICON_RECTS[size])
  }))
  writeFileSync(
    resolve(outputDirectory, 'favicon.ico'),
    encodeIco(faviconFrames)
  )

  for (const [filename, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512]
  ]) {
    writeFileSync(
      resolve(outputDirectory, filename),
      encodePng(size, size, renderAppIcon(size))
    )
  }
}

function renderAppIcon(size) {
  const scale = size / 40
  const offset = (size - 32 * scale) / 2
  const rects = MASTER_RECTS.map((rect) => ({
    ...rect,
    x: offset + rect.x * scale,
    y: offset + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  }))
  return renderRects(size, rects)
}

function renderRects(size, rects) {
  const pixels = Buffer.alloc(size * size * 3)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const coverage = rects.map((rect) => pixelCoverage(x, y, rect))
      const painted = Math.min(
        1,
        coverage.reduce((sum, value) => sum + value, 0)
      )
      const offset = (y * size + x) * 3

      for (let channel = 0; channel < 3; channel += 1) {
        const value = rects.reduce(
          (sum, rect, index) => sum + rect.color[channel] * coverage[index],
          PAPER[channel] * (1 - painted)
        )
        pixels[offset + channel] = Math.min(255, Math.round(value))
      }
    }
  }

  return pixels
}

function pixelCoverage(x, y, rect) {
  const overlapWidth = Math.max(
    0,
    Math.min(x + 1, rect.x + rect.width) - Math.max(x, rect.x)
  )
  const overlapHeight = Math.max(
    0,
    Math.min(y + 1, rect.y + rect.height) - Math.max(y, rect.y)
  )
  return overlapWidth * overlapHeight
}

function encodePng(width, height, pixels) {
  const rowLength = width * 3
  const raw = Buffer.alloc((rowLength + 1) * height)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1)
    raw[rowOffset] = 0
    pixels.copy(raw, rowOffset + 1, y * rowLength, (y + 1) * rowLength)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length, 0)
  typeBuffer.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8)
  return chunk
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function encodeIco(frames) {
  const images = frames.map(({ size, pixels }) =>
    encodeBitmapIcon(size, pixels)
  )
  const directorySize = 6 + frames.length * 16
  const directory = Buffer.alloc(directorySize)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(frames.length, 4)

  let imageOffset = directorySize
  frames.forEach(({ size }, index) => {
    const entryOffset = 6 + index * 16
    directory[entryOffset] = size
    directory[entryOffset + 1] = size
    directory.writeUInt16LE(1, entryOffset + 4)
    directory.writeUInt16LE(32, entryOffset + 6)
    directory.writeUInt32LE(images[index].length, entryOffset + 8)
    directory.writeUInt32LE(imageOffset, entryOffset + 12)
    imageOffset += images[index].length
  })

  return Buffer.concat([directory, ...images])
}

function encodeBitmapIcon(size, pixels) {
  const xorBitmap = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    const sourceY = size - y - 1
    for (let x = 0; x < size; x += 1) {
      const sourceOffset = (sourceY * size + x) * 3
      const targetOffset = (y * size + x) * 4
      xorBitmap[targetOffset] = pixels[sourceOffset + 2]
      xorBitmap[targetOffset + 1] = pixels[sourceOffset + 1]
      xorBitmap[targetOffset + 2] = pixels[sourceOffset]
      xorBitmap[targetOffset + 3] = 0xff
    }
  }

  const maskRowLength = Math.ceil(size / 32) * 4
  const andMask = Buffer.alloc(maskRowLength * size)
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(xorBitmap.length, 20)

  return Buffer.concat([header, xorBitmap, andMask])
}

const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  buildFavicons()
  console.log('Wrote GraphTV favicon and app-icon raster fallbacks.')
}
