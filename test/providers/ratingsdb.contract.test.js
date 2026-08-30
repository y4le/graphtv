import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import Ajv2020Import from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

const Ajv2020 = Ajv2020Import.default ?? Ajv2020Import
const pinnedCommit = 'b4ab24e2e4c5256ad845ec12c5b9c0f5917077c4'
const fixtureDirectory = join(process.cwd(), 'test', 'fixtures', 'ratingsdb')
const manifest = JSON.parse(
  readFileSync(
    join(process.cwd(), 'test', 'fixtures', 'ratingsdb.provenance.json'),
    'utf8'
  )
)
const externalContractsDirectory = process.env[manifest.compareEnv]

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })
}

describe('RatingsDB S01 chart contracts', () => {
  it('pins the source revision and complete fixture inventory', () => {
    const expectedPaths = manifest.files.map((file) => file.path)
    const actualPaths = listFiles(fixtureDirectory)
      .map((path) => relative(fixtureDirectory, path))
      .sort()

    expect(manifest.sourceRepository).toBe('ratingsdb')
    expect(manifest.sourceSlice).toBe('S01')
    expect(manifest.sourceCommit).toBe(pinnedCommit)
    expect(expectedPaths).toStrictEqual([...expectedPaths].sort())
    expect(actualPaths).toStrictEqual(expectedPaths)
    expect(
      manifest.files.filter((file) => file.kind === 'schema')
    ).toHaveLength(3)
    expect(
      manifest.files.filter((file) => file.kind === 'golden')
    ).toHaveLength(8)
  })

  it('matches every pinned SHA-256 digest', () => {
    for (const file of manifest.files) {
      expect(sha256(readFileSync(join(fixtureDirectory, file.path)))).toBe(
        file.sha256
      )
    }
  })

  it('compiles all schemas as strict Draft 2020-12', () => {
    const ajv = new Ajv2020({ strict: true })

    for (const file of manifest.files.filter(
      (candidate) => candidate.kind === 'schema'
    )) {
      expect(() =>
        ajv.compile(
          JSON.parse(readFileSync(join(fixtureDirectory, file.path), 'utf8'))
        )
      ).not.toThrow()
    }
  })

  it('validates every chart golden against the bundle schema', () => {
    const ajv = new Ajv2020({ strict: true })
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(
          join(fixtureDirectory, 'schemas', 'chart-bundle.v1.schema.json'),
          'utf8'
        )
      )
    )

    for (const file of manifest.files.filter(
      (candidate) => candidate.kind === 'golden'
    )) {
      expect(
        validate(JSON.parse(readFileSync(join(fixtureDirectory, file.path))))
      ).toBe(true)
    }
  })

  it.skipIf(!externalContractsDirectory)(
    'matches a local RatingsDB contract tree byte-for-byte',
    () => {
      for (const file of manifest.files) {
        expect(readFileSync(join(fixtureDirectory, file.path))).toStrictEqual(
          readFileSync(join(externalContractsDirectory, file.source))
        )
      }
    }
  )
})
