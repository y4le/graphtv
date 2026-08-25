import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { buildFavicons } from '../../scripts/build-favicons.mjs'

const PAPER = [0xfd, 0xfc, 0xf8]
const INK = [0x1a, 0x1a, 0x1a]
const SPOT = [0xc1, 0x43, 0x2e]

describe('favicon builder', () => {
  const temporaryDirectories = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('writes opaque PNG app icons at the declared dimensions', () => {
    const directory = createTemporaryDirectory()
    buildFavicons(directory)

    for (const [filename, size] of [
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512]
    ]) {
      const generated = decodePng(readFileSync(join(directory, filename)))
      const committed = decodePng(
        readFileSync(join(process.cwd(), 'public', filename))
      )

      expect(generated).toMatchObject({
        width: size,
        height: size,
        colorType: 2
      })
      expect(generated.pixels).toEqual(committed.pixels)
      expect(pixelAt(generated, 0, 0)).toEqual(PAPER)
    }

    const maskable = decodePng(readFileSync(join(directory, 'icon-512.png')))
    expect(maxPaintedRadius(maskable)).toBeLessThan(maskable.width * 0.4)
  })

  it('writes exact, hand-hinted 16px and 32px BMP frames to the ICO', () => {
    const directory = createTemporaryDirectory()
    buildFavicons(directory)
    const generated = decodeIco(readFileSync(join(directory, 'favicon.ico')))
    const committed = decodeIco(
      readFileSync(join(process.cwd(), 'public', 'favicon.ico'))
    )

    expect(generated.map(({ size }) => size)).toEqual([16, 32])
    expect(generated.map(({ pixels }) => pixels)).toEqual(
      committed.map(({ pixels }) => pixels)
    )

    const [sixteen, thirtyTwo] = generated
    expect(colorCounts(sixteen)).toEqual({
      [PAPER.join(',')]: 224,
      [INK.join(',')]: 22,
      [SPOT.join(',')]: 10
    })
    for (let y = 3; y < 13; y += 1) {
      expect(pixelAt(sixteen, 8, y)).toEqual(SPOT)
    }

    expect(colorCounts(thirtyTwo)).toEqual({
      [PAPER.join(',')]: 896,
      [INK.join(',')]: 88,
      [SPOT.join(',')]: 40
    })
  })

  function createTemporaryDirectory() {
    const directory = mkdtempSync(join(tmpdir(), 'graphtv-favicons-'))
    temporaryDirectories.push(directory)
    return directory
  }
})

function decodePng(buffer) {
  expect(buffer.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  )

  let offset = 8
  let header
  const compressed = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') header = data
    if (type === 'IDAT') compressed.push(data)
    offset += length + 12
  }

  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  const colorType = header[9]
  const rowLength = width * 3
  const raw = inflateSync(Buffer.concat(compressed))
  const pixels = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (rowLength + 1)
    expect(raw[rowOffset]).toBe(0)
    raw.copy(pixels, y * rowLength, rowOffset + 1, rowOffset + 1 + rowLength)
  }

  return { width, height, colorType, pixels }
}

function decodeIco(buffer) {
  expect(buffer.readUInt16LE(2)).toBe(1)
  const frameCount = buffer.readUInt16LE(4)

  return Array.from({ length: frameCount }, (_, index) => {
    const entryOffset = 6 + index * 16
    const size = buffer[entryOffset] || 256
    const imageOffset = buffer.readUInt32LE(entryOffset + 12)
    expect(buffer.readUInt16LE(entryOffset + 6)).toBe(32)
    expect(buffer.readUInt32LE(imageOffset)).toBe(40)
    expect(buffer.readInt32LE(imageOffset + 4)).toBe(size)
    expect(buffer.readInt32LE(imageOffset + 8)).toBe(size * 2)

    const pixels = Buffer.alloc(size * size * 3)
    const bitmapOffset = imageOffset + 40
    for (let y = 0; y < size; y += 1) {
      const sourceY = size - y - 1
      for (let x = 0; x < size; x += 1) {
        const sourceOffset = bitmapOffset + (sourceY * size + x) * 4
        const targetOffset = (y * size + x) * 3
        pixels[targetOffset] = buffer[sourceOffset + 2]
        pixels[targetOffset + 1] = buffer[sourceOffset + 1]
        pixels[targetOffset + 2] = buffer[sourceOffset]
        expect(buffer[sourceOffset + 3]).toBe(0xff)
      }
    }

    return { size, width: size, height: size, pixels }
  })
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 3
  return [...image.pixels.subarray(offset, offset + 3)]
}

function colorCounts(image) {
  const counts = {}
  for (let offset = 0; offset < image.pixels.length; offset += 3) {
    const color = [...image.pixels.subarray(offset, offset + 3)].join(',')
    counts[color] = (counts[color] ?? 0) + 1
  }
  return counts
}

function maxPaintedRadius(image) {
  const center = image.width / 2
  let maximum = 0

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (pixelAt(image, x, y).join(',') === PAPER.join(',')) continue
      maximum = Math.max(
        maximum,
        Math.hypot(x + 0.5 - center, y + 0.5 - center)
      )
    }
  }

  return maximum
}
