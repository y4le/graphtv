import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('generate-client-secrets', () => {
  it('emits an empty module for hermetic browser-test builds', () => {
    const directory = mkdtempSync(join(tmpdir(), 'graphtv-secrets-'))

    try {
      writeFileSync(
        join(directory, '.env.local'),
        'TMDB_BEARER_TOKEN=file-token\nOMDB_API_KEY=file-key\n'
      )
      execFileSync(
        process.execPath,
        [resolve('scripts/generate-client-secrets.mjs')],
        {
          cwd: directory,
          env: {
            ...process.env,
            GRAPHTV_DISABLE_CLIENT_SECRETS: '1',
            TMDB_BEARER_TOKEN: 'process-token',
            OMDB_API_KEY: 'process-key'
          }
        }
      )

      const generated = readFileSync(
        join(directory, 'src/generated/clientSecrets.js'),
        'utf8'
      )
      expect(generated.match(/decodeSecret\(\[\]\)/gu)).toHaveLength(2)
      expect(generated).not.toContain('process-token')
      expect(generated).not.toContain('file-token')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
