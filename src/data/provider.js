import { mergeShowRecords } from './merge.js'

const PROVIDER_LOADERS = {
  omdb: () => import('../providers/omdb/transport.js'),
  testdb: () => import('../providers/testdb/index.js'),
  tmdb: () => import('../providers/tmdb/transport.js'),
  tvmaze: () => import('../providers/tvmaze/transport.js')
}

const DEFAULT_PROVIDER = 'tvmaze'

export function parseShowRef(showRef) {
  const [provider, ...idParts] = showRef.split(':')

  if (!provider || idParts.length === 0) {
    throw new Error(`Invalid show reference: ${showRef}`)
  }

  return {
    provider,
    id: idParts.join(':')
  }
}

export function getActiveProvider(urlParams = new URLSearchParams(window.location.search)) {
  return urlParams.get('api') || DEFAULT_PROVIDER
}

export async function loadProvider(providerName) {
  const loader = PROVIDER_LOADERS[providerName]

  if (!loader) {
    throw new Error(`Unknown provider: ${providerName}`)
  }

  return loader()
}

export async function searchShows(query, providerName = DEFAULT_PROVIDER) {
  const provider = await loadProvider(providerName)
  return provider.search(query)
}

async function loadProviderRecord(showRef) {
  const { provider, id } = parseShowRef(showRef)
  const transport = await loadProvider(provider)
  const show = await transport.getShow(id)
  const seasons = await transport.getSeasons(id, show.totalSeasons)
  return { provider, show, seasons }
}

async function loadSupplementalRecord(primaryRecord, providerName) {
  if (providerName === primaryRecord.provider) {
    return null
  }

  try {
    const provider = await loadProvider(providerName)
    const resolvedRef = await provider.resolveShowRef({
      externalIds: primaryRecord.show.externalIds,
      show: primaryRecord.show
    })

    if (!resolvedRef) {
      return null
    }

    const { id } = parseShowRef(resolvedRef)
    const show = await provider.getShow(id)
    const seasons = await provider.getSeasons(id, show.totalSeasons)

    return {
      provider: providerName,
      show,
      seasons
    }
  } catch {
    return null
  }
}

export async function getShowBundle(showRef, options = {}) {
  const { compareProviders = ['tmdb', 'omdb'] } = options
  const primaryRecord = await loadProviderRecord(showRef)
  const supplementalRecords = (
    await Promise.all(compareProviders.map((providerName) => loadSupplementalRecord(primaryRecord, providerName)))
  ).filter(Boolean)

  return mergeShowRecords(primaryRecord, supplementalRecords)
}
