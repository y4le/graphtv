const OPAQUE_NETWORK_MESSAGE =
  /load failed|failed to fetch|networkerror|network request failed/iu

function getBrowserEnvironment() {
  if (typeof navigator === 'undefined') {
    return null
  }

  return {
    online:
      typeof navigator.onLine === 'boolean' ? navigator.onLine : undefined,
    userAgent: navigator.userAgent || undefined
  }
}

function getRequestContext(descriptor, rawUrl) {
  try {
    const target = new URL(rawUrl)
    const appOrigin =
      typeof window === 'undefined' ? null : window.location?.origin

    return {
      provider: descriptor.provider,
      kind: descriptor.kind,
      endpoint: target.origin,
      crossOrigin: appOrigin ? target.origin !== appOrigin : undefined
    }
  } catch {
    return {
      provider: descriptor.provider,
      kind: descriptor.kind
    }
  }
}

function classifyError(error) {
  if (error?.name === 'AbortError') {
    return 'aborted'
  }
  if (error?.code === 'auth' || error?.code === 'quota') {
    return 'provider-response'
  }
  if (Number.isFinite(error?.status)) {
    return 'http-response'
  }
  if (error?.name === 'SyntaxError') {
    return 'invalid-response'
  }
  if (error?.name === 'TypeError') {
    return OPAQUE_NETWORK_MESSAGE.test(error.message ?? '')
      ? 'opaque-network-failure'
      : 'network-failure'
  }
  return 'provider-error'
}

function diagnosticHint(category, environment) {
  if (category !== 'opaque-network-failure') {
    return undefined
  }
  if (environment?.online === false) {
    return 'The browser reports that this device is offline.'
  }

  return 'The browser did not expose the network cause. Check content blockers or privacy extensions first; CORS, DNS, TLS, and connectivity failures can look identical here.'
}

export function attachRequestContext(error, descriptor, rawUrl) {
  const diagnosedError =
    error && typeof error === 'object' ? error : new Error(String(error))

  diagnosedError.provider ??= descriptor.provider
  diagnosedError.requestContext = getRequestContext(descriptor, rawUrl)
  return diagnosedError
}

export function createErrorDiagnostic(error, context = {}) {
  const name = error?.name ?? 'Error'
  const message = error?.message ?? String(error)
  const category = classifyError(error)
  const environment = getBrowserEnvironment()
  const diagnostic = {
    category,
    name,
    message,
    provider:
      context.provider ?? error?.provider ?? error?.requestContext?.provider,
    operation: context.operation,
    code: error?.code,
    status: Number.isFinite(error?.status) ? error.status : undefined,
    cause:
      error?.cause?.message ??
      (error?.cause == null ? undefined : String(error.cause)),
    request: error?.requestContext,
    environment,
    hint: diagnosticHint(category, environment)
  }

  return Object.fromEntries(
    Object.entries(diagnostic).filter(([, value]) => value !== undefined)
  )
}
