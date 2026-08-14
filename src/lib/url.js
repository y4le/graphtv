export function getUrlParams() {
  return new URLSearchParams(window.location.search)
}

export function buildUrl(params) {
  const url = new URL(window.location.href)
  url.search = params.toString()
  return url.toString()
}

export function preserveDebugParams(targetParams) {
  const currentParams = getUrlParams()

  for (const key of ['debug', 'api']) {
    if (currentParams.has(key) && !targetParams.has(key)) {
      targetParams.set(key, currentParams.get(key))
    }
  }

  return targetParams
}

export function normalizeLegacyParams() {
  const params = getUrlParams()

  if (!params.has('show')) {
    if (params.has('t')) {
      params.set('show', `tmdb:${params.get('t')}`)
      params.delete('t')
    } else if (params.has('i')) {
      params.set('show', `omdb:${params.get('i')}`)
      params.delete('i')
    }
  }

  return params
}
