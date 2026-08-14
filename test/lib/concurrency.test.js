import { describe, expect, it } from 'vitest'

import {
  mapSettledWithConcurrency,
  mapWithConcurrency
} from '../../src/lib/concurrency.js'

describe('bounded concurrency', () => {
  it('limits active work and preserves input order', async () => {
    let active = 0
    let maximumActive = 0
    let started = 0
    const releases = []
    const work = mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      started += 1
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => releases.push(resolve))
      active -= 1
      return value * 10
    })

    await waitFor(() => started === 2)
    while (started < 6) {
      const previousStarted = started
      releases.shift()()
      await waitFor(() => started > previousStarted)
    }
    releases.splice(0).forEach((release) => release())

    await expect(work).resolves.toEqual([10, 20, 30, 40, 50, 60])
    expect(maximumActive).toBe(2)
  })

  it('returns ordered settled results without rejecting sibling failures', async () => {
    const failure = new Error('second failed')

    await expect(
      mapSettledWithConcurrency([1, 2, 3], 2, async (value) => {
        if (value === 2) {
          throw failure
        }
        return value * 2
      })
    ).resolves.toEqual([
      { status: 'fulfilled', value: 2 },
      { status: 'rejected', reason: failure },
      { status: 'fulfilled', value: 6 }
    ])
  })

  it('treats cancellation as control flow and stops scheduling new work', async () => {
    const started = []
    const abortError = new DOMException('cancelled', 'AbortError')

    await expect(
      mapSettledWithConcurrency([1, 2, 3], 1, async (value) => {
        started.push(value)
        throw abortError
      })
    ).rejects.toBe(abortError)
    expect(started).toEqual([1])
  })

  it('rejects invalid limits and stops scheduling after a failure', async () => {
    const started = []

    await expect(
      mapWithConcurrency([1, 2, 3, 4], 1, async (value) => {
        started.push(value)
        throw new Error('failed')
      })
    ).rejects.toThrow('failed')
    expect(started).toEqual([1])

    await expect(mapWithConcurrency([], 0, async () => {})).rejects.toThrow(
      'positive integer'
    )
  })
})

async function waitFor(condition) {
  while (!condition()) {
    await Promise.resolve()
  }
}
