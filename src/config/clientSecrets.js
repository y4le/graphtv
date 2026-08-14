import { clientSecrets } from '../generated/clientSecrets.js'

// This app intentionally ships keyed provider credentials, including TMDB, to the client.
// The generated module only obfuscates them enough to avoid trivial automated harvesting from git.
// It does not make them secret in the browser. Please be cool and do not abuse or scrape them.
export const CLIENT_SECRET_KEYS = {
  omdb: 'omdbApiKey',
  tmdb: 'tmdbBearerToken'
}

export function getClientSecret(secretKey) {
  return clientSecrets[secretKey] ?? ''
}

export function hasClientSecret(secretKey) {
  return Boolean(getClientSecret(secretKey))
}
