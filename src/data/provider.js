import { mergeShowRecords } from './merge.js'
import { createEpisodeDetailLoader as createDetailLoader } from './episodeDetails.js'
import { CLIENT_SECRET_KEYS, hasClientSecret } from '../config/clientSecrets.js'

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
    requiresSecret: CLIENT_SECRET_KEYS.omdb
  },
  testdb: {
    label: 'Fixture DB',
    alwaysAvailable: true
  },
  tmdb: {
    label: 'TMDB',
    requiresSecret: CLIENT_SECRET_KEYS.tmdb
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

export function getActiveProvider(
  urlParams = new URLSearchParams(window.location.search)
) {
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

  return hasClientSecret(meta.requiresSecret)
}

export function getProviderCatalog() {
  return Object.entries(PROVIDER_META).map(([provider, meta]) => ({
    provider,
    label: meta.label,
    configured: isProviderConfigured(provider),
    access: meta.alwaysAvailable ? 'public' : 'client-keyed',
    requirement: meta.alwaysAvailable ? 'none' : meta.requiresSecret
  }))
}

export function getComparisonProviders(primaryProvider) {
  return Object.keys(PROVIDER_LOADERS).filter(
    (provider) =>
      provider !== primaryProvider &&
      provider !== 'testdb' &&
      isProviderConfigured(provider)
  )
}

export async function loadProvider(providerName) {
  const loader = PROVIDER_LOADERS[providerName]

  if (!loader) {
    throw new Error(`Unknown provider: ${providerName}`)
  }

  return loader()
}

export async function searchShows(
  query,
  providerName = DEFAULT_PROVIDER,
  options = {}
) {
  const provider = await loadProvider(providerName)
  return provider.search(query, options)
}

export function createEpisodeDetailLoader(options = {}) {
  return createDetailLoader({
    ...options,
    loadProvider
  })
}

function unpackSeasons(result) {
  if (Array.isArray(result)) {
    return { seasons: result, seasonDiagnostics: null }
  }
  if (!result || !Array.isArray(result.seasons)) {
    throw new Error('Provider returned invalid season data.')
  }

  return {
    seasons: result.seasons,
    seasonDiagnostics: result.diagnostics ?? null
  }
}

async function loadPrimaryShow(showRef, providerLoader) {
  const { provider, id } = parseShowRef(showRef)
  const transport = await providerLoader(provider)
  const show = await transport.getShow(id)
  return { provider, id, show, transport }
}

async function loadProviderRecord(primaryShow) {
  const { provider, id, show, transport } = primaryShow
  const seasonResult = unpackSeasons(
    await transport.getSeasons(id, show.totalSeasons)
  )
  return { provider, show, ...seasonResult }
}

async function loadSupplementalRecord(
  primaryRecord,
  providerName,
  providerLoader
) {
  if (providerName === primaryRecord.provider) {
    return {
      provider: providerName,
      role: 'supplemental',
      status: 'skipped',
      reason: 'same-as-primary',
      seasonDiagnostics: null
    }
  }

  try {
    const provider = await providerLoader(providerName)
    const resolvedRef = await provider.resolveShowRef({
      externalIds: primaryRecord.show.externalIds,
      show: primaryRecord.show
    })

    if (!resolvedRef) {
      return {
        provider: providerName,
        role: 'supplemental',
        status: 'unresolved',
        reason: 'no-cross-provider-match',
        seasonDiagnostics: null
      }
    }

    const { id } = parseShowRef(resolvedRef)
    const show = await provider.getShow(id)
    const seasonResult = unpackSeasons(
      await provider.getSeasons(id, show.totalSeasons)
    )

    return {
      provider: providerName,
      role: 'supplemental',
      status: 'loaded',
      seasonDiagnostics: seasonResult.seasonDiagnostics,
      record: {
        provider: providerName,
        show,
        seasons: seasonResult.seasons
      }
    }
  } catch (error) {
    return {
      provider: providerName,
      role: 'supplemental',
      status: 'failed',
      reason: error.message,
      seasonDiagnostics: error.seasonDiagnostics ?? null
    }
  }
}

function mergeProviderRecords(primaryRecord, supplementalDiagnostics) {
  const supplementalRecords = supplementalDiagnostics
    .filter((item) => item.status === 'loaded')
    .map((item) => item.record)
  const providerDiagnostics = [
    ...(primaryRecord.seasonDiagnostics
      ? [
          {
            provider: primaryRecord.provider,
            role: 'primary',
            status: 'loaded',
            seasonDiagnostics: primaryRecord.seasonDiagnostics
          }
        ]
      : []),
    ...supplementalDiagnostics
  ]

  return {
    ...mergeShowRecords(primaryRecord, supplementalRecords),
    providerDiagnostics
  }
}

export async function* streamShowBundle(showRef, options = {}) {
  const { provider: primaryProvider } = parseShowRef(showRef)
  const {
    compareProviders = getComparisonProviders(primaryProvider),
    providerLoader = loadProvider
  } = options
  const primaryShow = await loadPrimaryShow(showRef, providerLoader)

  yield {
    phase: 'show',
    provider: primaryProvider,
    show: primaryShow.show,
    pendingProviders: [...compareProviders],
    complete: false
  }

  const supplementalDiagnostics = Array(compareProviders.length)
  const primaryRecordPromise = loadProviderRecord(primaryShow)
  const settledQueue = []
  let notifySettlement = null
  const pending = new Map(
    compareProviders.map((providerName, index) => [
      index,
      loadSupplementalRecord(primaryShow, providerName, providerLoader).then(
        (diagnostic) => {
          settledQueue.push({ diagnostic, index, provider: providerName })
          notifySettlement?.()
          notifySettlement = null
        }
      )
    ])
  )
  const primaryRecord = await primaryRecordPromise

  yield {
    phase: 'primary',
    provider: primaryProvider,
    bundle: mergeProviderRecords(primaryRecord, []),
    pendingProviders: [...compareProviders],
    complete: pending.size === 0
  }

  while (pending.size > 0) {
    if (settledQueue.length === 0) {
      await new Promise((resolve) => {
        notifySettlement = resolve
      })
    }
    const settled = settledQueue.shift()
    pending.delete(settled.index)
    supplementalDiagnostics[settled.index] = settled.diagnostic

    yield {
      phase: 'supplemental',
      provider: settled.provider,
      diagnostic: settled.diagnostic,
      bundle: mergeProviderRecords(
        primaryRecord,
        supplementalDiagnostics.filter(Boolean)
      ),
      pendingProviders: Array.from(
        pending.keys(),
        (index) => compareProviders[index]
      ),
      complete: pending.size === 0
    }
  }
}

export async function getShowBundle(showRef, options = {}) {
  let bundle = null

  for await (const snapshot of streamShowBundle(showRef, options)) {
    bundle = snapshot.bundle ?? bundle
  }

  if (!bundle) {
    throw new Error('Provider returned no show data.')
  }

  return bundle
}
