import { mergeShowRecords } from './merge.js'
import { createEpisodeDetailLoader as createDetailLoader } from './episodeDetails.js'
import { CLIENT_SECRET_KEYS, hasClientSecret } from '../config/clientSecrets.js'
import { isConfigured as isRatingsdbConfigured } from '../config/ratingsdb.js'
import { createErrorDiagnostic } from './errorDiagnostics.js'
import { forwardAbort, isAbortError } from '../lib/abort.js'
import { DEFAULT_PROVIDER, parseShowRef } from './showRef.js'

export {
  DEFAULT_PROVIDER,
  getActiveProvider,
  parseShowRef,
  resolveActiveShowRef
} from './showRef.js'

const PROVIDER_LOADERS = {
  omdb: () => import('../providers/omdb/transport.js'),
  tmdb: () => import('../providers/tmdb/transport.js'),
  tvmaze: () => import('../providers/tvmaze/transport.js'),
  ratingsdb: () => import('../providers/ratingsdb/transport.js')
}

const PROVIDER_META = {
  omdb: {
    label: 'OMDb',
    requiresSecret: CLIENT_SECRET_KEYS.omdb
  },
  tmdb: {
    label: 'TMDB',
    requiresSecret: CLIENT_SECRET_KEYS.tmdb
  },
  tvmaze: {
    label: 'TVmaze',
    alwaysAvailable: true
  },
  ratingsdb: {
    label: 'RatingsDB',
    isConfigured: isRatingsdbConfigured,
    standalone: true,
    access: 'self-hosted',
    requirement: 'VITE_RATINGSDB_API_BASE'
  }
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

  if (meta.isConfigured) {
    return meta.isConfigured()
  }

  return hasClientSecret(meta.requiresSecret)
}

export function getProviderCatalog() {
  return Object.entries(PROVIDER_META).map(([provider, meta]) => ({
    provider,
    label: meta.label,
    configured: isProviderConfigured(provider),
    access: meta.access ?? (meta.alwaysAvailable ? 'public' : 'client-keyed'),
    requirement:
      meta.requirement ?? (meta.alwaysAvailable ? 'none' : meta.requiresSecret)
  }))
}

export function getComparisonProviders(primaryProvider) {
  if (PROVIDER_META[primaryProvider]?.standalone) {
    return []
  }

  return Object.keys(PROVIDER_LOADERS).filter(
    (provider) =>
      provider !== primaryProvider &&
      !PROVIDER_META[provider]?.standalone &&
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

async function loadPrimaryShow(showRef, providerLoader, signal) {
  const { provider, id } = parseShowRef(showRef)
  const transport = await providerLoader(provider)
  const show = await transport.getShow(id, { signal })
  return { provider, id, show, transport }
}

async function loadProviderRecord(primaryShow, signal) {
  const { provider, id, show, transport } = primaryShow
  const seasonResult = unpackSeasons(
    await transport.getSeasons(id, show.totalSeasons, { signal })
  )
  return { provider, show, ...seasonResult }
}

async function loadSupplementalRecord(
  primaryRecord,
  providerName,
  providerLoader,
  signal
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

  let operation = 'load-provider'
  try {
    const provider = await providerLoader(providerName)
    operation = 'resolve-show'
    const resolvedRef = await provider.resolveShowRef(
      {
        externalIds: primaryRecord.show.externalIds,
        show: primaryRecord.show
      },
      { signal }
    )

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
    operation = 'load-show'
    const show = await provider.getShow(id, { signal })
    operation = 'load-seasons'
    const seasonResult = unpackSeasons(
      await provider.getSeasons(id, show.totalSeasons, { signal })
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
    if (signal?.aborted || isAbortError(error)) {
      throw signal?.reason ?? error
    }

    return {
      provider: providerName,
      role: 'supplemental',
      status: 'failed',
      reason: error.message,
      error: createErrorDiagnostic(error, {
        provider: providerName,
        operation
      }),
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
  const streamController = new AbortController()
  const stopForwardingAbort = forwardAbort(options.signal, streamController)
  const { signal } = streamController

  try {
    const primaryShow = await loadPrimaryShow(showRef, providerLoader, signal)
    signal.throwIfAborted()

    yield {
      phase: 'show',
      provider: primaryProvider,
      show: primaryShow.show,
      pendingProviders: [...compareProviders],
      complete: false
    }

    const supplementalDiagnostics = Array(compareProviders.length)
    const primaryRecordPromise = loadProviderRecord(primaryShow, signal)
    const settledQueue = []
    let notifySettlement = null
    const pending = new Map(
      compareProviders.map((providerName, index) => [
        index,
        loadSupplementalRecord(
          primaryShow,
          providerName,
          providerLoader,
          signal
        ).then(
          (diagnostic) => {
            settledQueue.push({ diagnostic, index, provider: providerName })
            notifySettlement?.()
            notifySettlement = null
          },
          (error) => {
            settledQueue.push({ error, index, provider: providerName })
            notifySettlement?.()
            notifySettlement = null
          }
        )
      ])
    )
    const primaryRecord = await primaryRecordPromise
    signal.throwIfAborted()

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
      signal.throwIfAborted()

      if (settled.error) {
        throw settled.error
      }

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
  } finally {
    stopForwardingAbort()
    streamController.abort()
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
