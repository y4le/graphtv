export const OMDB_ERROR_RETRY_DELAY_MS = 60 * 1000
export const OMDB_DAILY_REQUEST_LIMIT = 250
export const OMDB_VIEW_REQUEST_LIMIT = 25

const LEDGER_KEY = 'graphtv:v1:omdb:request-ledger'
const LEGACY_CACHE_PATTERN = /^graphtv:v1:align\d+:omdb:episode:/u
const LEGACY_CACHE_CLEANUP_KEY = 'graphtv:v1:omdb:episode-cache-cleaned'

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

function removeLegacyVoteCache(storage) {
  if (!storage || readJson(storage, LEGACY_CACHE_CLEANUP_KEY)) {
    return
  }

  try {
    const keys = Array.from({ length: storage.length ?? 0 }, (_, index) =>
      storage.key(index)
    )
    keys
      .filter((key) => LEGACY_CACHE_PATTERN.test(key))
      .forEach((key) => removeItem(storage, key))
    writeJson(storage, LEGACY_CACHE_CLEANUP_KEY, true)
  } catch {
    // Old cache cleanup is best-effort; the entries expire naturally if storage is restricted.
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
    (error?.provider === 'omdb' &&
      (error?.code === 'quota' || error?.code === 'auth'))
  )
}

function getPendingOmdbRating(episode, primarySource) {
  const imdbId = episode.sourceIds?.omdb
  const omdbRating = episode.ratings?.find((rating) => rating.source === 'omdb')
  const trustedMatch =
    primarySource === 'omdb' || omdbRating?.provenance?.confidence === 'strong'

  return imdbId &&
    omdbRating &&
    trustedMatch &&
    !Number.isFinite(omdbRating.votes) &&
    omdbRating.votesStatus !== 'unavailable'
    ? omdbRating
    : null
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
  const failureCache = new Map()
  const inFlight = new Map()
  const controllers = new Set()
  let requests = 0
  let cacheHits = 0
  let disabledReason = null
  removeLegacyVoteCache(storage)

  function reserveRequest() {
    if (disabledReason) {
      throw new Error(disabledReason)
    }
    if (requests >= viewLimit) {
      throw new Error(
        'OMDb episode-detail request limit reached for this page view.'
      )
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
    const omdbRating = getPendingOmdbRating(episode, primarySource)
    if (!omdbRating) {
      return episode
    }
    const imdbId = episode.sourceIds.omdb
    if (!expectedSeriesId) {
      throw new Error(
        'An expected IMDb series ID is required for OMDb episode details.'
      )
    }
    if (disabledReason) {
      throw new Error(disabledReason)
    }

    if (inFlight.has(imdbId)) {
      return mergeOmdbVotes(episode, await inFlight.get(imdbId))
    }

    const recentFailure = failureCache.get(imdbId)
    if (recentFailure && recentFailure.expiresAt > now()) {
      throw recentFailure.error
    }
    failureCache.delete(imdbId)

    const controller = new AbortController()
    controllers.add(controller)
    const request = loadProvider('omdb')
      .then((provider) =>
        provider.getEpisodeVoteCount(imdbId, {
          expectedSeriesId,
          signal: controller.signal,
          beforeNetwork: reserveRequest,
          onCacheHit: () => {
            cacheHits += 1
          }
        })
      )
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
  load.needsLoad = (episode) =>
    Boolean(getPendingOmdbRating(episode, primarySource))
  load.destroy = () => {
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  }

  return load
}
