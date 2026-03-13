import { mergeShowRecords } from './merge.js'

const PROVIDER_LOADERS = {
  omdb: () => import('../providers/omdb/transport.js'),
  testdb: () => import('../providers/testdb/index.js'),
  tmdb: () => import('../providers/tmdb/transport.js'),
  tvmaze: () => import('../providers/tvmaze/transport.js')
}

const DEFAULT_PROVIDER = 'tvmaze'
const PROVIDER_META = {
  omdb: {
    label: 'OMDb',
    requiresEnv: 'VITE_OMDB_API_KEY'
  },
  testdb: {
    label: 'Fixture DB',
    alwaysAvailable: true
  },
  tmdb: {
    label: 'TMDB',
    requiresEnv: 'VITE_TMDB_BEARER_TOKEN'
  },
  tvmaze: {
    label: 'TVmaze',
    alwaysAvailable: true
  }
}

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

export function getProviderLabel(providerName) {
  return PROVIDER_META[providerName]?.label ?? providerName
}

export function isProviderConfigured(providerName) {
  const meta = PROVIDER_META[providerName]

  if (!meta) {
    return false
  }

  if (meta.alwaysAvailable) {
    return true
  }

  return Boolean(import.meta.env[meta.requiresEnv])
}

export function getProviderCatalog() {
  return Object.entries(PROVIDER_META).map(([provider, meta]) => ({
    provider,
    label: meta.label,
    configured: isProviderConfigured(provider)
  }))
}

export function getComparisonProviders(primaryProvider) {
  return Object.keys(PROVIDER_LOADERS).filter(
    (provider) => provider !== primaryProvider && provider !== 'testdb' && isProviderConfigured(provider)
  )
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
    return {
      provider: providerName,
      status: 'skipped',
      reason: 'same-as-primary'
    }
  }

  try {
    const provider = await loadProvider(providerName)
    const resolvedRef = await provider.resolveShowRef({
      externalIds: primaryRecord.show.externalIds,
      show: primaryRecord.show
    })

    if (!resolvedRef) {
      return {
        provider: providerName,
        status: 'unresolved',
        reason: 'no-cross-provider-match'
      }
    }

    const { id } = parseShowRef(resolvedRef)
    const show = await provider.getShow(id)
    const seasons = await provider.getSeasons(id, show.totalSeasons)

    return {
      provider: providerName,
      status: 'loaded',
      record: {
        provider: providerName,
        show,
        seasons
      }
    }
  } catch (error) {
    return {
      provider: providerName,
      status: 'failed',
      reason: error.message
    }
  }
}

export async function getShowBundle(showRef, options = {}) {
  const { provider: primaryProvider } = parseShowRef(showRef)
  const { compareProviders = getComparisonProviders(primaryProvider) } = options
  const primaryRecord = await loadProviderRecord(showRef)
  const providerDiagnostics = await Promise.all(
    compareProviders.map((providerName) => loadSupplementalRecord(primaryRecord, providerName))
  )
  const supplementalRecords = providerDiagnostics
    .filter((item) => item.status === 'loaded')
    .map((item) => item.record)

  return {
    ...mergeShowRecords(primaryRecord, supplementalRecords),
    providerDiagnostics
  }
}
