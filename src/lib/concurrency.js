import { isAbortError } from './abort.js'

function assertConcurrency(limit) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('Concurrency must be a positive integer.')
  }
}

export async function mapWithConcurrency(items, limit, mapper) {
  assertConcurrency(limit)

  const values = Array.from(items)
  const results = Array(values.length)
  let nextIndex = 0
  let failure = null

  async function worker() {
    while (!failure) {
      const index = nextIndex
      nextIndex += 1

      if (index >= values.length) {
        return
      }

      try {
        results[index] = await mapper(values[index], index)
      } catch (error) {
        failure ??= error
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker())
  )

  if (failure) {
    throw failure
  }

  return results
}

export function mapSettledWithConcurrency(items, limit, mapper) {
  return mapWithConcurrency(items, limit, async (item, index) => {
    try {
      return {
        status: 'fulfilled',
        value: await mapper(item, index)
      }
    } catch (reason) {
      if (isAbortError(reason)) {
        throw reason
      }

      return { status: 'rejected', reason }
    }
  })
}
