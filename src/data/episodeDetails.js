import { ALIGN_VERSION } from './align.js'

export const OMDB_EPISODE_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const OMDB_ERROR_RETRY_DELAY_MS = 60 * 1000
export const OMDB_DAILY_REQUEST_LIMIT = 250
export const OMDB_VIEW_REQUEST_LIMIT = 25

const CACHE_PREFIX = `graphtv:v1:align${ALIGN_VERSION}:omdb:episode:`
const LEDGER_KEY = 'graphtv:v1:omdb:request-ledger'

function getStorage(candidate) {
  if (candidate !== undefined) {
    return candidate
  }

  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readJson(storage, key) {
  if (!storage) {
    return null
  }

  try {
    const value = storage.getItem(key)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function writeJson(storage, key, value) {
  if (!storage) {
    return
  }

  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is an optimization. Private browsing and quota errors must not break details.
  }
}

function removeItem(storage, key) {
  if (!storage) {
    return
  }

  try {
    storage.removeItem?.(key)
  } catch {
    // Storage cleanup is best-effort for the same reason writes are best-effort.
  }
}

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function mergeOmdbVotes(episode, votes) {
  return {
    ...episode,
    ratings: episode.ratings.map((rating) =>
      rating.source === 'omdb'
        ? {
            ...rating,
            votes,
            votesStatus: typeof votes === 'number' ? 'loaded' : 'unavailable'
          }
        : rating
    )
  }
}

function isQuotaError(error) {
  return (
    error?.status === 401 ||
    error?.status === 429 ||
    (error?.provider === 'omdb' && (error?.code === 'quota' || error?.code === 'auth'))
  )
}

export function createEpisodeDetailLoader({
  loadProvider,
  expectedSeriesId,
  primarySource,
  storage: storageCandidate,
  now = () => Date.now(),
  dailyLimit = OMDB_DAILY_REQUEST_LIMIT,
  viewLimit = OMDB_VIEW_REQUEST_LIMIT
}) {
  const storage = getStorage(storageCandidate)
  const memoryCache = new Map()
  const failureCache = new Map()
  const inFlight = new Map()
  const controllers = new Set()
  let requests = 0
  let cacheHits = 0
  let disabledReason = null

  function readCachedVotes(imdbId) {
    if (memoryCache.has(imdbId)) {
      cacheHits += 1
      return memoryCache.get(imdbId)
    }

    const cached = readJson(storage, `${CACHE_PREFIX}${imdbId}`)
    if (!cached || cached.expiresAt <= now()) {
      if (cached) {
        removeItem(storage, `${CACHE_PREFIX}${imdbId}`)
      }
      return undefined
    }

    cacheHits += 1
    memoryCache.set(imdbId, cached.votes)
    return cached.votes
  }

  function reserveRequest() {
    if (disabledReason) {
      throw new Error(disabledReason)
    }
    if (requests >= viewLimit) {
      throw new Error('OMDb episode-detail request limit reached for this page view.')
    }

    const timestamp = now()
    const day = utcDay(timestamp)
    const storedLedger = readJson(storage, LEDGER_KEY)
    const ledger = storedLedger?.day === day ? storedLedger : { day, count: 0 }
    if (ledger.count >= dailyLimit) {
      disabledReason = 'OMDb episode-detail daily request budget reached.'
      throw new Error(disabledReason)
    }

    requests += 1
    writeJson(storage, LEDGER_KEY, { day, count: ledger.count + 1 })
  }

  async function load(episode) {
    const imdbId = episode.sourceIds?.omdb
    const omdbRating = episode.ratings.find((rating) => rating.source === 'omdb')
    const trustedMatch =
      primarySource === 'omdb' || omdbRating?.provenance?.confidence === 'strong'
    if (!imdbId || !omdbRating || !trustedMatch || typeof omdbRating.votes === 'number') {
      return episode
    }
    if (!expectedSeriesId) {
      throw new Error('An expected IMDb series ID is required for OMDb episode details.')
    }

    const cachedVotes = readCachedVotes(imdbId)
    if (cachedVotes !== undefined) {
      return mergeOmdbVotes(episode, cachedVotes)
    }

    if (inFlight.has(imdbId)) {
      return mergeOmdbVotes(episode, await inFlight.get(imdbId))
    }

    const recentFailure = failureCache.get(imdbId)
    if (recentFailure && recentFailure.expiresAt > now()) {
      throw recentFailure.error
    }
    failureCache.delete(imdbId)

    reserveRequest()
    const controller = new AbortController()
    controllers.add(controller)
    const request = loadProvider('omdb')
      .then((provider) =>
        provider.getEpisodeVoteCount(imdbId, {
          expectedSeriesId,
          signal: controller.signal
        })
      )
      .then((votes) => {
        memoryCache.set(imdbId, votes)
        writeJson(storage, `${CACHE_PREFIX}${imdbId}`, {
          votes,
          expiresAt: now() + OMDB_EPISODE_CACHE_TTL_MS
        })
        return votes
      })
      .catch((error) => {
        if (isQuotaError(error)) {
          disabledReason = error.message
        }
        if (error?.name !== 'AbortError') {
          failureCache.set(imdbId, {
            error,
            expiresAt: now() + OMDB_ERROR_RETRY_DELAY_MS
          })
        }
        throw error
      })
      .finally(() => {
        controllers.delete(controller)
        inFlight.delete(imdbId)
      })

    inFlight.set(imdbId, request)
    return mergeOmdbVotes(episode, await request)
  }

  load.getDebugState = () => ({
    requests,
    cacheHits,
    inFlight: inFlight.size,
    recentFailures: failureCache.size,
    viewLimit,
    dailyLimit,
    disabledReason
  })
  load.destroy = () => {
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  }

  return load
}
