import { isProviderConfigured, loadProvider } from './provider.js'

export const SEARCH_PAGE_COLLECTIONS = Object.freeze([
  Object.freeze({
    id: 'trending',
    title: 'Trending this week',
    transportMethod: 'getTrendingShows'
  }),
  Object.freeze({
    id: 'popular',
    title: 'Popular',
    transportMethod: 'getPopularShows'
  })
])

export function canLoadSearchCollections(isConfigured = isProviderConfigured) {
  return isConfigured('tmdb')
}

export async function loadSearchCollections({
  signal,
  isConfigured = isProviderConfigured,
  providerLoader = loadProvider
} = {}) {
  if (!canLoadSearchCollections(isConfigured)) {
    return SEARCH_PAGE_COLLECTIONS.map((collection) => ({
      ...collection,
      status: 'unavailable',
      shows: []
    }))
  }

  let transport
  try {
    transport = await providerLoader('tmdb')
  } catch (error) {
    return SEARCH_PAGE_COLLECTIONS.map((collection) =>
      createFailedCollection(collection, error)
    )
  }

  const settled = await Promise.allSettled(
    SEARCH_PAGE_COLLECTIONS.map((collection) => {
      const load = transport[collection.transportMethod]
      if (typeof load !== 'function') {
        return Promise.reject(
          new Error(`TMDB does not support ${collection.id} collections.`)
        )
      }
      return load({ signal })
    })
  )

  return SEARCH_PAGE_COLLECTIONS.map((collection, index) => {
    const result = settled[index]
    if (result.status === 'fulfilled') {
      return {
        ...collection,
        status: 'ready',
        shows: Array.isArray(result.value) ? result.value : []
      }
    }
    return createFailedCollection(collection, result.reason)
  })
}

function createFailedCollection(collection, error) {
  return {
    ...collection,
    status: error?.name === 'AbortError' ? 'aborted' : 'error',
    shows: [],
    reason: error?.message ?? String(error)
  }
}
