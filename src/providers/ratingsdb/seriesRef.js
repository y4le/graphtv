const TCONST_REF = /^tt[0-9]+$/u
const ALIAS_REF = /^(?:imdb|tvmaze|tmdb):[a-z0-9]+$/iu

export function isTconst(value) {
  return typeof value === 'string' && TCONST_REF.test(value)
}

export function isSeriesRef(value) {
  return (
    typeof value === 'string' &&
    (TCONST_REF.test(value) || ALIAS_REF.test(value))
  )
}

export function assertSeriesRef(value) {
  if (!isSeriesRef(value)) {
    throw new Error(`Invalid RatingsDB series reference: ${String(value)}`)
  }

  return value
}
