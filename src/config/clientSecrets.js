import { clientSecrets } from '../generated/clientSecrets.js'

export const CLIENT_SECRET_KEYS = {
  omdb: 'omdbApiKey',
  tmdb: 'tmdbBearerToken',
  tvdbApiKey: 'tvdbApiKey',
  tvdbReadToken: 'tvdbReadToken'
}

export function getClientSecret(secretKey) {
  return clientSecrets[secretKey] ?? ''
}

export function hasClientSecret(secretKey) {
  return Boolean(getClientSecret(secretKey))
}
