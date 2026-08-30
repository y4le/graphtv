const MAX_ENTRIES = 8

const bundles = new Map()

export function readMemoizedBundle(key) {
  const bundle = bundles.get(key)
  if (bundle === undefined) {
    return undefined
  }

  bundles.delete(key)
  bundles.set(key, bundle)
  return bundle
}

export function memoizeBundle(key, bundle) {
  bundles.delete(key)
  bundles.set(key, bundle)

  while (bundles.size > MAX_ENTRIES) {
    bundles.delete(bundles.keys().next().value)
  }
}

export function clearBundleMemo() {
  bundles.clear()
}

export function getBundleMemoSize() {
  return bundles.size
}
