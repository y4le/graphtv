import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const outputFile = path.join(rootDir, 'src/generated/clientSecrets.js')

const SECRET_SPECS = [
  {
    exportKey: 'tmdbBearerToken',
    envKeys: ['TMDB_BEARER_TOKEN', 'VITE_TMDB_BEARER_TOKEN']
  },
  {
    exportKey: 'omdbApiKey',
    envKeys: ['OMDB_API_KEY', 'VITE_OMDB_API_KEY']
  }
]

const ENV_FILES = ['.env.local', '.env']

async function main() {
  const fileEnv = await readEnvFiles()
  const generated = renderSecretsModule(buildSecrets(fileEnv))

  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, generated)
}

function buildSecrets(fileEnv) {
  return Object.fromEntries(
    SECRET_SPECS.map(({ exportKey, envKeys }) => [
      exportKey,
      getSecretValue(envKeys, fileEnv)
    ])
  )
}

function getSecretValue(envKeys, fileEnv) {
  for (const key of envKeys) {
    const value = process.env[key] ?? fileEnv[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return ''
}

async function readEnvFiles() {
  const merged = {}

  for (const name of ENV_FILES) {
    const filePath = path.join(rootDir, name)
    try {
      const raw = await fs.readFile(filePath, 'utf8')
      Object.assign(merged, parseEnv(raw))
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  return merged
}

function parseEnv(raw) {
  const env = {}

  raw.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      return
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) {
      return
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    env[key] = stripWrappingQuotes(value)
  })

  return env
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function renderSecretsModule(secrets) {
  const lines = SECRET_SPECS.map(({ exportKey }) => {
    const encoded = encodeSecret(secrets[exportKey])
    return `  ${exportKey}: decodeSecret([${renderChunks(encoded)}]),`
  })

  return `function decodeSecret(parts) {
  const encoded = parts.join('')
  if (!encoded) {
    return ''
  }

  if (typeof atob === 'function') {
    return atob(encoded)
  }

  return Buffer.from(encoded, 'base64').toString('utf8')
}

export const clientSecrets = Object.freeze({
${lines.join('\n')}
})
`
}

function encodeSecret(value) {
  return Buffer.from(value, 'utf8').toString('base64')
}

function renderChunks(value) {
  if (!value) {
    return ''
  }

  const chunks = []
  for (let index = 0; index < value.length; index += 12) {
    chunks.push(JSON.stringify(value.slice(index, index + 12)))
  }
  return chunks.join(', ')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
